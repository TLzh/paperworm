/**
 * Reader 侧边聊天面板
 * 注册为 Zotero Reader 右侧的 Item Pane Section
 */

import { config } from "../../../package.json";
import { LLMManager } from "../llm/manager";
import { ChatHistory } from "../chat/history";
import { PaperExtractor } from "../paper/extractor";
import katex from "katex";

// 每篇论文单独维护一份对话历史（以 item ID 为 key）
const histories = new Map<number, ChatHistory>();

function getHistory(itemID: number): ChatHistory {
  if (!histories.has(itemID)) {
    histories.set(itemID, new ChatHistory());
  }
  return histories.get(itemID)!;
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
      initPanel(body, item);
    },
  });
}

// ── 面板初始化 ───────────────────────────────────────────────────────────────

function initPanel(body: HTMLElement, item: Zotero.Item) {
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
  <div class="pw-header">
    <span class="pw-model-badge">${providerName} · ${modelName}</span>
    <div class="pw-clear-btn" role="button" tabindex="0">清空</div>
  </div>
  <div class="pw-actions">
    <div class="pw-action-btn" role="button" tabindex="0" data-action="summarize">总结本文</div>
    <div class="pw-action-btn" role="button" tabindex="0" data-action="explain">解释段落</div>
    <div class="pw-action-btn" role="button" tabindex="0" data-action="translate">翻译</div>
    <div class="pw-action-btn" role="button" tabindex="0" data-action="quote">引用选中</div>
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

  // 恢复历史消息
  for (const msg of getHistory(item.id).getAll()) {
    if (msg.role !== "system") {
      appendMessage(doc, messagesEl, msg.role as "user" | "assistant", msg.content,
        msg.role === "assistant");
    }
  }
  scrollToBottom(messagesEl);

  bindEvents(doc, panel, messagesEl, item);
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
  const clearBtn = panel.querySelector(".pw-clear-btn") as HTMLElement;

  // 在用户点击面板任何元素之前（mousedown 阶段）捕获 PDF 选区。
  // 此时焦点尚未离开 PDF iframe，选区还在。
  let capturedSelection = "";

  panel.addEventListener(
    "mousedown",
    () => {
      const sel = PaperExtractor.getSelectedText();
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

  clearBtn.addEventListener("click", () => {
    getHistory(item.id).clear();
    messagesEl.textContent = "";
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
  const history = getHistory(item.id);

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
      /(\$\$[^$\n]+\$\$|\$[^$\n]+\$|\*\*\*.+?\*\*\*|\*\*.+?\*\*|\*.+?\*|`.+?`)/,
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

// ── CSS ──────────────────────────────────────────────────────────────────────

const CHAT_CSS = `
.pw-panel {
  font-size: 13px;
  font-family: inherit;
  box-sizing: border-box;
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
.pw-clear-btn {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(128,128,128,0.4);
  background: transparent;
  cursor: pointer;
  color: inherit;
  flex-shrink: 0;
}
.pw-clear-btn:hover { opacity: 0.7; }
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
.pw-math-display {
  text-align: center;
  margin: 8px 0;
  overflow-x: auto;
  padding: 4px 0;
}
`;
