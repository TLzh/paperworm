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
   * 获取 PDF 全文。
   * 优先使用 Zotero 全文索引；如未索引，则通过 PDF.js API
   * 从已打开的 Reader 实时提取（无需额外索引步骤）。
   */
  static async getFullText(item: Zotero.Item): Promise<string> {
    // 1. 尝试 Zotero 全文索引
    try {
      const attachment = item.isAttachment()
        ? item
        : Zotero.Items.get(item.getAttachments()[0]);
      if (attachment) {
        const result = await (Zotero.Fulltext as any).getItemContent(attachment);
        const text =
          typeof result === "string" ? result : (result?.content ?? "");
        if (text.trim()) return text;
      }
    } catch { /* fall through */ }

    // 2. 通过 PDF.js 从已打开的 Reader 提取
    try {
      const tabs = (globalThis as any).Zotero_Tabs;
      const reader = Zotero.Reader.getByTabID(tabs?.selectedID as string);
      const readerWin = (reader as any)?._iframeWindow;
      if (!readerWin) return "";

      const pdfApp = PaperExtractor._findInFrames<any>(
        readerWin,
        (win) => {
          // chrome 上下文访问 content JS 全局需通过 wrappedJSObject
          const w = (win as any).wrappedJSObject ?? win;
          const app = w.PDFViewerApplication;
          return app?.pdfDocument ? app : null;
        },
        new Set(),
      );
      if (!pdfApp) return "";

      return await PaperExtractor._extractPDFText(pdfApp);
    } catch {
      return "";
    }
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

  /** 通过 PDF.js PDFViewerApplication 提取全文（最多 50 页） */
  private static async _extractPDFText(pdfApp: any): Promise<string> {
    // pdfApp 来自 content 上下文，通过 wrappedJSObject 访问属性
    const pdfDoc = (pdfApp.wrappedJSObject ?? pdfApp).pdfDocument;
    if (!pdfDoc) return "";

    const totalPages: number = pdfDoc.numPages;
    const maxPages = Math.min(totalPages, 50);
    const pageTexts: string[] = [];

    for (let i = 1; i <= maxPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const text = (content.items as any[])
          .map((it) => it.str ?? "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) pageTexts.push(text);
      } catch { /* skip page */ }
    }

    const fullText = pageTexts.join("\n\n");
    return totalPages > maxPages
      ? fullText + `\n\n[extracted from first ${maxPages} of ${totalPages} pages]`
      : fullText;
  }
}
