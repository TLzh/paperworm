/**
 * ReaderShell — 论文会话装配层
 * 注册为 Zotero Reader 右侧的 Item Pane Section（仅 reader tab 显示）。
 *
 * v1.0 组件化架构（docs/architecture.md）：
 * - 数据层：chat/sessionStore.ts（会话存取）
 * - 渲染层：chat/markdown.ts + ui/chatWidgets.ts（共享 UI 组件）
 * - 上下文：chat/paperContext.ts（论文系统提示）
 * - 本文件：reader 专属装配（截图/选区/MinerU/总结全文 + ItemPane 注册）
 * - S5 起：聊天骨架将下沉为 chat/core.ts（ChatCore），本文件进一步瘦身
 */

import { config } from "../../../package.json";
import { getHistory, getItemKey, activeNoteIDs } from "../chat/sessionStore";
import { mountChatPanel } from "../chat/core";
import type { ChatHost } from "../chat/types";
import { PaperExtractor } from "../paper/extractor";
import { buildSystemContent } from "../chat/paperContext";
import { MinerUCacheManager } from "../paper/strategies/mineru";
import { clearVisionCache } from "../llm/visionRouter";

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
      const { body, item, tabType, setEnabled } = props as {
        body: HTMLElement;
        item: Zotero.Item;
        tabType: string;
        setEnabled: (enabled: boolean) => void;
      };
      // 还债：仅 reader tab 显示本 section（library view 下图标整体隐藏，
      // 不再出现"点开空白"；官方 API，见 itemPaneSection.js setEnabled→hidden）
      setEnabled(tabType === "reader");
      // 切换论文时清空视觉描述缓存，避免截图 base64 跨会话驻留内存
      clearVisionCache();
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
      // 自诊断：渲染异常不再静默空白，错误直接显示在面板中并落盘
      void initPanel(body, item).catch((e) => {
        try {
          const msg = `${(e as Error)?.message ?? e}`;
          const stack = (e as Error)?.stack ?? "";
          const doc = body.ownerDocument as Document;
          body.textContent = "";
          const box = doc.createElement("div");
          box.style.cssText =
            "padding:12px;font-size:12px;color:#c0392b;white-space:pre-wrap;word-break:break-all;";
          box.textContent = `[PaperWorm] 面板初始化失败：\n${msg}\n${stack}`;
          body.appendChild(box);
          Zotero.Prefs.set(
            `${config.prefsPrefix}.debug.lastPanelError`,
            `${msg}\n${stack}`,
            true,
          );
        } catch {
          /* ignore */
        }
      });
    },
  });
}

// ── 面板初始化 ───────────────────────────────────────────────────────────────

async function initPanel(body: HTMLElement, item: Zotero.Item) {
  const doc = body.ownerDocument as Document;
  body.textContent = "";

  // ReaderShell 装配：reader 全能力 + 论文上下文（见 docs/architecture.md）
  const host: ChatHost = {
    kind: "reader",
    scope: { kind: "paper", item },
    capabilities: {
      selectionChip: true,
      screenshot: true,
      mineru: true,
      summarize: true,
      sessionSidebar: false,
    },
    buildSystemPrompt: () => buildSystemContent(item),
    extractingHint: "正在提取论文全文…",
    getSelectedText: () => PaperExtractor.getSelectedText(item),
    startScreenshot: (onCapture) =>
      startScreenshotCapture(doc, item, onCapture),
    handleAction: (action, textarea, panel) =>
      handleAction(action, textarea, panel, item),
    fillPrompt: (textarea, template) =>
      fillTextareaWithPrompt(textarea, template, item),
  };
  const handle = await mountChatPanel(doc, host, body);
  // MinerU 按钮状态初始化（token 配置与缓存检查）—— reader 专属
  void initMinerUButton(handle.panel, item);
}

// ── 框选区域截图 ──────────────────────────────────────────────────────────────

/**
 * 激活截图模式：在 PDF 视图层注入全屏遮罩，用户拖框后从 PDF.js canvas 采样像素。
 *
 * 注意：主窗口是 XUL 文档（document.body = null），不能直接操作。
 * 遮罩必须注入到含有 PDF.js canvas 元素的 HTML 文档（PDF viewer 内容文档）。
 */
function startScreenshotCapture(
  _panelDoc: Document,
  item: Zotero.Item,
  onCapture: (dataUrl: string) => void,
): void {
  const attachmentID = item.isAttachment()
    ? item.id
    : ((item.getAttachments()[0] as number | undefined) ?? null);
  if (!attachmentID) return;

  const readerWin = _getReaderWindowForAttachment(attachmentID);
  if (!readerWin) return;

  const pdfDoc = _findDocumentWithCanvases(readerWin);
  if (!pdfDoc?.body) return;
  const doc = pdfDoc; // narrowed, non-null alias for use inside closures

  // Inject CSS (idempotent)
  if (!doc.getElementById("pw-capture-css")) {
    const style = doc.createElement("style");
    style.id = "pw-capture-css";
    style.textContent =
      ".pw-capture-overlay{position:fixed;top:0;left:0;right:0;bottom:0;cursor:crosshair;z-index:9999;background:rgba(0,0,0,0.08);}" +
      ".pw-capture-selection{position:fixed;border:2px solid #1a7fd4;background:rgba(26,127,212,0.08);pointer-events:none;z-index:10000;display:none;}";
    (doc.head ?? doc.documentElement!).appendChild(style);
  }

  const overlay = doc.createElement("div");
  overlay.className = "pw-capture-overlay";
  doc.body!.appendChild(overlay);

  const selBox = doc.createElement("div");
  selBox.className = "pw-capture-selection";
  doc.body!.appendChild(selBox);

  let startX = 0,
    startY = 0,
    dragging = false;

  function cleanup() {
    overlay.remove();
    selBox.remove();
    doc.removeEventListener("keydown", escHandler);
  }

  overlay.addEventListener("mousedown", (e: MouseEvent) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    selBox.style.cssText = `display:block;left:${startX}px;top:${startY}px;width:0;height:0;`;
  });

  overlay.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    selBox.style.cssText = `display:block;position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:2px solid #1a7fd4;background:rgba(26,127,212,0.08);pointer-events:none;z-index:10000;`;
  });

  overlay.addEventListener("mouseup", (e: MouseEvent) => {
    if (!dragging) return;
    dragging = false;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    overlay.style.display = "none";
    selBox.style.display = "none";

    const dataUrl = captureFromPDFCanvas(doc, x, y, w, h);
    cleanup();
    if (dataUrl) onCapture(dataUrl);
  });

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") cleanup();
  };
  doc.addEventListener("keydown", escHandler);
}

/**
 * 递归搜索 reader 窗口的帧树，找到包含 PDF.js canvas 元素的文档。
 * PDF.js 渲染的每页都是一个 <canvas>，该文档即为注入遮罩的目标文档。
 */
function _findDocumentWithCanvases(win: any): Document | null {
  const visited = new Set<any>();

  function search(w: any): Document | null {
    if (!w || visited.has(w)) return null;
    visited.add(w);

    try {
      const doc = w.document as Document;
      if (doc?.querySelector?.("canvas")) return doc;
    } catch {
      /* cross-origin */
    }

    try {
      for (let i = 0; i < (w.frames?.length ?? 0); i++) {
        try {
          const r = search(w.frames[i]);
          if (r) return r;
        } catch {
          /* cross-origin */
        }
      }
    } catch {
      /* ignore */
    }

    try {
      const els = Array.from(
        w.document?.querySelectorAll?.("iframe, browser") ?? [],
      ) as any[];
      for (const el of els) {
        try {
          const r = search(el.contentWindow);
          if (r) return r;
        } catch {
          /* cross-origin */
        }
      }
    } catch {
      /* ignore */
    }

    return null;
  }

  return search(win);
}

/**
 * 从 PDF.js canvas 元素中裁剪指定视口矩形区域（CSS 像素坐标）。
 * 选区可跨多个页面 canvas，按空间位置拼合到输出图像。
 */
function captureFromPDFCanvas(
  pdfDoc: Document,
  selX: number,
  selY: number,
  selW: number,
  selH: number,
): string | null {
  if (selW < 4 || selH < 4) return null;

  try {
    const offscreen = pdfDoc.createElement("canvas");
    offscreen.width = Math.round(selW);
    offscreen.height = Math.round(selH);
    const ctx = offscreen.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);

    const canvases = Array.from(
      pdfDoc.querySelectorAll("canvas"),
    ) as HTMLCanvasElement[];
    let captured = false;

    for (const canvas of canvases) {
      if (!canvas.width || !canvas.height) continue;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;

      const intLeft = Math.max(selX, rect.left);
      const intTop = Math.max(selY, rect.top);
      const intRight = Math.min(selX + selW, rect.right);
      const intBottom = Math.min(selY + selH, rect.bottom);
      if (intRight <= intLeft || intBottom <= intTop) continue;

      const intW = intRight - intLeft;
      const intH = intBottom - intTop;

      // Canvas intrinsic pixels : CSS pixels
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const srcX = (intLeft - rect.left) * scaleX;
      const srcY = (intTop - rect.top) * scaleY;
      const srcW = intW * scaleX;
      const srcH = intH * scaleY;

      const destX = intLeft - selX;
      const destY = intTop - selY;

      ctx.drawImage(canvas, srcX, srcY, srcW, srcH, destX, destY, intW, intH);
      captured = true;
    }

    if (!captured) return null;

    // Scale down for vision API: cap long side at 1024px, encode as JPEG to shrink payload
    const MAX_SIDE = 1024;
    const longSide = Math.max(offscreen.width, offscreen.height);
    if (longSide > MAX_SIDE) {
      const scale = MAX_SIDE / longSide;
      const scaled = pdfDoc.createElement("canvas");
      scaled.width = Math.round(offscreen.width * scale);
      scaled.height = Math.round(offscreen.height * scale);
      const sctx = scaled.getContext("2d") as CanvasRenderingContext2D | null;
      if (sctx) {
        sctx.drawImage(offscreen, 0, 0, scaled.width, scaled.height);
        return scaled.toDataURL("image/jpeg", 0.9);
      }
    }
    return offscreen.toDataURL("image/png");
  } catch (e) {
    Zotero.log(`PaperWorm: captureFromPDFCanvas failed — ${e}`, "error");
    return null;
  }
}

/**
 * 通过 Zotero_Tabs + Zotero.Reader._readers 找到指定附件 ID 对应的 reader 窗口。
 * 与 PaperExtractor._getReaderWindow() 逻辑相同（私有方法不可跨模块调用，故复制）。
 */
function _getReaderWindowForAttachment(attachmentID: number): Window | null {
  const mainWin = Zotero.getMainWindow() as any;
  if (!mainWin) return null;

  // Zotero_Tabs 挂在主窗口全局；插件 sandbox 的 globalThis 上没有
  const tabs = mainWin.Zotero_Tabs;
  const allTabs: any[] = tabs?._tabs ?? [];

  for (const tab of allTabs) {
    if (tab?.type !== "reader") continue;
    if (tab?.data?.itemID !== attachmentID) continue;
    try {
      const tabCont = mainWin.document?.getElementById?.(tab.id);
      if (!tabCont) continue;
      const browser =
        tabCont.querySelector?.("browser.reader") ??
        tabCont.querySelector?.("browser");
      if (browser?.contentWindow) return browser.contentWindow as Window;
    } catch {
      /* skip */
    }
  }

  try {
    const readers: any[] = (Zotero.Reader as any)._readers ?? [];
    for (const r of readers) {
      if (r?.itemID !== attachmentID) continue;
      const win = r._iframeWindow ?? r._iframe?.contentWindow ?? null;
      if (win) return win as Window;
    }
  } catch {
    /* ignore */
  }

  return null;
}

// ── 快捷操作 ─────────────────────────────────────────────────────────────────

function handleAction(
  action: string,
  textarea: HTMLTextAreaElement,
  panel: HTMLElement,
  item: Zotero.Item,
) {
  switch (action) {
    case "mineru":
      void handleMinerUExtraction(panel, item);
      return;
    case "summarize": {
      const summarizePrompt =
        (Zotero.Prefs.get(
          `${config.prefsPrefix}.action.summarizePrompt`,
          true,
        ) as string) ||
        "请对这篇论文做一个结构化总结，包括：研究问题、方法、主要发现、贡献和局限性。\n\n论文标题：{title}";
      fillTextareaWithPrompt(textarea, summarizePrompt, item);
      return;
    }
    default:
      // 未知动作：仅聚焦
      textarea.focus();
  }
}

/**
 * 将含元数据占位符的提示词模板填入输入框并聚焦。
 * 供"总结全文"与自定义快捷按钮共用；支持 {title}/{authors}/{year}/{abstract}/{doi}。
 */
function fillTextareaWithPrompt(
  textarea: HTMLTextAreaElement,
  template: string,
  item: Zotero.Item,
): void {
  const meta = PaperExtractor.getItemMetadata(item);
  textarea.value = template
    .replaceAll("{title}", meta.title)
    .replaceAll("{authors}", meta.authors.join(", "))
    .replaceAll("{year}", meta.year)
    .replaceAll("{abstract}", meta.abstract)
    .replaceAll("{doi}", meta.doi);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  // 触发高度调整
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

// ── MinerU 精细提取 ───────────────────────────────────────────────────────────

/**
 * 初始化 MinerU 按钮状态（异步）：
 * - 无 Token → 隐藏
 * - 有 Token 且已缓存 → "✓ 精细文本"
 * - 有 Token 未缓存 → "⚡ 精细提取"
 */
async function initMinerUButton(
  panel: HTMLElement,
  item: Zotero.Item,
): Promise<void> {
  const btn = panel.querySelector(".pw-mineru-btn") as HTMLElement | null;
  if (!btn) return;

  const token = Zotero.Prefs.get(
    `${config.prefsPrefix}.mineru.apiToken`,
    true,
  ) as string;
  if (!token) return; // 无 Token，保持隐藏

  btn.style.display = "inline-block";
  const hasCache = await MinerUCacheManager.hasCache(item);
  setMinerUBtnState(btn, hasCache ? "cached" : "ready");
}

function setMinerUBtnState(
  btn: HTMLElement,
  state: "ready" | "cached" | "busy",
): void {
  btn.classList.remove("pw-mineru-cached", "pw-disabled");
  switch (state) {
    case "ready":
      btn.textContent = "⚡ 精细提取";
      btn.title = "使用 MinerU 提取结构化文本（表格/公式）";
      break;
    case "cached":
      btn.textContent = "✓ 精细文本";
      btn.title = "已提取精细文本，当前对话使用此内容";
      btn.classList.add("pw-mineru-cached", "pw-disabled");
      break;
    case "busy":
      btn.textContent = "提取中...";
      btn.title = "";
      btn.classList.add("pw-disabled");
      break;
  }
}

async function handleMinerUExtraction(
  panel: HTMLElement,
  item: Zotero.Item,
): Promise<void> {
  const btn = panel.querySelector(".pw-mineru-btn") as HTMLElement | null;
  if (!btn || btn.classList.contains("pw-disabled")) return;

  const progressEl = panel.querySelector(
    ".pw-pdf-progress",
  ) as HTMLElement | null;
  const progressFill = panel.querySelector(
    ".pw-progress-fill",
  ) as HTMLElement | null;
  const progressText = panel.querySelector(
    ".pw-progress-text",
  ) as HTMLElement | null;

  setMinerUBtnState(btn, "busy");
  if (progressEl) {
    progressEl.style.display = "";
    if (progressFill) progressFill.style.width = "0%";
    if (progressText) progressText.textContent = "准备上传...";
  }

  try {
    await PaperExtractor.triggerMinerUExtraction(
      item,
      (stage, message, percent) => {
        if (progressFill) progressFill.style.width = `${percent}%`;
        if (progressText) progressText.textContent = message;
      },
    );
    // 成功：立即隐藏进度条，按钮变为已缓存状态
    if (progressEl) progressEl.style.display = "none";
    setMinerUBtnState(btn, "cached");
  } catch (error: any) {
    ztoolkit.log("MinerU 精细提取失败:", error);
    // 失败：显示错误信息 2 秒后隐藏，按钮复原
    setMinerUBtnState(btn, "ready");
    if (progressText) progressText.textContent = `提取失败：${error.message}`;
    const win = panel.ownerDocument?.defaultView;
    if (win)
      win.setTimeout(() => {
        if (progressEl) progressEl.style.display = "none";
      }, 2000);
  }
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────
