/**
 * ChatCore — 通用聊天面板装配器（v1.0 组件化架构核心）
 * 由 ReaderShell（论文会话）与 StandaloneShell（独立会话）通过 ChatHost 注入差异。
 * 见 docs/architecture.md「ChatCore 组件化架构」。
 *
 * S5 平移自 readerPanel/readerShell（行为等价 + host 参数化）。
 */

import { config } from "../../../package.json";
import { LLMManager } from "../llm/manager";
import { SiwcUsageLimitError, ReauthRequiredError } from "../llm/siwcAuth";
import {
  isVisionConfigured,
  describeImage,
  isVisionRejected,
  markVisionRejected,
  isVisionRelatedError,
} from "../llm/visionRouter";
import {
  getHistoryByScope,
  saveSessionByScope,
  loadSessionsByScope,
  getActiveNoteIDByScope,
  setActiveNoteIDByScope,
  escapeHtml,
} from "./sessionStore";
import type { SessionMeta } from "./sessionStore";
import type { ChatHost, ChatHandle, SessionScope } from "./types";
import { setMarkdown } from "./markdown";
import {
  appendMessage,
  scrollToBottom,
  appendTruncationHint,
  getProviderDisplayName,
  getConfiguredProviders,
  maybeShowSiwcWelcome,
  getParamsBadgeText,
  showParamsPopover,
  showProviderDropdown,
} from "../ui/chatWidgets";
import type { ContentPart } from "../llm/provider";

// ── 面板挂载 ────────────────────────────────────────────────────────────────

export async function mountChatPanel(
  doc: Document,
  host: ChatHost,
  mountEl: HTMLElement,
): Promise<ChatHandle> {
  mountEl.textContent = "";

  // 当前激活模型
  const providerId = LLMManager.getInstance().getActiveProviderName();
  const providerName = getProviderDisplayName(providerId);
  const modelName =
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.llm.${providerId}.model`,
      true,
    ) as string) ?? "unknown";

  // 徽章文本安全计算：任何异常都不应导致整个面板空白
  let badgeText = "T: ?";
  try {
    badgeText = getParamsBadgeText();
  } catch (e) {
    try {
      Zotero.Prefs.set(
        `${config.prefsPrefix}.debug.badgeError`,
        String((e as Error)?.stack ?? e),
        true,
      );
    } catch {
      /* ignore */
    }
  }

  // 能力化模板：reader 专属按钮/chip 仅在对应 capability 开启时渲染
  const cap = host.capabilities;
  const actionsHtml = [
    cap.summarize
      ? `<div class="pw-action-btn" role="button" tabindex="0" data-action="summarize">总结全文</div>`
      : "",
    cap.selectionChip
      ? `<div class="pw-action-btn" role="button" tabindex="0" data-action="quote">选择文本</div>`
      : "",
    cap.screenshot
      ? `<div class="pw-action-btn" role="button" tabindex="0" data-action="screenshot" title="框选区域，截图附加到消息">框选区域</div>`
      : "",
    cap.mineru
      ? `<div class="pw-action-btn pw-mineru-btn" role="button" tabindex="0" data-action="mineru" style="display:none">⚡ 精细提取</div>`
      : "",
  ]
    .filter(Boolean)
    .join("\n      ");
  const selectionChipHtml = cap.selectionChip
    ? `
    <div class="pw-selection-chip pw-hidden">
      <span class="pw-chip-label">引用</span>
      <span class="pw-chip-text"></span>
      <div class="pw-chip-close pw-sel-chip-close" role="button" tabindex="0">×</div>
    </div>`
    : "";
  const mineruProgressHtml = cap.mineru
    ? `
    <!-- MinerU 精细提取进度条 -->
    <div class="pw-pdf-progress" style="display: none;">
      <div class="pw-progress-bar">
        <div class="pw-progress-fill" style="width: 0%"></div>
      </div>
      <div class="pw-progress-text">准备解析...</div>
    </div>`
    : "";

  // 用一个容器包裹 <style> + 面板，避免 CSS 作用域问题
  const wrapper = doc.createElement("div");
  wrapper.innerHTML = `
<style>
${CHAT_CSS}
</style>
<div class="pw-panel">
  <div class="pw-sticky-top">
    <div class="pw-header">
      <div class="pw-header-left">
        <div class="pw-model-dropdown-trigger" role="button" tabindex="0">
          <span class="pw-model-text">${escapeHtml(providerName)} · ${escapeHtml(modelName)}</span>
          <span class="pw-dropdown-arrow">▼</span>
        </div>
        <div class="pw-temp-trigger" role="button" tabindex="0" title="Temperature &amp; Max Tokens">
          <span class="pw-temp-text">${badgeText}</span>
          <span class="pw-dropdown-arrow">▼</span>
        </div>
        <span class="pw-siwc-chip" role="button" tabindex="0" hidden="true"
          title="Using ChatGPT plan — 点击管理用量">ChatGPT 订阅</span>
      </div>
      <div class="pw-sessions-btn" role="button" tabindex="0">会话列表</div>
    </div>
    ${mineruProgressHtml}
    <div class="pw-actions">
      ${actionsHtml}
    </div>
  </div>
  <div class="pw-messages"></div>
  <div class="pw-input-area">
    ${selectionChipHtml}
    <div class="pw-screenshot-chip pw-hidden">
      <span class="pw-chip-label">图片</span>
      <img class="pw-screenshot-thumb" alt="图片预览" />
      <div class="pw-chip-close pw-img-chip-close" role="button" tabindex="0">×</div>
    </div>
    <textarea class="pw-input" rows="3" placeholder="输入问题… Enter 发送，Shift+Enter 换行，↑ 回填上一条"></textarea>
    <div class="pw-send-btn" role="button" tabindex="0">发送 ↑ (Enter)</div>
  </div>
</div>`;
  mountEl.appendChild(wrapper);

  const panel = wrapper.querySelector(".pw-panel") as HTMLElement;
  const messagesEl = panel.querySelector(".pw-messages") as HTMLElement;

  // 自定义快捷按钮：按 pref 动态渲染（0 个则不渲染任何额外按钮）
  renderCustomActionButtons(doc, panel);

  if (getHistoryByScope(host.scope).getAll().length > 0) {
    // 内存中有活跃对话，直接渲染（滚动位置由 Shell 的 onItemChange 统一处理）
    renderChatHistory(doc, messagesEl, host.scope);
  } else {
    // 内存为空，检查 Zotero 中是否有历史会话
    const sessions = await loadSessionsByScope(host.scope);
    if (sessions.length > 0) {
      showSessionList(doc, messagesEl, sessions, host.scope);
    }
    // 无历史：空聊天界面（默认状态）
  }

  const dropdownState = { open: false };

  bindEvents(doc, panel, messagesEl, host, dropdownState);

  // 实时刷新模型徽章和温度徽章：每秒从 prefs 读取当前配置，有变化才更新 DOM
  // createHTMLDocument 场景 defaultView 为 null：定时器回退主窗口
  const win = (doc.defaultView ?? Zotero.getMainWindow()) as any;
  const badge = panel.querySelector(".pw-model-text") as HTMLElement;
  const tempBadge = panel.querySelector(".pw-temp-text") as HTMLElement;

  // 自定义按钮 pref 基线（每秒比对，变更即重渲染）
  let lastCustomButtonsRaw = getCustomButtonsRaw();

  const badgeTimer = win.setInterval(() => {
    if (dropdownState.open) return; // 下拉打开时跳过，避免干扰用户选择

    const pName = LLMManager.getInstance().getActiveProviderName();
    const mName =
      (Zotero.Prefs.get(
        `${config.prefsPrefix}.llm.${pName}.model`,
        true,
      ) as string) ?? "unknown";
    const displayName = getProviderDisplayName(pName);
    const next = `${displayName} · ${mName}`;
    if (badge.textContent !== next) badge.textContent = next;

    const tNext = getParamsBadgeText();
    if (tempBadge.textContent !== tNext) tempBadge.textContent = tNext;

    // ChatGPT 订阅通道：常驻"Using ChatGPT plan"标识（官方 UI 规范），点击管理用量
    const siwcChip = panel.querySelector(".pw-siwc-chip") as HTMLElement | null;
    if (siwcChip) siwcChip.hidden = pName !== "openai-siwc";

    // 自定义按钮实时同步：设置页修改后 1s 内重渲染
    const curCustom = getCustomButtonsRaw();
    if (curCustom !== lastCustomButtonsRaw) {
      lastCustomButtonsRaw = curCustom;
      renderCustomActionButtons(doc, panel);
    }
  }, 1000);

  // 面板重建（mountEl.textContent=""）时自动清理定时器
  new win.MutationObserver((_: MutationRecord[], obs: MutationObserver) => {
    if (!badge.isConnected) {
      win.clearInterval(badgeTimer);
      obs.disconnect();
    }
  }).observe(mountEl, { childList: true });

  return { panel, messagesEl };
}

// ── 事件绑定 ─────────────────────────────────────────────────────────────────

function bindEvents(
  doc: Document,
  panel: HTMLElement,
  messagesEl: HTMLElement,
  host: ChatHost,
  dropdownState: { open: boolean },
) {
  const textarea = panel.querySelector(".pw-input") as HTMLTextAreaElement;
  const sendBtn = panel.querySelector(".pw-send-btn") as HTMLElement;
  const sessionsBtn = panel.querySelector(".pw-sessions-btn") as HTMLElement;
  const modelTrigger = panel.querySelector(
    ".pw-model-dropdown-trigger",
  ) as HTMLElement;

  // ChatGPT 订阅标识：点击打开官方用量管理页（官方 UI 规范 Manage usage）
  const siwcChip = panel.querySelector(".pw-siwc-chip") as HTMLElement | null;
  siwcChip?.addEventListener("click", () => {
    Zotero.launchURL("https://chatgpt.com/settings/usage");
  });

  // 首次登录确认 overlay（官方 UI 规范：仅首次 sign-in 后展示一次）
  try {
    maybeShowSiwcWelcome(doc, panel);
  } catch {
    /* overlay 失败不影响主面板 */
  }

  // capturedSelection：短暂变量，在 mouseup 阶段捕获选区，
  // "选择文本"按钮读取后立即清空，避免残留到下次操作。
  let capturedSelection = "";

  // pendingSelection：用户明确附加的上下文（通过"选择文本"按钮设置），
  // 显示为 chip，发送后或用户手动关闭后清空。
  let pendingSelection = "";

  // Selection chip DOM 引用（capabilities.selectionChip=false 时不渲染，需 null 安全）
  const chip = panel.querySelector(".pw-selection-chip") as HTMLElement | null;
  const chipTextEl = panel.querySelector(".pw-chip-text") as HTMLElement | null;
  const chipClose = panel.querySelector(
    ".pw-sel-chip-close",
  ) as HTMLElement | null;

  function showChip(text: string) {
    pendingSelection = text;
    if (chipTextEl) {
      chipTextEl.textContent =
        text.length > 80 ? text.slice(0, 80) + "…" : text;
    }
    chip?.classList.remove("pw-hidden");
  }

  function clearChip() {
    pendingSelection = "";
    chip?.classList.add("pw-hidden");
    if (chipTextEl) chipTextEl.textContent = "";
  }

  chipClose?.addEventListener("click", clearChip);

  // Screenshot chip
  let pendingScreenshot: string | null = null;
  const screenshotChip = panel.querySelector(
    ".pw-screenshot-chip",
  ) as HTMLElement;
  const screenshotThumb = panel.querySelector(
    ".pw-screenshot-thumb",
  ) as HTMLImageElement;
  const imgChipClose = panel.querySelector(".pw-img-chip-close") as HTMLElement;

  function showScreenshotChip(dataUrl: string) {
    pendingScreenshot = dataUrl;
    screenshotThumb.src = dataUrl;
    screenshotChip.classList.remove("pw-hidden");
  }

  function clearScreenshotChip() {
    pendingScreenshot = null;
    screenshotThumb.src = "";
    screenshotChip.classList.add("pw-hidden");
  }

  imgChipClose.addEventListener("click", clearScreenshotChip);

  panel.addEventListener(
    "mouseup",
    () => {
      if (!host.capabilities.selectionChip || !host.getSelectedText) return;
      const sel = host.getSelectedText();
      if (sel.length >= 10) capturedSelection = sel;
    },
    true, // capture 阶段，早于任何 click/focus 处理
  );

  function doSend() {
    if (sendBtn.classList.contains("pw-disabled")) return;
    const text = textarea.value.trim();
    if (!text && !pendingScreenshot) return;
    textarea.value = "";
    textarea.style.height = "auto"; // 重置高度
    const sel = pendingSelection;
    const screenshot = pendingScreenshot;
    clearChip();
    clearScreenshotChip();
    void send(doc, messagesEl, host, text, sel, screenshot, sendBtn);
  }

  sendBtn.addEventListener("click", doSend);

  // 回填写入并同步高度/光标
  const setTextareaValue = (v: string) => {
    textarea.value = v;
    textarea.setSelectionRange(v.length, v.length);
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  };

  // capture:true 防止 Reader 层吞掉 Enter
  let historyIndex = -1; // -1 = 未在浏览历史
  textarea.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        doSend();
        return;
      }
      // 上/下键回填发送历史：仅在空框或光标位于开头时接管，避免干扰多行编辑
      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        !e.shiftKey &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        const len = sentPromptHistory.length;
        if (len === 0) return;
        const atStart =
          textarea.selectionStart === 0 && textarea.selectionEnd === 0;
        if (e.key === "ArrowUp") {
          if (!atStart && textarea.value !== "") return;
          e.preventDefault();
          e.stopPropagation();
          if (historyIndex < 0) historyIndex = len - 1;
          else if (historyIndex > 0) historyIndex--;
          setTextareaValue(sentPromptHistory[historyIndex]);
        } else if (historyIndex >= 0) {
          // ArrowDown：仅在已进入历史浏览时接管；越过最新一条则清空退出
          e.preventDefault();
          e.stopPropagation();
          if (historyIndex < len - 1) {
            historyIndex++;
            setTextareaValue(sentPromptHistory[historyIndex]);
          } else {
            historyIndex = -1;
            setTextareaValue("");
          }
        }
      }
    },
    true,
  );

  // 输入框高度自动增长；用户编辑后重置历史浏览位置
  textarea.addEventListener("input", () => {
    historyIndex = -1;
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  });

  // 粘贴图片：剪贴板含图片时挂到截图 chip（与框选区域共用后续投递链）
  textarea.addEventListener("paste", (e: ClipboardEvent) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const items = Array.from(cd.items ?? []);
    const imageItem = items.find(
      (it) => it.kind === "file" && it.type.startsWith("image/"),
    );
    if (!imageItem) return; // 纯文本粘贴走默认行为

    const file = imageItem.getAsFile();
    if (!file) return;

    // 图文混排（如从 Word 复制）时保留默认行为，文字照常插入，图片另行附加
    const hasText = items.some(
      (it) => it.kind === "string" && it.type === "text/plain",
    );
    if (!hasText) e.preventDefault();

    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result;
      if (typeof raw !== "string") return;
      void normalizeImageDataUrl(doc, raw).then((dataUrl) => {
        showScreenshotChip(dataUrl);
        textarea.focus();
      });
    };
    reader.readAsDataURL(file);
  });

  // 动作按钮统一走容器级事件代理（自定义按钮动态增删不丢监听）
  const actionsEl = panel.querySelector(".pw-actions") as HTMLElement;
  actionsEl.addEventListener("click", (e: Event) => {
    const btn = (e.target as Element).closest(
      ".pw-action-btn",
    ) as HTMLElement | null;
    if (!btn) return;

    // 自定义快捷按钮：把配置的提示词填入输入框（占位符替换由 host 决定）
    const customPrompt = btn.dataset.prompt;
    if (customPrompt !== undefined) {
      if (host.fillPrompt) {
        host.fillPrompt(textarea, customPrompt);
      } else {
        textarea.value = customPrompt;
        textarea.focus();
        textarea.setSelectionRange(
          textarea.value.length,
          textarea.value.length,
        );
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
      }
      return;
    }

    const action = btn.dataset.action ?? "";

    if (action === "screenshot") {
      host.startScreenshot?.((dataUrl) => {
        showScreenshotChip(dataUrl);
        textarea.focus();
      });
      return;
    }

    if (action === "quote") {
      // mouseup 阶段已更新 capturedSelection；若为空则降级实时读取
      const sel =
        capturedSelection.length >= 10
          ? capturedSelection
          : (host.getSelectedText?.() ?? "");
      capturedSelection = ""; // 读取后立即清空，避免残留
      if (sel.length >= 10) {
        showChip(sel);
        textarea.focus();
      } else {
        // 临时提示，2 秒后自动隐藏
        if (chipTextEl) chipTextEl.textContent = "请先在 PDF 中选中一段文字";
        chip?.classList.remove("pw-hidden");
        setTimeout(() => {
          if (!pendingSelection) chip?.classList.add("pw-hidden");
        }, 2000);
      }
      return;
    }

    // Shell 专属动作（mineru / summarize 等）
    host.handleAction?.(action, textarea, panel);
  });

  sessionsBtn.addEventListener("click", () => {
    // 若当前已在会话列表 → 若有活跃会话则返回聊天，否则不响应
    if (messagesEl.querySelector(".pw-session-list")) {
      if (getHistoryByScope(host.scope).getAll().length > 0) {
        renderChatHistory(doc, messagesEl, host.scope);
      }
      return;
    }
    // 切换到会话列表
    void loadSessionsByScope(host.scope).then((sessions) => {
      showSessionList(doc, messagesEl, sessions, host.scope);
    });
  });

  // 模型选择下拉菜单
  modelTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    showProviderDropdown(doc, panel, modelTrigger, dropdownState);
  });

  // 请求参数 popover（Temperature + Max Tokens）
  const tempTrigger = panel.querySelector(".pw-temp-trigger") as HTMLElement;
  const tempText = panel.querySelector(".pw-temp-text") as HTMLElement;
  tempTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    showParamsPopover(doc, panel, tempTrigger, tempText);
  });
}

/**
 * 归一化任意来源的图片 dataURL（粘贴板截图等）：长边超过 1024px 时等比压缩，
 * 编码为 JPEG 0.9 控制 payload 与视觉 token 消耗；任何步骤失败均原样返回，
 * 不阻塞发送。与 captureFromPDFCanvas 的压缩参数保持一致。
 */
export function normalizeImageDataUrl(
  doc: Document,
  dataUrl: string,
): Promise<string> {
  return new Promise((resolve) => {
    const img = doc.createElement("img");
    img.onload = () => {
      try {
        const MAX_SIDE = 1024;
        const longSide = Math.max(img.naturalWidth, img.naturalHeight);
        if (longSide <= MAX_SIDE) {
          resolve(dataUrl); // 已足够小，原样返回避免二次编码
          return;
        }
        const scale = MAX_SIDE / longSide;
        const canvas = doc.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      } catch (e) {
        Zotero.log(`PaperWorm: normalizeImageDataUrl failed — ${e}`, "error");
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ── 自定义快捷按钮 ────────────────────────────────────────────────────────────

/** 读取自定义按钮的 prefs 原始 JSON（供轮询比对与解析共用） */
export function getCustomButtonsRaw(): string {
  return (
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.action.customButtons`,
      true,
    ) as string) ?? "[]"
  );
}

/**
 * 按 action.customButtons 配置动态渲染自定义快捷按钮到 .pw-actions。
 * 0 个配置时不渲染任何额外按钮；名称过长由 CSS 省略号约束，不会挤压/堆叠。
 */
function renderCustomActionButtons(doc: Document, panel: HTMLElement): void {
  const actionsEl = panel.querySelector(".pw-actions");
  if (!actionsEl) return;

  // 清除旧的动态按钮（固定按钮无 data-custom-btn，不受影响）
  actionsEl
    .querySelectorAll("[data-custom-btn]")
    .forEach((el: Element) => el.remove());

  let buttons: Array<{ name: string; prompt: string }> = [];
  try {
    const parsed = JSON.parse(getCustomButtonsRaw());
    if (Array.isArray(parsed)) {
      buttons = parsed.filter(
        (b) => b && typeof b.name === "string" && typeof b.prompt === "string",
      );
    }
  } catch {
    // 配置损坏视为无自定义按钮
  }

  for (const btn of buttons) {
    const el = doc.createElement("div");
    el.className = "pw-action-btn pw-custom-btn";
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("data-custom-btn", "true");
    el.dataset.prompt = btn.prompt;
    el.textContent = btn.name;
    el.title = btn.prompt; // hover 预览完整提示词
    actionsEl.appendChild(el);
  }
}

// ── 发送 & 流式输出 ───────────────────────────────────────────────────────────

// ── 发送历史（输入框按"上"键回填，便于失败后重发）──────────────────────────
const sentPromptHistory: string[] = [];
const MAX_PROMPT_HISTORY = 50;

function pushPromptHistory(text: string): void {
  const t = text.trim();
  if (!t) return;
  // 连续重复不重复记录
  if (sentPromptHistory[sentPromptHistory.length - 1] === t) return;
  sentPromptHistory.push(t);
  if (sentPromptHistory.length > MAX_PROMPT_HISTORY) sentPromptHistory.shift();
}

async function send(
  doc: Document,
  messagesEl: HTMLElement,
  host: ChatHost,
  userText: string,
  selectedText: string,
  screenshotDataUrl: string | null,
  sendBtn: HTMLElement,
) {
  sendBtn.classList.add("pw-disabled");
  pushPromptHistory(userText);
  const history = getHistoryByScope(host.scope);

  // 若有选中文字，将其作为引用块前置到用户消息中
  const finalText = selectedText
    ? `「${selectedText}」\n\n${userText}`
    : userText;

  // 提前检查：提供商是否已配置（快速失败，避免无效提取）
  const manager = LLMManager.getInstance();
  const providerName = manager.getActiveProviderName();
  const configuredProviders = getConfiguredProviders();
  const isConfigured = configuredProviders.some(
    (p) => p.providerId === providerName,
  );

  // 展示用消息（UI 显示截图占位符或纯文本）
  const displayText = screenshotDataUrl
    ? finalText
      ? `[截图 📷] ${finalText}`
      : "[截图 📷]"
    : finalText;
  appendMessage(doc, messagesEl, "user", displayText);
  scrollToBottom(messagesEl);

  const aiEl = appendMessage(doc, messagesEl, "assistant", "");
  aiEl.classList.add("pw-msg-loading");
  scrollToBottom(messagesEl);

  if (!isConfigured) {
    aiEl.classList.remove("pw-msg-loading");
    aiEl.classList.add("pw-msg-error");
    aiEl.textContent =
      providerName === "openai-siwc"
        ? `错误：${getProviderDisplayName(providerName)} 未登录。请在 PaperWorm 设置中点击 "Continue with ChatGPT" 登录。`
        : `错误：${getProviderDisplayName(providerName)} 未配置。请在 PaperWorm 设置中添加 API Key。`;
    sendBtn.classList.remove("pw-disabled");
    return;
    // 注意：未入库历史，避免留下无 AI 响应的悬空消息
  }

  // createHTMLDocument 场景 defaultView 为 null：定时器回退主窗口
  const win = (doc.defaultView ?? Zotero.getMainWindow()) as any;

  // 构建 messages：system（含论文上下文 + 全文）+ 对话历史
  // 阶段反馈 1：首条消息可能触发全文即时索引，耗时数十秒；
  // 延迟 600ms 显示，缓存命中时不闪烁
  let systemContent: string;
  const extractTimer = host.extractingHint
    ? win.setTimeout(() => {
        aiEl.textContent = host.extractingHint!;
      }, 600)
    : null;
  try {
    systemContent = await host.buildSystemPrompt();
  } catch (error: any) {
    if (extractTimer != null) win.clearTimeout(extractTimer);
    aiEl.classList.remove("pw-msg-loading");
    aiEl.classList.add("pw-msg-error");
    aiEl.textContent = `上下文构建失败：${error.message}`;
    sendBtn.classList.remove("pw-disabled");
    return;
    // 注意：未入库历史，避免留下无 AI 响应的悬空消息
  }
  if (extractTimer != null) win.clearTimeout(extractTimer);
  aiEl.textContent = ""; // 清除提取阶段提示

  // 构建发送给 LLM 的实际消息 content（可能含 ContentPart[]）
  // 历史存储始终用纯文本，图片替换为占位符
  // 历史存储始终用纯文本，图片替换为占位符
  const historyContent = screenshotDataUrl
    ? `[截图 📷]${finalText ? "\n\n" + finalText : ""}`
    : finalText;

  // ── 图片投递三级降级：① 主模型直发(native) → ② 视觉辅助转述 → ③ 占位符提示 ──
  // ②③ 在 ① 被 API 拒绝（主模型不支持图片输入等）时于下方重发循环中触发；
  // 最终占位符仅提示识别失败，不阻塞主聊天输出
  const resolveImageContent = async (
    native: boolean,
  ): Promise<{ content: string | ContentPart[]; visionError?: string }> => {
    if (!screenshotDataUrl) return { content: finalText };
    if (native) {
      return {
        content: [
          { type: "text", text: finalText || "请分析这张截图" },
          { type: "image_url", image_url: { url: screenshotDataUrl } },
        ] as ContentPart[],
      };
    }
    if (isVisionConfigured()) {
      aiEl.textContent = "主模型无法识别图片，视觉辅助模型转述中…";
      // 等待心跳：视觉转述可能耗时数十秒（思考型模型），每秒刷新已等待时长
      let waited = 0;
      const tick = win.setInterval(() => {
        waited++;
        aiEl.textContent = `主模型无法识别图片，视觉辅助模型转述中…（已等待 ${waited}s）`;
      }, 1000);
      try {
        const desc = await describeImage(screenshotDataUrl, userText);
        return {
          content: `[图片内容描述：\n${desc}]${finalText ? `\n\n${finalText}` : ""}`,
        };
      } catch (e: any) {
        // 失败原因此前只注入模型上下文（用户不可见）——同时以可见警告呈现
        return {
          content: `[图片识别失败：视觉辅助调用出错（${e.message}）]${finalText ? `\n\n${finalText}` : ""}`,
          visionError: e?.message ?? String(e),
        };
      } finally {
        win.clearInterval(tick);
      }
    }
    return {
      content: `[图片识别失败：主模型不支持图片输入，且未配置视觉辅助模型（设置 → 视觉辅助模型）]${finalText ? `\n\n${finalText}` : ""}`,
    };
  };

  // 视觉辅助失败的可见警告（插在 AI 回复气泡之前，不打断对话）
  const showVisionError = (msg: string) => {
    const warn = doc.createElement("div");
    warn.className = "pw-msg pw-msg-error";
    warn.textContent = `⚠ 视觉辅助模型调用失败：${msg}`;
    messagesEl.insertBefore(warn, aiEl);
    scrollToBottom(messagesEl);
  };

  let resolved = await resolveImageContent(screenshotDataUrl != null);
  if (resolved.visionError) showVisionError(resolved.visionError);
  let userContent = resolved.content;

  // 提取成功后才将用户消息入库，防止异常时留下悬空历史。
  // 记录入库位置：流式失败/超时时撤回（C 修复），避免重发产生连续重复 user 消息
  const userMsgIndex = history.getAll().length;
  history.add({ role: "user", content: historyContent });

  const model =
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.llm.${providerName}.model`,
      true,
    ) as string) ?? "gpt-6.1-sol";
  const temperature = parseFloat(
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.llm.temperature`,
      true,
    ) as string) ?? "0.7",
  );
  const maxTokens = parseInt(
    (Zotero.Prefs.get(`${config.prefsPrefix}.llm.maxTokens`, true) as string) ??
      "2000",
  );
  // 推理档位：per-provider pref，存厂商原生枚举值（空 = 默认，不下发参数）
  const reasoning =
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.llm.${providerName}.reasoning`,
      true,
    ) as string) ?? "";

  let fullResponse = "";

  // 阶段反馈 2：连接建立后 5s 内无首个 chunk，显示"思考中"
  let firstChunkArrived = false;
  let reasoningChars = 0;
  // 订阅通道（SIWC）不推送推理摘要事件：等待文案如实说明
  const thinkingPlaceholder =
    providerName === "openai-siwc"
      ? "模型思考中…（订阅通道不提供推理过程，请耐心等待）"
      : "模型思考中…";
  let thinkTimer = win.setTimeout(() => {
    if (!firstChunkArrived) aiEl.textContent = thinkingPlaceholder;
  }, 5000);

  // 思考流折叠块状态机：首个推理 delta 创建 → 正文开始自动收起（用户手动操作过则尊重）
  let thinkWrap: HTMLElement | null = null;
  let thinkBodyEl: HTMLElement | null = null;
  let thinkHeaderEl: HTMLElement | null = null;
  let thinkUserToggled = false;
  let thinkStartTs = 0;
  let thinkFinalized = false;

  const setThinkOpen = (open: boolean) => {
    thinkWrap?.classList.toggle("pw-open", open);
  };

  const ensureThinkingBlock = () => {
    if (thinkWrap) return;
    thinkWrap = doc.createElement("div");
    thinkWrap.className = "pw-thinking pw-open";
    thinkHeaderEl = doc.createElement("div");
    thinkHeaderEl.className = "pw-thinking-header";
    thinkBodyEl = doc.createElement("div");
    thinkBodyEl.className = "pw-thinking-body";
    thinkWrap.appendChild(thinkHeaderEl);
    thinkWrap.appendChild(thinkBodyEl);
    thinkHeaderEl.addEventListener("click", () => {
      thinkUserToggled = true;
      setThinkOpen(!thinkWrap!.classList.contains("pw-open"));
    });
    messagesEl.insertBefore(thinkWrap, aiEl);
  };

  const removeThinkingBlock = () => {
    thinkWrap?.remove();
    thinkWrap = null;
    thinkBodyEl = null;
    thinkHeaderEl = null;
    thinkUserToggled = false;
    thinkStartTs = 0;
    thinkFinalized = false;
  };

  const buildMessages = (uc: string | ContentPart[]) => [
    { role: "system" as const, content: systemContent },
    // 剥离 reasoningLen 等持久化元数据，避免未知字段进入厂商请求体
    ...history
      .getAll()
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: uc },
  ];

  // 图片消息重发循环：第 1 次尝试主模型直发(native)，被拒后降级为辅助转述/占位符再发
  for (let attempt = 1; ; attempt++) {
    // 若该模型曾被记录"拒绝图片"（30 天 TTL），跳过注定失败的直发，直接走辅助
    const useNative =
      screenshotDataUrl != null &&
      attempt === 1 &&
      !isVisionRejected(providerName, model);
    const messages = buildMessages(userContent);
    let degrade = false; // native 被拒 → 降级重发

    try {
      await manager.getProvider().chatStream(
        {
          model,
          messages,
          temperature,
          maxTokens,
          reasoning: reasoning || undefined,
        },
        (chunk, reasoningDelta) => {
          if (reasoningDelta) {
            // 推理增量：滚动显示于思考流折叠块（可点击收起）
            win.clearTimeout(thinkTimer);
            ensureThinkingBlock();
            if (reasoningChars === 0) {
              thinkStartTs = Date.now();
              aiEl.textContent = ""; // 思考块已可见，清掉"思考中"占位文案
            }
            reasoningChars += reasoningDelta.length;
            if (thinkHeaderEl)
              thinkHeaderEl.textContent = `思考中 · 已推理 ${reasoningChars} 字`;
            if (thinkBodyEl) {
              // 仅当用户停留在底部时自动滚动（向上翻阅时不打扰）
              const nearBottom =
                thinkBodyEl.scrollHeight -
                  thinkBodyEl.scrollTop -
                  thinkBodyEl.clientHeight <
                40;
              thinkBodyEl.textContent += reasoningDelta;
              if (nearBottom) thinkBodyEl.scrollTop = thinkBodyEl.scrollHeight;
            }
            scrollToBottom(messagesEl);
            return;
          }
          firstChunkArrived = true;
          win.clearTimeout(thinkTimer);
          // 正文开始：思考块收起为摘要头（仅首个正文 chunk 执行一次，
          // 思考用时定格于思考结束时刻——正文输出耗时另计，不并入思考时间）
          if (thinkWrap && thinkHeaderEl && !thinkFinalized) {
            thinkFinalized = true;
            const secs = thinkStartTs
              ? Math.max(1, Math.round((Date.now() - thinkStartTs) / 1000))
              : 0;
            thinkHeaderEl.textContent = `已深度思考 · ${reasoningChars} 字${
              secs ? ` · ${secs}s` : ""
            }`;
            if (!thinkUserToggled) setThinkOpen(false);
          }
          fullResponse += chunk;
          // 流式输出时过滤 MiniMax 思维链标签（标签可能跨 chunk）
          const displayText = fullResponse.replace(
            /<think>[\s\S]*?<\/think>/g,
            "",
          );
          aiEl.classList.remove("pw-msg-loading");
          aiEl.textContent = displayText;
          scrollToBottom(messagesEl);
        },
        (finishReason) => {
          win.clearTimeout(thinkTimer);
          aiEl.classList.remove("pw-msg-loading");
          // 完成后再过滤一次，确保完整内容无思维链
          fullResponse = fullResponse.replace(/<think>[\s\S]*?<\/think>/g, "");
          if (fullResponse) {
            setMarkdown(aiEl, fullResponse);
            history.add({
              role: "assistant",
              content: fullResponse,
              // 推理摘要元数据（原文不落盘，重载会话后仅显示"已深度思考 N 字"）
              ...(reasoningChars > 0 ? { reasoningLen: reasoningChars } : {}),
            });
            void saveSessionByScope(host.scope, history); // 自动保存到 Zotero 笔记
            // "length" = 因 Max Tokens 上限被截断；无提示而中断则说明是流/厂商问题
            if (finishReason === "length") {
              appendTruncationHint(doc, aiEl, maxTokens);
            }
          } else {
            // 空响应：与 onError 一致撤回 user 消息，避免重发产生连续重复
            history.remove(userMsgIndex);
            aiEl.classList.add("pw-msg-error");
            if (thinkWrap && thinkHeaderEl) {
              // 预算耗尽在推理上：思考块保留并收起，供用户查看推理到了哪里
              thinkHeaderEl.textContent = `已推理 ${reasoningChars} 字`;
              setThinkOpen(false);
            }
            if (finishReason === "length") {
              // 思考型模型：全部 Max Tokens 预算耗尽在推理上，正文未开始
              aiEl.textContent = `模型将 Max Tokens 预算（${maxTokens}）全部消耗在推理上（${
                reasoningChars > 0
                  ? `已推理约 ${reasoningChars} 字`
                  : "无正文输出"
              }），未产生任何回答 — 请点上方 T 徽章调大 Max Tokens（建议 ≥8000），然后重新发送这条消息（原消息已自动撤回，不会重复）`;
            } else {
              aiEl.textContent = "模型未返回任何内容，请重试";
            }
          }
          sendBtn.classList.remove("pw-disabled");
          scrollToBottom(messagesEl);
        },
        (err) => {
          if (useNative) {
            // 主模型直发图片被拒（典型：模型不支持图片输入）→ 降级重发，暂不报错。
            // 仅当错误明确命中视觉语义时才记录能力缓存（防 429/网络错误误判）
            if (isVisionRelatedError(err)) {
              markVisionRejected(providerName, model);
            }
            degrade = true;
            return;
          }
          win.clearTimeout(thinkTimer);
          // 撤回本轮 user 消息：未获得 AI 回复的消息留在历史中，
          // 会导致重发时向厂商发送连续两条相同 user 消息
          history.remove(userMsgIndex);
          aiEl.classList.remove("pw-msg-loading");
          aiEl.classList.add("pw-msg-error");
          if (err instanceof SiwcUsageLimitError) {
            // 订阅额度受限：官方 UI 规范 —— 主操作 = Manage usage（打开 ChatGPT 用量设置）
            aiEl.textContent =
              "ChatGPT 订阅额度已用尽（Usage limit reached）— 可在 ChatGPT 设置中查看与调整额度，或切换其他厂商后重试";
            const manageBtn = doc.createElement("div");
            manageBtn.className = "pw-manage-usage-btn";
            manageBtn.setAttribute("role", "button");
            manageBtn.setAttribute("tabindex", "0");
            manageBtn.textContent = "Manage usage →";
            manageBtn.addEventListener("click", () => {
              Zotero.launchURL("https://chatgpt.com/settings/usage");
            });
            aiEl.appendChild(manageBtn);
          } else {
            aiEl.textContent = `错误：${err.message}`;
          }
          sendBtn.classList.remove("pw-disabled");
        },
      );
    } catch (e) {
      // 兜底：Provider 构造或流启动阶段的同步异常（如 prefs 损坏导致 Unknown provider）。
      // 不捕获会逃逸为未处理的 Promise rejection，thinkTimer 悬挂、发送按钮永久锁死
      if (useNative) {
        degrade = true;
      } else {
        win.clearTimeout(thinkTimer);
        history.remove(userMsgIndex);
        aiEl.classList.remove("pw-msg-loading");
        aiEl.classList.add("pw-msg-error");
        aiEl.textContent = `错误：${(e as Error).message}`;
        sendBtn.classList.remove("pw-disabled");
      }
    }

    if (!degrade) break;

    // ── 降级重发：重置流式状态与阶段反馈，解析辅助/占位内容后进入第 2 轮 ──
    win.clearTimeout(thinkTimer);
    fullResponse = "";
    firstChunkArrived = false;
    reasoningChars = 0;
    removeThinkingBlock(); // 清除第 1 轮可能产生的思考块，避免重发后出现两块
    aiEl.textContent = "";
    aiEl.classList.add("pw-msg-loading");
    thinkTimer = win.setTimeout(() => {
      if (!firstChunkArrived) aiEl.textContent = thinkingPlaceholder;
    }, 5000);
    resolved = await resolveImageContent(false);
    if (resolved.visionError) showVisionError(resolved.visionError);
    userContent = resolved.content;
  }
}

/** 渲染聊天历史到消息区 */
export function renderChatHistory(
  doc: Document,
  messagesEl: HTMLElement,
  scope: SessionScope,
): void {
  messagesEl.textContent = "";
  for (const msg of getHistoryByScope(scope).getAll()) {
    if (msg.role !== "system") {
      const text = typeof msg.content === "string" ? msg.content : "[截图 📷]";
      const el = appendMessage(
        doc,
        messagesEl,
        msg.role as "user" | "assistant",
        text,
        msg.role === "assistant",
      );
      // 历史会话：推理原文未落盘，仅渲染不可展开的摘要行
      if (msg.role === "assistant" && msg.reasoningLen) {
        const summary = doc.createElement("div");
        summary.className = "pw-thinking";
        const head = doc.createElement("div");
        head.className = "pw-thinking-header";
        head.textContent = `已深度思考 · ${msg.reasoningLen} 字 · 原文未保存`;
        summary.appendChild(head);
        messagesEl.insertBefore(summary, el);
      }
    }
  }
  scrollToBottom(messagesEl);
}

/** 显示会话列表 */
export function showSessionList(
  doc: Document,
  messagesEl: HTMLElement,
  sessions: SessionMeta[],
  scope: SessionScope,
): void {
  messagesEl.textContent = "";

  const list = doc.createElement("div");
  list.className = "pw-session-list";

  // "新建对话"按钮
  const newBtn = doc.createElement("div");
  newBtn.className = "pw-new-chat-btn";
  newBtn.setAttribute("role", "button");
  newBtn.setAttribute("tabindex", "0");
  newBtn.textContent = "+ 新建对话";
  newBtn.addEventListener("click", () => {
    getHistoryByScope(scope).clear();
    setActiveNoteIDByScope(scope, null);
    messagesEl.textContent = "";
  });
  list.appendChild(newBtn);

  if (sessions.length > 0) {
    const sectionTitle = doc.createElement("div");
    sectionTitle.className = "pw-session-section-title";
    sectionTitle.textContent = "历史会话";
    list.appendChild(sectionTitle);
  }

  for (const sess of sessions) {
    const row = doc.createElement("div");
    row.className = "pw-session-item";
    // 高亮当前激活会话
    if (getActiveNoteIDByScope(scope) === sess.noteID) {
      row.classList.add("pw-session-active");
    }

    const titleEl = doc.createElement("span");
    titleEl.className = "pw-session-title";
    titleEl.textContent = sess.title;
    row.appendChild(titleEl);

    const metaEl = doc.createElement("span");
    metaEl.className = "pw-session-date";
    // 精确到分钟：updated 为每次 AI 回复完成时刷新的 ISO 时间戳（UTC），转本地时间
    const d = new Date(sess.updated);
    if (isNaN(d.getTime())) {
      metaEl.textContent = sess.updated.slice(0, 10); // 容错：非法时间戳退回原显示
    } else {
      const pad = (n: number) => String(n).padStart(2, "0");
      const now = new Date();
      metaEl.textContent =
        d.getFullYear() === now.getFullYear()
          ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` // 当年：MM-DD HH:mm
          : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // 跨年：补全年份
    }
    row.appendChild(metaEl);

    const delBtn = doc.createElement("span");
    delBtn.className = "pw-session-del";
    delBtn.setAttribute("role", "button");
    delBtn.setAttribute("tabindex", "0");
    delBtn.textContent = "×";
    row.appendChild(delBtn);

    // 加载会话
    titleEl.addEventListener("click", () => {
      const history = getHistoryByScope(scope);
      history.clear();
      for (const msg of sess.data.messages) {
        history.add({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
          ...(msg.reasoningLen ? { reasoningLen: msg.reasoningLen } : {}),
        });
      }
      setActiveNoteIDByScope(scope, sess.noteID);
      renderChatHistory(doc, messagesEl, scope);
    });

    // 删除会话（行内二次确认：首次点 × 变"确认?"，3s 内再点才删，超时恢复）
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (delBtn.dataset.confirm !== "1") {
        delBtn.dataset.confirm = "1";
        delBtn.textContent = "确认?";
        delBtn.classList.add("pw-session-del-confirm");
        const doc = delBtn.ownerDocument as Document;
        (doc.defaultView ?? Zotero.getMainWindow())?.setTimeout(() => {
          delBtn.dataset.confirm = "";
          delBtn.textContent = "×";
          delBtn.classList.remove("pw-session-del-confirm");
        }, 3000);
        return;
      }
      void (async () => {
        try {
          const noteItem = Zotero.Items.get(sess.noteID);
          await noteItem.eraseTx();
          // 若删的是当前激活会话，清空内存
          if (getActiveNoteIDByScope(scope) === sess.noteID) {
            getHistoryByScope(scope).clear();
            setActiveNoteIDByScope(scope, null);
          }
          const newSessions = await loadSessionsByScope(scope);
          showSessionList(doc, messagesEl, newSessions, scope);
        } catch {
          /* ignore */
        }
      })();
    });

    list.appendChild(row);
  }

  messagesEl.appendChild(list);
}

// ── CSS ──────────────────────────────────────────────────────────────────────

const CHAT_CSS = `
.pw-panel {
  font-size: 13px;
  font-family: inherit;
  box-sizing: border-box;
  position: relative;
}
.pw-sticky-top {
  position: sticky;
  top: 0;
  z-index: 10;
  background: Canvas;
}
.pw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(128,128,128,0.2);
}
.pw-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* 模型下拉选择器 */
.pw-model-dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  opacity: 0.6;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: opacity 0.2s, background 0.2s;
  user-select: none;
}
.pw-model-dropdown-trigger:hover {
  opacity: 0.9;
  background: rgba(128,128,128,0.1);
}
/* MinerU 精细提取进度条 */
.pw-pdf-progress {
  padding: 8px 10px;
  background: rgba(26,127,212,0.05);
  border-bottom: 1px solid rgba(128,128,128,0.2);
}
.pw-progress-bar {
  height: 4px;
  background: rgba(128,128,128,0.2);
  border-radius: 2px;
  overflow: hidden;
}
.pw-progress-fill {
  height: 100%;
  background: #1a7fd4;
  border-radius: 2px;
  transition: width 0.3s ease;
}
.pw-progress-text {
  font-size: 11px;
  color: #1a7fd4;
  margin-top: 4px;
  text-align: center;
}
/* MinerU 按钮已缓存状态 */
.pw-mineru-cached {
  border-color: #27ae60 !important;
  color: #27ae60 !important;
}
.pw-mineru-cached:hover { background: rgba(39,174,96,0.1) !important; }
.pw-model-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pw-dropdown-arrow {
  font-size: 8px;
  margin-left: 2px;
  flex-shrink: 0;
}
/* 温度徽章 */
.pw-temp-trigger {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  opacity: 0.6;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: opacity 0.2s, background 0.2s;
  user-select: none;
  white-space: nowrap;
}
.pw-temp-trigger:hover {
  opacity: 0.9;
  background: rgba(128,128,128,0.1);
}
/* 温度 popover */
.pw-temp-popover {
  position: absolute;
  background: Canvas;
  border: 1px solid rgba(128,128,128,0.3);
  border-radius: 8px;
  padding: 12px;
  width: 220px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 100;
  font-size: 12px;
}
.pw-temp-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: inherit;
}
.pw-temp-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pw-temp-slider { flex: 1; cursor: pointer; }
.pw-temp-input {
  width: 48px;
  padding: 2px 4px;
  text-align: center;
  border: 1px solid rgba(128,128,128,0.3);
  border-radius: 4px;
  font-size: 12px;
  background: Canvas;
  color: inherit;
}
.pw-temp-hint {
  margin-top: 6px;
  opacity: 0.55;
  font-size: 10px;
  line-height: 1.4;
}
.pw-params-divider {
  border-top: 1px solid rgba(128,128,128,0.2);
  margin: 10px 0;
}
.pw-tokens-input {
  width: 72px;
  padding: 2px 4px;
  text-align: center;
  border: 1px solid rgba(128,128,128,0.3);
  border-radius: 4px;
  font-size: 12px;
  background: Canvas;
  color: inherit;
}
/* 深度思考开关 */
.pw-thinking-row {
  display: flex;
  gap: 6px;
}
.pw-thinking-opt {
  flex: 1;
  text-align: center;
  padding: 4px 0;
  border-radius: 4px;
  border: 1px solid rgba(128,128,128,0.3);
  cursor: pointer;
  font-size: 12px;
  user-select: none;
}
.pw-thinking-opt:hover { background: rgba(26,127,212,0.08); }
.pw-thinking-active {
  border-color: #1a7fd4;
  color: #1a7fd4;
  font-weight: 600;
}
/* 提供商下拉菜单 */
.pw-provider-dropdown {
  position: absolute;
  background: Canvas;
  border: 1px solid rgba(128,128,128,0.3);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 160px;
  max-width: 240px;
  z-index: 100;
  padding: 4px;
  font-size: 12px;
  max-height: 200px;
  overflow-y: auto;
}
.pw-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}
.pw-dropdown-item:hover {
  background: rgba(26,127,212,0.1);
}
.pw-dropdown-back {
  padding: 8px 10px;
  background: rgba(128,128,128,0.05);
  border-bottom: 1px solid rgba(128,128,128,0.15);
  cursor: pointer;
  font-weight: 600;
  font-size: 11px;
  color: #1a7fd4;
  position: sticky;
  top: 0;
  z-index: 1;
}
.pw-dropdown-back:hover {
  background: rgba(128,128,128,0.1);
}
.pw-model-item {
  font-size: 11px;
  padding: 5px 10px;
}
.pw-dropdown-active {
  background: rgba(26,127,212,0.08);
  font-weight: 500;
}
.pw-dropdown-provider {
  flex-shrink: 0;
}
.pw-dropdown-model {
  font-size: 10px;
  opacity: 0.6;
  margin-left: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}
.pw-dropdown-empty {
  padding: 12px;
  text-align: center;
  opacity: 0.5;
  font-size: 11px;
}
.pw-sessions-btn {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(128,128,128,0.4);
  background: transparent;
  cursor: pointer;
  color: inherit;
  flex-shrink: 0;
}
.pw-sessions-btn:hover { opacity: 0.7; }
.pw-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(128,128,128,0.2);
}
.pw-action-btn {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 10px;
  border: 1px solid #1a7fd4;
  background: transparent;
  color: #1a7fd4;
  cursor: pointer;
  white-space: nowrap;
}
.pw-action-btn:hover { background: rgba(26,127,212,0.1); }
/* 自定义快捷按钮：超长名称省略号，避免挤压换行/堆叠（.pw-actions 已 flex-wrap） */
.pw-custom-btn {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-action-btn--disabled {
  opacity: 0.35;
  cursor: not-allowed;
  pointer-events: none;
}
/* 文本选择上下文 chip */
.pw-selection-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(26,127,212,0.08);
  border: 1px solid rgba(26,127,212,0.3);
  border-radius: 6px;
  font-size: 11px;
  color: #1a7fd4;
  max-width: 100%;
  box-sizing: border-box;
}
.pw-selection-chip.pw-hidden { display: none; }
.pw-chip-label {
  font-weight: 600;
  flex-shrink: 0;
}
.pw-chip-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}
.pw-chip-close {
  flex-shrink: 0;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  opacity: 0.6;
  padding: 0 2px;
}
.pw-chip-close:hover { opacity: 1; }
.pw-messages {
  overflow-y: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 4px;
}
.pw-msg {
  max-width: 90%;
  padding: 8px 10px;
  border-radius: 10px;
  line-height: 1.55;
  word-break: break-word;
  font-size: 13px;
  -moz-user-select: text;
  user-select: text;
  cursor: text;
}
.pw-msg-user {
  align-self: flex-end;
  background: #1a7fd4;
  color: #fff;
  border-bottom-right-radius: 3px;
}
.pw-msg-assistant {
  align-self: flex-start;
  background: rgba(128,128,128,0.12);
  border-bottom-left-radius: 3px;
}
.pw-msg-loading::after {
  content: "▋";
  animation: pw-blink 1s step-start infinite;
}
@keyframes pw-blink { 50% { opacity: 0; } }
.pw-msg-error {
  background: rgba(220,50,50,0.12);
  color: #c0392b;
}
.pw-truncated-hint {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed rgba(192,57,43,0.4);
  font-size: 11px;
  color: #c0392b;
  line-height: 1.5;
}
/* ChatGPT 订阅标识（官方 Using ChatGPT plan 规范）：常驻徽章，点击管理用量 */
.pw-siwc-chip {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.08);
  color: inherit;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.pw-siwc-chip:hover {
  background: rgba(26, 127, 212, 0.15);
}
/* 订阅额度受限时的 Manage usage 按钮（官方 UI 规范：主操作） */
.pw-manage-usage-btn {
  display: inline-block;
  margin-top: 6px;
  padding: 3px 10px;
  border-radius: 4px;
  background: #000;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}
.pw-manage-usage-btn:hover {
  opacity: 0.85;
}
/* 首次登录确认 overlay（官方 welcome 规范：仅首次，Got it 关闭） */
.pw-siwc-welcome {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}
.pw-siwc-welcome-card {
  max-width: 300px;
  margin: 16px;
  padding: 20px;
  border-radius: 8px;
  background: Canvas;
  color: CanvasText;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  text-align: center;
}
.pw-siwc-welcome-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
.pw-siwc-welcome-desc {
  font-size: 12px;
  line-height: 1.6;
  color: rgba(128, 128, 128, 0.95);
  margin-bottom: 14px;
}
.pw-siwc-welcome-btn {
  display: inline-block;
  padding: 5px 18px;
  border-radius: 5px;
  background: #000;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.pw-siwc-welcome-btn:hover {
  opacity: 0.85;
}
/* 推理思考流折叠块（思考中滚动展示 → 正文开始自动收起为摘要头） */
.pw-thinking {
  max-width: 92%;
  margin: 2px 0 6px;
  border-left: 2px solid rgba(26,127,212,0.35);
  background: rgba(128,128,128,0.08);
  border-radius: 4px;
}
.pw-thinking-header {
  padding: 4px 8px;
  font-size: 11px;
  color: rgba(128,128,128,0.9);
  cursor: pointer;
  user-select: none;
}
.pw-thinking-header:hover { color: rgba(26,127,212,0.9); }
.pw-thinking-body {
  max-height: 160px;
  overflow-y: auto;
  padding: 0 10px 6px;
  font-size: 11px;
  line-height: 1.55;
  color: rgba(128,128,128,0.85);
  white-space: pre-wrap;
  word-break: break-word;
}
.pw-thinking:not(.pw-open) .pw-thinking-body { display: none; }
.pw-input-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid rgba(128,128,128,0.2);
  position: sticky;
  bottom: 0;
  background: Canvas;
}
.pw-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid rgba(128,128,128,0.3);
  border-radius: 6px;
  resize: none;
  overflow-y: auto;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.4;
  background: transparent;
  color: inherit;
  box-sizing: border-box;
  max-height: 400px;
}
.pw-input:focus {
  outline: none;
  border-color: #1a7fd4;
}
.pw-send-btn {
  width: 100%;
  padding: 6px 0;
  border-radius: 6px;
  border: none;
  background: #1a7fd4;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
}
.pw-send-btn:hover { background: #1568b3; }
.pw-send-btn.pw-disabled {
  background: rgba(128,128,128,0.3);
  cursor: not-allowed;
}
.pw-msg h3 { font-size: 14px; font-weight: 700; margin: 8px 0 4px; }
.pw-msg h4 { font-size: 13px; font-weight: 700; margin: 6px 0 3px; }
.pw-msg h5 { font-size: 12px; font-weight: 700; margin: 4px 0 2px; }
.pw-msg p  { margin: 4px 0; }
.pw-msg ul { margin: 4px 0 4px 18px; padding: 0; }
.pw-msg li { margin: 2px 0; }
.pw-msg code {
  font-family: monospace;
  font-size: 12px;
  background: rgba(128,128,128,0.15);
  padding: 1px 4px;
  border-radius: 3px;
}
.pw-msg pre {
  background: rgba(128,128,128,0.12);
  border-radius: 6px;
  padding: 8px 10px;
  overflow-x: auto;
  font-size: 12px;
  margin: 6px 0;
}
.pw-msg pre code { background: none; padding: 0; }
.pw-msg hr { border: none; border-top: 1px solid rgba(128,128,128,0.3); margin: 8px 0; }
.pw-table {
  border-collapse: collapse;
  width: 100%;
  margin: 6px 0;
  font-size: 12px;
  overflow-x: auto;
  display: block;
}
.pw-table th, .pw-table td {
  border: 1px solid rgba(128,128,128,0.35);
  padding: 4px 8px;
  line-height: 1.4;
}
.pw-table thead tr {
  background: rgba(128,128,128,0.15);
  font-weight: 600;
}
.pw-blockquote {
  border-left: 3px solid rgba(128,128,128,0.4);
  margin: 4px 0;
  padding: 2px 10px;
  opacity: 0.85;
  font-style: italic;
}
.pw-math-display {
  text-align: center;
  margin: 8px 0;
  overflow-x: auto;
  padding: 4px 0;
}
.pw-session-list {
  padding: 8px 4px;
}
.pw-new-chat-btn {
  width: 100%;
  margin-bottom: 10px;
  text-align: center;
  padding: 7px;
  border-radius: 6px;
  cursor: pointer;
  background: rgba(128,128,128,0.1);
  font-size: 12px;
  box-sizing: border-box;
}
.pw-new-chat-btn:hover { background: rgba(128,128,128,0.2); }
.pw-session-section-title {
  font-size: 11px;
  opacity: 0.5;
  margin-bottom: 6px;
  padding: 0 2px;
}
.pw-session-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-radius: 6px;
  margin: 3px 0;
  background: rgba(128,128,128,0.08);
  cursor: pointer;
}
.pw-session-item:hover { background: rgba(128,128,128,0.16); }
.pw-session-active { background: rgba(26,127,212,0.1); }
.pw-session-active:hover { background: rgba(26,127,212,0.16); }
.pw-session-title {
  flex: 1;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pw-session-date {
  font-size: 10px;
  opacity: 0.45;
  flex-shrink: 0;
  padding: 0 6px;
}
.pw-session-del {
  font-size: 13px;
  opacity: 0.35;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0 2px;
  line-height: 1;
}
.pw-session-del:hover { opacity: 0.8; }
.pw-session-del-confirm {
  color: #c0392b;
  opacity: 1;
  font-size: 11px;
}
/* 截图 chip */
.pw-screenshot-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(26,127,212,0.08);
  border: 1px solid rgba(26,127,212,0.3);
  border-radius: 6px;
  font-size: 11px;
  color: #1a7fd4;
  max-width: 100%;
  box-sizing: border-box;
}
.pw-screenshot-chip.pw-hidden { display: none; }
.pw-screenshot-thumb {
  width: 48px;
  height: 32px;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid rgba(26,127,212,0.3);
  flex-shrink: 0;
}
/* 框选区域截图遮罩 */
.pw-capture-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  cursor: crosshair;
  z-index: 9999;
  background: rgba(0,0,0,0.08);
}
.pw-capture-selection {
  position: fixed;
  border: 2px solid #1a7fd4;
  background: rgba(26,127,212,0.08);
  pointer-events: none;
  z-index: 10000;
  display: none;
}
/* ── Standalone tab 布局（独立会话）── */
.pw-standalone-wrap { display: flex; width: 100%; height: 100%; }
.pw-standalone-wrap .pw-panel { flex: 1; min-height: 0; }
.pw-standalone-main { flex: 1; min-width: 0; }
`;
