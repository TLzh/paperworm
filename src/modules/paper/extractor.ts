// Paper Extractor — 从 Zotero Reader 中提取论文内容
// 供 LLM 使用的上下文来源

export interface PaperMetadata {
  title: string;
  authors: string[];
  year: string;
  abstract: string;
  doi: string;
  itemKey: string;
}

export class PaperExtractor {
  /** 获取当前 Reader 中打开的条目 */
  static getCurrentItem(): Zotero.Item | null {
    const tabs = (globalThis as any).Zotero_Tabs;
    const reader = Zotero.Reader.getByTabID(tabs?.selectedID as string);
    if (!reader || reader.itemID == null) return null;
    return Zotero.Items.get(reader.itemID);
  }

  /**
   * 获取 Reader 中当前选中的文字。
   * 从 Zotero 主窗口出发递归遍历所有 frame（包括 XUL <browser> 元素）。
   */
  static getSelectedText(): string {
    try {
      const mainWin = Zotero.getMainWindow() as any;
      return mainWin
        ? (PaperExtractor._findInFrames<string>(
            mainWin,
            (win) => {
              const t = (win as any).getSelection?.()?.toString?.()?.trim?.() ?? "";
              return t || null;
            },
            new Set(),
          ) ?? "")
        : "";
    } catch {
      return "";
    }
  }

  /**
   * 获取 PDF 全文。三级策略：
   * 1. Zotero 全文索引（已索引时最快）
   * 2. 触发 Zotero 对该附件即时索引后再读
   * 3. 直接读取 Reader 已渲染的 DOM .textLayer 文字层
   *
   * ⚠️ strategy 3 必须限定到目标 PDF 的 reader window，
   *    绝不使用 getMainWindow() 全局搜索 —— 多 tab 时会读到其他 PDF 的内容。
   */
  static async getFullText(item: Zotero.Item): Promise<string> {
    const attachment = item.isAttachment()
      ? item
      : Zotero.Items.get(item.getAttachments()[0]);

    // 1. 尝试 Zotero 全文索引（已索引时立即返回）
    if (attachment) {
      try {
        const result = await (Zotero.Fulltext as any).getItemContent(attachment);
        const text =
          typeof result === "string" ? result : (result?.content ?? "");
        if (text.trim()) return text;
      } catch { /* fall through */ }
    }

    // 2. 触发即时索引后重试（Zotero 内置 pdftotext，不依赖 Reader 是否打开）
    if (attachment) {
      try {
        await (Zotero.Fulltext as any).indexItems([attachment.id], {complete: true});
        const result = await (Zotero.Fulltext as any).getItemContent(attachment);
        const text =
          typeof result === "string" ? result : (result?.content ?? "");
        if (text.trim()) return text;
      } catch { /* fall through */ }
    }

    // 3. 直接读取 Reader 已渲染的 .textLayer DOM 元素
    // 必须限定到目标 reader 的 window，不可 fallback 到 getMainWindow()。
    try {
      const attachmentID = attachment?.id ?? item.id;
      const readerWin = PaperExtractor._getReaderWindow(attachmentID);
      if (!readerWin) return ""; // 找不到 reader window → 宁可返回空

      const text = PaperExtractor._findInFrames<string>(
        readerWin,
        (win) => {
          const doc = (win as any).document;
          if (!doc?.querySelectorAll) return null;
          const layers = Array.from(
            doc.querySelectorAll(".textLayer"),
          ) as HTMLElement[];
          if (!layers.length) return null;
          const content = layers
            .map((el) => el.innerText ?? el.textContent ?? "")
            .join("\n\n")
            .replace(/[ \t]{2,}/g, " ")
            .trim();
          return content.length > 200 ? content : null;
        },
        new Set(),
      );
      if (text) return text;
    } catch { /* fall through */ }

    return "";
  }

  /** 提取条目元数据 */
  static getItemMetadata(item: Zotero.Item): PaperMetadata {
    const parent = item.isAttachment() ? item.parentItem : item;
    return {
      title: (parent?.getField("title") as string) ?? "",
      authors:
        parent?.getCreators().map((c) => `${c.firstName} ${c.lastName}`) ?? [],
      year: (parent?.getField("year") as string) ?? "",
      abstract: (parent?.getField("abstractNote") as string) ?? "",
      doi: (parent?.getField("DOI") as string) ?? "",
      itemKey: parent?.key ?? "",
    };
  }

  // ── 私有工具 ────────────────────────────────────────────────────────────────

  /**
   * 找到与指定附件 ID 对应的 Reader iframe window（即 browser.contentWindow）。
   * 返回 null 时调用方应返回空字符串，不做全局搜索。
   *
   * 根据 Zotero 源码（reader.js）确认的 DOM 结构：
   *   _tabContainer = <tab-content id="{tabID}">   ← Zotero_Tabs.add() 返回的 container
   *     _iframe     = <browser class="reader" />   ← createXULElement('browser')
   *
   * Zotero_Tabs._tabs 每个 reader tab 的 data.itemID = 附件 item ID（reader.js line 1803）。
   *
   * 因此：getElementById(tabID).querySelector("browser.reader").contentWindow
   * 是最可靠的取法，不依赖任何私有属性是否已初始化。
   */
  private static _getReaderWindow(attachmentID: number): Window | null {
    const mainWin = Zotero.getMainWindow() as any;
    if (!mainWin) return null;

    const tabs = (globalThis as any).Zotero_Tabs;
    const allTabs: any[] = tabs?._tabs ?? [];

    // ── 主路径：_tabs[i].data.itemID 匹配 → getElementById(tabID) → browser ──
    for (const tab of allTabs) {
      if (tab?.type !== "reader") continue;
      if (tab?.data?.itemID !== attachmentID) continue;

      try {
        // _tabContainer.id = tabID（Zotero 源码 reader.js line 1794/1809）
        const tabCont = mainWin.document?.getElementById?.(tab.id);
        if (!tabCont) continue;

        // _iframe 是 <browser class="reader">（reader.js line 1812-1813）
        const browser =
          tabCont.querySelector?.("browser.reader") ??
          tabCont.querySelector?.("browser");
        if (browser?.contentWindow) return browser.contentWindow as Window;
      } catch { /* skip */ }
    }

    // ── 降级：直接访问 Zotero.Reader._readers 数组（reader.js line 2450）──────
    try {
      const readers: any[] = (Zotero.Reader as any)._readers ?? [];
      for (const r of readers) {
        if (r?.itemID !== attachmentID) continue;
        // _iframeWindow = _iframe.contentWindow（reader.js line 1883）
        const win =
          r._iframeWindow ??
          r._iframe?.contentWindow ??
          null;
        if (win) return win as Window;
      }
    } catch { /* ignore */ }

    return null;
  }

  /**
   * 通用 frame 树遍历：深度优先搜索，返回第一个 finder(win) 非 null 的结果。
   * visited Set 防止循环引用。同时通过 frames[] 和 querySelectorAll 两条路搜索，
   * 确保覆盖 HTML <iframe> 和 XUL <browser> 元素。
   */
  private static _findInFrames<T>(
    win: any,
    finder: (w: any) => T | null,
    visited: Set<any>,
  ): T | null {
    if (!win || visited.has(win)) return null;
    visited.add(win);

    try {
      const result = finder(win);
      if (result != null) return result;
    } catch { /* ignore */ }

    // 通过 frames[] 遍历
    try {
      for (let i = 0; i < (win.frames?.length ?? 0); i++) {
        try {
          const r = PaperExtractor._findInFrames(win.frames[i], finder, visited);
          if (r != null) return r;
        } catch { /* cross-origin */ }
      }
    } catch { /* ignore */ }

    // 通过 DOM 元素遍历（补充 XUL <browser>）
    try {
      const elements = Array.from(
        win.document?.querySelectorAll?.("iframe, browser") ?? [],
      ) as any[];
      for (const el of elements) {
        try {
          const cw = el.contentWindow;
          if (cw) {
            const r = PaperExtractor._findInFrames(cw, finder, visited);
            if (r != null) return r;
          }
        } catch { /* cross-origin */ }
      }
    } catch { /* ignore */ }

    return null;
  }

}
