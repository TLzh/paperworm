/**
 * Reader 侧边聊天面板
 * 注册为 Zotero Reader 右侧的 Item Pane Section
 */

import { config } from "../../../package.json";
import { LLMManager } from "../llm/manager";
import { ChatHistory } from "../chat/history";
import { PaperExtractor } from "../paper/extractor";
import katex from "katex";

// 每篇论文单独维护一份对话历史（以 parentItem.id 为 key）
const histories = new Map<number, ChatHistory>();

// 当前激活的会话 noteID（null = 新会话尚未保存到 Zotero）
const activeNoteIDs = new Map<number, number | null>();

/**
 * 将 item 归一化为父条目 ID，作为 histories / activeNoteIDs 的统一 key。
 *
 * Zotero 在不同上下文下传入的 item 可能是附件（PDF）或父条目（论文），
 * 两者 id 不同。若不归一化，同一篇论文可能在 Map 中产生两个独立 bucket，
 * 导致面板切换时内存历史"消失"。
 * saveSession / loadSessions 均使用 parentItem，此处保持一致。
 */
function getItemKey(item: Zotero.Item): number {
  if (item.isAttachment()) {
    return item.parentItem?.id ?? item.id;
  }
  return item.id;
}

function getHistory(item: Zotero.Item): ChatHistory {
  const key = getItemKey(item);
  if (!histories.has(key)) {
    histories.set(key, new ChatHistory());
  }
  return histories.get(key)!;
}

// ── 注册入口 ────────────────────────────────────────────────────────────────

export function registerReaderPanel() {
  (Zotero.ItemPaneManager as any).registerSection({
    paneID: `${config.addonRef}-chat`,
    pluginID: config.addonID,
    header: {
      l10nID: `${config.addonRef}-reader-panel-head-text`,
      icon: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
    },
    sidenav: {
      l10nID: `${config.addonRef}-reader-panel-sidenav-tooltip`,
      icon: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
    },
    onItemChange(props: any) {
      const { body, item } = props as { body: HTMLElement; item: Zotero.Item };
      // 仅当该论文有活跃会话时才自动导航，否则让用户看到信息/摘要
      const hasSession =
        getHistory(item).getAll().length > 0 ||
        activeNoteIDs.get(getItemKey(item)) != null;
      if (!hasSession) return;
      // 等一帧让 Zotero 完成布局重排后再滚动
      body.ownerDocument?.defaultView?.requestAnimationFrame(() => {
        body.scrollIntoView({ behavior: "instant", block: "end" });
      });
    },
    onRender(props: any) {
      const { body, item, tabType } = props as {
        body: HTMLElement;
        item: Zotero.Item;
        tabType: string;
      };
      if (tabType !== "reader") {
        body.textContent = "";
        return;
      }
      void initPanel(body, item);
    },
  });
}

// ── 面板初始化 ───────────────────────────────────────────────────────────────

async function initPanel(body: HTMLElement, item: Zotero.Item) {
  const doc = body.ownerDocument as Document;
  body.textContent = "";

  // 当前激活模型
  const providerName = LLMManager.getInstance().getActiveProviderName();
  const modelName =
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.llm.${providerName}.model`,
      true,
    ) as string) ?? "unknown";

  // 用一个容器包裹 <style> + 面板，避免 CSS 作用域问题
  const wrapper = doc.createElement("div");
  wrapper.innerHTML = `
<style>
${CHAT_CSS}
</style>
<div class="pw-panel">
  <div class="pw-sticky-top">
    <div class="pw-header">
      <span class="pw-model-badge">${providerName} · ${modelName}</span>
      <div class="pw-sessions-btn" role="button" tabindex="0">会话列表</div>
    </div>
    <div class="pw-actions">
      <div class="pw-action-btn" role="button" tabindex="0" data-action="summarize">总结本文</div>
      <div class="pw-action-btn" role="button" tabindex="0" data-action="explain">解释段落</div>
      <div class="pw-action-btn" role="button" tabindex="0" data-action="translate">翻译</div>
      <div class="pw-action-btn" role="button" tabindex="0" data-action="quote">引用选中</div>
    </div>
  </div>
  <div class="pw-messages"></div>
  <div class="pw-input-area">
    <textarea class="pw-input" rows="3" placeholder="输入问题… Enter 发送，Shift+Enter 换行"></textarea>
    <div class="pw-send-btn" role="button" tabindex="0">发送 ↑</div>
  </div>
</div>`;
  body.appendChild(wrapper);

  const panel = wrapper.querySelector(".pw-panel") as HTMLElement;
  const messagesEl = panel.querySelector(".pw-messages") as HTMLElement;

  if (getHistory(item).getAll().length > 0) {
    // 内存中有活跃对话，直接渲染（滚动位置由 onItemChange 统一处理）
    renderChatHistory(doc, messagesEl, item);
  } else {
    // 内存为空，检查 Zotero 中是否有历史会话
    const sessions = await loadSessions(item);
    if (sessions.length > 0) {
      showSessionList(doc, messagesEl, sessions, item);
    }
    // 无历史：空聊天界面（默认状态）
  }

  bindEvents(doc, panel, messagesEl, item);

  // 实时刷新模型徽章：每秒从 prefs 读取当前配置，有变化才更新 DOM
  const win = body.ownerDocument!.defaultView!;
  const badge = panel.querySelector(".pw-model-badge") as HTMLElement;
  const badgeTimer = win.setInterval(() => {
    const pName = LLMManager.getInstance().getActiveProviderName();
    const mName =
      (Zotero.Prefs.get(
        `${config.prefsPrefix}.llm.${pName}.model`,
        true,
      ) as string) ?? "unknown";
    const next = `${pName} · ${mName}`;
    if (badge.textContent !== next) badge.textContent = next;
  }, 1000);

  // 面板重建（initPanel 调用 body.textContent=""）时自动清理定时器
  new win.MutationObserver((_: MutationRecord[], obs: MutationObserver) => {
    if (!badge.isConnected) {
      win.clearInterval(badgeTimer);
      obs.disconnect();
    }
  }).observe(body, { childList: true });
}

// ── 事件绑定 ─────────────────────────────────────────────────────────────────

function bindEvents(
  doc: Document,
  panel: HTMLElement,
  messagesEl: HTMLElement,
  item: Zotero.Item,
) {
  const textarea = panel.querySelector(".pw-input") as HTMLTextAreaElement;
  const sendBtn = panel.querySelector(".pw-send-btn") as HTMLElement;
  const sessionsBtn = panel.querySelector(".pw-sessions-btn") as HTMLElement;

  // 在用户点击面板任何元素之前（mousedown 阶段）捕获 PDF 选区。
  // 此时焦点尚未离开 PDF iframe，选区还在。
  let capturedSelection = "";

  panel.addEventListener(
    "mousedown",
    () => {
      const sel = PaperExtractor.getSelectedText(item);
      if (sel.length >= 10) capturedSelection = sel;
    },
    true, // capture 阶段，早于任何 click/focus 处理
  );

  function doSend() {
    if (sendBtn.classList.contains("pw-disabled")) return;
    const text = textarea.value.trim();
    if (!text) return;
    textarea.value = "";
    const sel = capturedSelection;
    capturedSelection = ""; // 用完即清，避免下一条消息重复注入
    void send(doc, messagesEl, item, text, sel, sendBtn);
  }

  sendBtn.addEventListener("click", doSend);

  // capture:true 防止 Reader 层吞掉 Enter
  textarea.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        doSend();
      }
    },
    true,
  );

  panel.querySelectorAll(".pw-action-btn").forEach((btn: Element) => {
    btn.addEventListener("click", () => {
      const action = (btn as HTMLElement).dataset.action ?? "";
      // 快捷操作按钮点击时 capturedSelection 已在 mousedown 中更新
      handleAction(action, textarea, item, capturedSelection);
    });
  });

  sessionsBtn.addEventListener("click", () => {
    // 若当前已在会话列表 → 若有活跃会话则返回聊天，否则不响应
    if (messagesEl.querySelector(".pw-session-list")) {
      if (getHistory(item).getAll().length > 0) {
        renderChatHistory(doc, messagesEl, item);
      }
      return;
    }
    // 切换到会话列表
    void loadSessions(item).then((sessions) => {
      showSessionList(doc, messagesEl, sessions, item);
    });
  });
}

// ── 快捷操作 ─────────────────────────────────────────────────────────────────

function handleAction(
  action: string,
  textarea: HTMLTextAreaElement,
  item: Zotero.Item,
  capturedSel: string,
) {
  const meta = PaperExtractor.getItemMetadata(item);
  switch (action) {
    case "summarize":
      textarea.value =
        "请对这篇论文做一个结构化总结，包括：研究问题、方法、主要发现、贡献和局限性。" +
        (meta.title ? `\n\n论文标题：${meta.title}` : "");
      break;
    case "explain":
      textarea.value = capturedSel
        ? `请解释以下段落：\n\n「${capturedSel}」`
        : "请解释以下段落（请粘贴要解释的内容）：\n\n";
      break;
    case "translate":
      textarea.value = capturedSel
        ? `请将以下内容翻译为中文：\n\n「${capturedSel}」`
        : "请将以下内容翻译为中文（请粘贴要翻译的内容）：\n\n";
      break;
    case "quote":
      if (capturedSel) {
        textarea.value = `「${capturedSel}」\n\n`;
      } else {
        textarea.placeholder = "请先在 PDF 中选中一段文字，再点击引用选中";
      }
      break;
  }
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

// ── 发送 & 流式输出 ───────────────────────────────────────────────────────────

async function send(
  doc: Document,
  messagesEl: HTMLElement,
  item: Zotero.Item,
  userText: string,
  selectedText: string,
  sendBtn: HTMLElement,
) {
  sendBtn.classList.add("pw-disabled");
  const history = getHistory(item);

  // 若有选中文字，将其作为引用块前置到用户消息中
  const finalText = selectedText
    ? `「${selectedText}」\n\n${userText}`
    : userText;

  appendMessage(doc, messagesEl, "user", finalText);
  history.add({ role: "user", content: finalText });
  scrollToBottom(messagesEl);

  const aiEl = appendMessage(doc, messagesEl, "assistant", "");
  aiEl.classList.add("pw-msg-loading");
  scrollToBottom(messagesEl);

  // 构建 messages：system（含论文上下文 + 全文）+ 对话历史
  const messages = [
    { role: "system" as const, content: await buildSystemContent(item) },
    ...history.getAll(),
  ];

  const manager = LLMManager.getInstance();
  const providerName = manager.getActiveProviderName();
  const model =
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.llm.${providerName}.model`,
      true,
    ) as string) ?? "gpt-4o";
  const temperature = parseFloat(
    (Zotero.Prefs.get(`${config.prefsPrefix}.llm.temperature`, true) as string) ?? "0.7",
  );
  const maxTokens = parseInt(
    (Zotero.Prefs.get(`${config.prefsPrefix}.llm.maxTokens`, true) as string) ?? "2000",
  );

  let fullResponse = "";

  await manager.getProvider().chatStream(
    { model, messages, temperature, maxTokens },
    (chunk) => {
      fullResponse += chunk;
      aiEl.classList.remove("pw-msg-loading");
      aiEl.textContent = fullResponse;
      scrollToBottom(messagesEl);
    },
    () => {
      aiEl.classList.remove("pw-msg-loading");
      if (fullResponse) {
        setMarkdown(aiEl, fullResponse);
        history.add({ role: "assistant", content: fullResponse });
        void saveSession(item, history); // 自动保存到 Zotero 笔记
      }
      sendBtn.classList.remove("pw-disabled");
      scrollToBottom(messagesEl);
    },
    (err) => {
      aiEl.classList.remove("pw-msg-loading");
      aiEl.classList.add("pw-msg-error");
      aiEl.textContent = `错误：${err.message}`;
      sendBtn.classList.remove("pw-disabled");
    },
  );
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function appendMessage(
  doc: Document,
  container: HTMLElement,
  role: "user" | "assistant",
  text: string,
  asMarkdown = false,
): HTMLElement {
  const el = doc.createElement("div");
  el.className = `pw-msg pw-msg-${role}`;
  if (asMarkdown && text) {
    setMarkdown(el, text);
  } else {
    el.textContent = text;
  }
  container.appendChild(el);
  return el;
}

function scrollToBottom(el: HTMLElement) {
  el.scrollTop = el.scrollHeight;
}

/**
 * 将 markdown 文本渲染进目标元素。
 * 完全使用 DOM API（createElement / createTextNode / appendChild），
 * 不生成任何 HTML 字符串，彻底绕过 Gecko chrome 上下文对
 * innerHTML / createContextualFragment / DOMParser 的安全限制。
 */
function setMarkdown(el: HTMLElement, text: string): void {
  const doc = el.ownerDocument as Document;
  while (el.firstChild) el.removeChild(el.firstChild);

  const lines = text.split("\n");
  let paraLines: string[] = [];

  function flushPara() {
    const content = paraLines.join("\n").trim();
    paraLines = [];
    if (!content) return;
    const p = doc.createElement("p");
    appendInline(doc, p, content);
    el.appendChild(p);
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 显示数学公式：$$ 单独一行作为围栏开始/结束
    if (line.trim() === "$$") {
      flushPara();
      i++;
      const mathLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "$$") mathLines.push(lines[i++]);
      if (lines[i]?.trim() === "$$") i++;
      const wrap = doc.createElement("div");
      wrap.className = "pw-math-display";
      renderMath(doc, wrap, mathLines.join("\n"), true);
      el.appendChild(wrap);
      continue;
    }

    // 显示数学公式：\[ 单独一行作为围栏开始/结束（LaTeX 风格）
    if (line.trim() === "\\[") {
      flushPara();
      i++;
      const mathLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "\\]") mathLines.push(lines[i++]);
      if (lines[i]?.trim() === "\\]") i++;
      const wrap = doc.createElement("div");
      wrap.className = "pw-math-display";
      renderMath(doc, wrap, mathLines.join("\n"), true);
      el.appendChild(wrap);
      continue;
    }

    // 显示数学公式：$$formula$$ 同行
    const dmatch = line.match(/^\$\$(.+)\$\$\s*$/);
    if (dmatch) {
      flushPara();
      const wrap = doc.createElement("div");
      wrap.className = "pw-math-display";
      renderMath(doc, wrap, dmatch[1].trim(), true);
      el.appendChild(wrap);
      i++;
      continue;
    }

    // 显示数学公式：\[formula\] 同行（LaTeX 风格）
    const dlmatch = line.match(/^\\\[(.+)\\\]\s*$/);
    if (dlmatch) {
      flushPara();
      const wrap = doc.createElement("div");
      wrap.className = "pw-math-display";
      renderMath(doc, wrap, dlmatch[1].trim(), true);
      el.appendChild(wrap);
      i++;
      continue;
    }

    // 代码块
    if (line.startsWith("```")) {
      flushPara();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) codeLines.push(lines[i++]);
      if (lines[i]?.startsWith("```")) i++;
      const pre = doc.createElement("pre");
      const code = doc.createElement("code");
      code.textContent = codeLines.join("\n");
      pre.appendChild(code);
      el.appendChild(pre);
      continue;
    }

    // 引用块（连续 > 开头的行收进同一个 <blockquote>）
    if (/^>\s?/.test(line)) {
      flushPara();
      const bq = doc.createElement("blockquote");
      bq.className = "pw-blockquote";
      const bqLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        bqLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      appendInline(doc, bq, bqLines.join("\n"));
      el.appendChild(bq);
      continue;
    }

    // 标题 (# ~ ######)
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      flushPara();
      const h = doc.createElement(`h${Math.min(hm[1].length, 6)}`);
      appendInline(doc, h, hm[2]);
      el.appendChild(h);
      i++;
      continue;
    }

    // 水平线
    if (/^-{3,}$/.test(line.trim())) {
      flushPara();
      el.appendChild(doc.createElement("hr"));
      i++;
      continue;
    }

    // 无序列表（连续行收进同一个 <ul>）
    if (/^[ \t]*[-*] /.test(line)) {
      flushPara();
      const ul = doc.createElement("ul");
      while (i < lines.length && /^[ \t]*[-*] /.test(lines[i])) {
        const li = doc.createElement("li");
        appendInline(doc, li, lines[i].replace(/^[ \t]*[-*]\s+/, ""));
        ul.appendChild(li);
        i++;
      }
      el.appendChild(ul);
      continue;
    }

    // 表格（以 | 开头的连续行，第二行为分隔行）
    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tableLines.push(lines[i++]);
      }
      // 第二行是分隔行（只含 |、-、:、空格）时才认定为表格
      const isSepRow = (s: string) => /^\|[\s|:-]+\|?\s*$/.test(s.trim());
      if (tableLines.length >= 2 && isSepRow(tableLines[1])) {
        flushPara();
        const parseCells = (row: string) =>
          row.split("|").slice(1).map(c => c.trim()).filter((_, idx, arr) =>
            !(idx === arr.length - 1 && arr[arr.length - 1] === "")
          );
        const alignments = parseCells(tableLines[1]).map(cell => {
          if (cell.startsWith(":") && cell.endsWith(":")) return "center";
          if (cell.endsWith(":")) return "right";
          return "left";
        });
        const table = doc.createElement("table");
        table.className = "pw-table";
        // 表头
        const thead = doc.createElement("thead");
        const hRow = doc.createElement("tr");
        parseCells(tableLines[0]).forEach((cell, idx) => {
          const th = doc.createElement("th");
          th.style.textAlign = alignments[idx] ?? "left";
          appendInline(doc, th, cell);
          hRow.appendChild(th);
        });
        thead.appendChild(hRow);
        table.appendChild(thead);
        // 表体
        if (tableLines.length > 2) {
          const tbody = doc.createElement("tbody");
          for (let r = 2; r < tableLines.length; r++) {
            const tr = doc.createElement("tr");
            parseCells(tableLines[r]).forEach((cell, idx) => {
              const td = doc.createElement("td");
              td.style.textAlign = alignments[idx] ?? "left";
              appendInline(doc, td, cell);
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          }
          table.appendChild(tbody);
        }
        el.appendChild(table);
      } else {
        // 不满足表格格式，退回为普通段落行
        for (const tl of tableLines) paraLines.push(tl);
      }
      continue;
    }

    // 空行 → 刷出段落
    if (line.trim() === "") {
      flushPara();
      i++;
      continue;
    }

    paraLines.push(line);
    i++;
  }
  flushPara();
}

/** 在 el 内追加行内 markdown（粗体 / 斜体 / 行内代码 / 行内公式），单行换行转 <br> */
function appendInline(doc: Document, el: Element, text: string): void {
  text.split("\n").forEach((line, idx, arr) => {
    // 分隔符：行内数学 $...$ 优先于其他模式（避免 * 在公式里被误匹配）
    const parts = line.split(
      /(\$\$[^$\n]+\$\$|\$[^$\n]+\$|\\\([^\n]+?\\\)|\*\*\*.+?\*\*\*|\*\*.+?\*\*|\*.+?\*|`.+?`)/,
    );
    for (const part of parts) {
      if (!part) continue;
      // 行内显示数学 $$...$$
      if (/^\$\$[^$]/.test(part) && part.endsWith("$$")) {
        const span = doc.createElement("span");
        renderMath(doc, span, part.slice(2, -2), true);
        el.appendChild(span);
      // 行内数学 $...$
      } else if (part.startsWith("$") && part.endsWith("$") && part.length > 2 && !part.startsWith("$$")) {
        const span = doc.createElement("span");
        renderMath(doc, span, part.slice(1, -1), false);
        el.appendChild(span);
      // 行内数学 \(...\)（LaTeX 风格）
      } else if (part.startsWith("\\(") && part.endsWith("\\)")) {
        const span = doc.createElement("span");
        renderMath(doc, span, part.slice(2, -2), false);
        el.appendChild(span);
      } else if (/^\*\*\*.+\*\*\*$/.test(part)) {
        const s = doc.createElement("strong");
        const e = doc.createElement("em");
        e.textContent = part.slice(3, -3);
        s.appendChild(e);
        el.appendChild(s);
      } else if (/^\*\*.+\*\*$/.test(part)) {
        const s = doc.createElement("strong");
        s.textContent = part.slice(2, -2);
        el.appendChild(s);
      } else if (/^\*.+\*$/.test(part)) {
        const e = doc.createElement("em");
        e.textContent = part.slice(1, -1);
        el.appendChild(e);
      } else if (/^`.+`$/.test(part)) {
        const c = doc.createElement("code");
        c.textContent = part.slice(1, -1);
        el.appendChild(c);
      } else {
        el.appendChild(doc.createTextNode(part));
      }
    }
    if (idx < arr.length - 1) el.appendChild(doc.createElement("br"));
  });
}

/**
 * 用 KaTeX 渲染数学公式（MathML 输出，Firefox 原生渲染，无需 CSS/字体）。
 * 利用"未挂载元素 innerHTML"技巧：在未 append 到文档前设置 innerHTML
 * 是允许的（与 initPanel 中 wrapper.innerHTML 同原理），
 * 再将节点逐一移入目标元素。
 */
function renderMath(doc: Document, el: HTMLElement, latex: string, display: boolean): void {
  try {
    const html = katex.renderToString(latex.trim(), {
      throwOnError: false,
      displayMode: display,
      output: "mathml", // Firefox 原生 MathML，不依赖 KaTeX CSS/字体
    });
    // 未挂载的 tmp 元素可以安全使用 innerHTML
    const tmp = doc.createElement("span");
    tmp.innerHTML = html;
    while (tmp.firstChild) el.appendChild(tmp.firstChild);
  } catch {
    // 兜底：显示原始 LaTeX
    const code = doc.createElement("code");
    code.textContent = display ? `$$${latex}$$` : `$${latex}$`;
    el.appendChild(code);
  }
}

async function buildSystemContent(item: Zotero.Item): Promise<string> {
  const base =
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.systemPrompt.content`,
      true,
    ) as string) ?? "";
  const meta = PaperExtractor.getItemMetadata(item);
  if (!meta.title) return base;

  let ctx = base + "\n\n---\nCurrent paper context:";
  ctx += `\nTitle: ${meta.title}`;
  if (meta.authors.length) ctx += `\nAuthors: ${meta.authors.join(", ")}`;
  if (meta.year) ctx += `\nYear: ${meta.year}`;
  if (meta.abstract) ctx += `\nAbstract: ${meta.abstract}`;

  // 全文注入（最多 80000 字符，约 25 页；Gemini/DeepSeek/OpenAI 上下文均可容纳）
  const fullText = await PaperExtractor.getFullText(item);
  if (fullText) {
    ctx += `\n\nFull text (excerpt):\n${fullText.slice(0, 80000)}`;
    if (fullText.length > 80000) ctx += "\n[truncated…]";
  }

  return ctx;
}

// ── 会话持久化 ───────────────────────────────────────────────────────────────

interface SessionData {
  version: number;
  title: string;
  created: string; // ISO 8601
  updated: string; // ISO 8601
  messages: Array<{ role: string; content: string }>;
}

/**
 * 将 SessionData 序列化为 base64 字符串。
 * 用 TextEncoder 确保 Unicode 正确处理，避免 btoa 对非 ASCII 字符报错。
 */
function sessionToBase64(data: SessionData): string {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** 从 base64 字符串还原 SessionData */
function base64ToSession(b64: string): SessionData {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes)) as SessionData;
}

/**
 * 构建 Zotero 笔记 HTML。
 * 数据存储在 <details> 内的 <code class="pw-archive-data"> 中（base64 编码）。
 * - <details> 是标准 HTML，Zotero 笔记视图（web 引擎）默认折叠，用户不会看到 base64 字符串
 * - <code> 是普通标签，Zotero 不会过滤（<script> 会被过滤，style="display:none" 会被过滤）
 */
function buildNoteHtml(title: string, visibleMsgs: Array<{ role: string; content: string }>, data: SessionData): string {
  const rows = visibleMsgs
    .map((m) => `<p><b>${m.role === "user" ? "用户" : "AI"}：</b>${escapeHtml(m.content)}</p>`)
    .join("\n");
  const b64 = sessionToBase64(data);
  return (
    `<h2>PaperWorm · ${escapeHtml(title)}</h2>\n` +
    `<div>${rows}</div>\n` +
    `<details><summary>会话元数据</summary><code class="pw-archive-data">${b64}</code></details>`
  );
}

/** 从笔记 HTML 中提取 SessionData，返回 null 表示非 PaperWorm 笔记或解析失败 */
function parseNoteHtml(html: string): SessionData | null {
  const codeMatch = html.match(/<code[^>]*class="pw-archive-data"[^>]*>([A-Za-z0-9+/=\s]+)<\/code>/);
  if (codeMatch) {
    try {
      return base64ToSession(codeMatch[1].trim());
    } catch { /* fall through */ }
  }
  return null;
}

/** 自动保存当前会话到 Zotero child note（每次 AI 响应完成后调用） */
async function saveSession(item: Zotero.Item, history: ChatHistory): Promise<void> {
  const msgs = history.getAll();
  const visibleMsgs = msgs.filter((m) => m.role !== "system");
  if (!visibleMsgs.length) return;

  // 标题 = 首条用户消息前 25 字（去换行）
  const firstUser = visibleMsgs.find((m) => m.role === "user");
  const title = firstUser
    ? firstUser.content.replace(/\n/g, " ").trim().slice(0, 25)
    : "未命名会话";

  const now = new Date().toISOString();
  const existingID = activeNoteIDs.get(getItemKey(item)) ?? null;

  let created = now;
  if (existingID != null) {
    // 保留原 created 时间
    try {
      const prev = parseNoteHtml(Zotero.Items.get(existingID).getNote());
      if (prev?.created) created = prev.created;
    } catch { /* ignore */ }
  }

  const data: SessionData = { version: 2, title, created, updated: now, messages: msgs };
  const noteContent = buildNoteHtml(title, visibleMsgs, data);

  if (existingID != null) {
    const note = Zotero.Items.get(existingID);
    note.setNote(noteContent);
    await note.saveTx();
  } else {
    const note = new Zotero.Item("note");
    note.setNote(noteContent);
    const parentItem = item.isAttachment() ? (item.parentItem ?? item) : item;
    note.parentID = parentItem.id;
    const newID = await note.saveTx();
    activeNoteIDs.set(getItemKey(item), newID as number);
  }
}

/** 读取该论文的所有 PaperWorm 会话，新→旧排序 */
async function loadSessions(
  item: Zotero.Item,
): Promise<Array<{ noteID: number; title: string; updated: string; data: SessionData }>> {
  const parentItem = item.isAttachment() ? (item.parentItem ?? item) : item;
  const noteIDs: number[] = (parentItem as any).getNotes() as number[];
  const results: Array<{ noteID: number; title: string; updated: string; data: SessionData }> = [];

  for (const nid of noteIDs) {
    try {
      const note = Zotero.Items.get(nid);
      const html = note.getNote();
      const data = parseNoteHtml(html);
      if (!data) continue;
      results.push({ noteID: nid, title: data.title, updated: data.updated, data });
    } catch { /* skip malformed */ }
  }

  return results.sort((a, b) => b.updated.localeCompare(a.updated));
}

/** 渲染聊天历史到消息区 */
function renderChatHistory(doc: Document, messagesEl: HTMLElement, item: Zotero.Item): void {
  messagesEl.textContent = "";
  for (const msg of getHistory(item).getAll()) {
    if (msg.role !== "system") {
      appendMessage(doc, messagesEl, msg.role as "user" | "assistant", msg.content,
        msg.role === "assistant");
    }
  }
  scrollToBottom(messagesEl);
}

/** 显示会话列表 */
function showSessionList(
  doc: Document,
  messagesEl: HTMLElement,
  sessions: Array<{ noteID: number; title: string; updated: string; data: SessionData }>,
  item: Zotero.Item,
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
    getHistory(item).clear();
    activeNoteIDs.set(getItemKey(item), null);
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
    if (activeNoteIDs.get(getItemKey(item)) === sess.noteID) {
      row.classList.add("pw-session-active");
    }

    const titleEl = doc.createElement("span");
    titleEl.className = "pw-session-title";
    titleEl.textContent = sess.title;
    row.appendChild(titleEl);

    const metaEl = doc.createElement("span");
    metaEl.className = "pw-session-date";
    metaEl.textContent = sess.updated.slice(0, 10);
    row.appendChild(metaEl);

    const delBtn = doc.createElement("span");
    delBtn.className = "pw-session-del";
    delBtn.setAttribute("role", "button");
    delBtn.setAttribute("tabindex", "0");
    delBtn.textContent = "×";
    row.appendChild(delBtn);

    // 加载会话
    titleEl.addEventListener("click", () => {
      const history = getHistory(item);
      history.clear();
      for (const msg of sess.data.messages) {
        history.add(msg as { role: "user" | "assistant" | "system"; content: string });
      }
      activeNoteIDs.set(getItemKey(item), sess.noteID);
      renderChatHistory(doc, messagesEl, item);
    });

    // 删除会话
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void (async () => {
        try {
          const noteItem = Zotero.Items.get(sess.noteID);
          await noteItem.eraseTx();
          // 若删的是当前激活会话，清空内存
          if (activeNoteIDs.get(getItemKey(item)) === sess.noteID) {
            getHistory(item).clear();
            activeNoteIDs.set(getItemKey(item), null);
          }
          const newSessions = await loadSessions(item);
          showSessionList(doc, messagesEl, newSessions, item);
        } catch { /* ignore */ }
      })();
    });

    list.appendChild(row);
  }

  messagesEl.appendChild(list);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── CSS ──────────────────────────────────────────────────────────────────────

const CHAT_CSS = `
.pw-panel {
  font-size: 13px;
  font-family: inherit;
  box-sizing: border-box;
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
.pw-model-badge {
  font-size: 11px;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.pw-input-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid rgba(128,128,128,0.2);
}
.pw-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid rgba(128,128,128,0.3);
  border-radius: 6px;
  resize: none;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.4;
  background: transparent;
  color: inherit;
  box-sizing: border-box;
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
`;
