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
   * 从 Zotero 主窗口出发递归遍历所有 frame（包括 XUL <browser> 元素），
   * 这样无论 PDF.js 嵌套多深都能找到选区。
   * 用 visited Set 防止循环引用。
   */
  static getSelectedText(): string {
    try {
      const mainWin = Zotero.getMainWindow() as any;
      return mainWin ? PaperExtractor._searchSelection(mainWin, new Set()) : "";
    } catch {
      return "";
    }
  }

  private static _searchSelection(win: any, visited: Set<any>): string {
    if (!win || visited.has(win)) return "";
    visited.add(win);

    // 当前 window 的选区
    try {
      const text = win.getSelection?.()?.toString?.()?.trim?.() ?? "";
      if (text) return text;
    } catch { /* ignore */ }

    // 通过 frames[] 遍历子框架
    try {
      for (let i = 0; i < (win.frames?.length ?? 0); i++) {
        try {
          const result = PaperExtractor._searchSelection(win.frames[i], visited);
          if (result) return result;
        } catch { /* cross-origin */ }
      }
    } catch { /* ignore */ }

    // 通过 DOM 查询（捕获 XUL <browser> 元素，它不一定出现在 frames[] 里）
    try {
      const elements = Array.from(
        win.document?.querySelectorAll?.("iframe, browser") ?? [],
      ) as any[];
      for (const el of elements) {
        try {
          const cw = el.contentWindow;
          if (cw) {
            const result = PaperExtractor._searchSelection(cw, visited);
            if (result) return result;
          }
        } catch { /* cross-origin */ }
      }
    } catch { /* ignore */ }

    return "";
  }

  /**
   * 获取 Zotero 已索引的 PDF 全文。
   * 返回空字符串表示尚未索引或不支持。
   */
  static async getFullText(item: Zotero.Item): Promise<string> {
    try {
      // item 可能是 attachment，也可能是 parent；全文索引挂在 attachment 上
      const attachment = item.isAttachment()
        ? item
        : Zotero.Items.get(item.getAttachments()[0]);
      if (!attachment) return "";

      const result = await (Zotero.Fulltext as any).getItemContent(attachment);
      if (!result) return "";
      // Zotero 7 返回 { content: string, ... }，早期版本直接返回字符串
      return typeof result === "string" ? result : (result.content ?? "");
    } catch {
      return "";
    }
  }

  /** 提取条目元数据 */
  static getItemMetadata(item: Zotero.Item): PaperMetadata {
    const parent = item.isAttachment() ? item.parentItem : item;
    return {
      title: parent?.getField("title") as string ?? "",
      authors: parent?.getCreators().map((c) => `${c.firstName} ${c.lastName}`) ?? [],
      year: parent?.getField("year") as string ?? "",
      abstract: parent?.getField("abstractNote") as string ?? "",
      doi: parent?.getField("DOI") as string ?? "",
      itemKey: parent?.key ?? "",
    };
  }
}
