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
    // Zotero_Tabs 是主窗口的全局变量，通过 any 访问
    const tabs = (globalThis as any).Zotero_Tabs;
    const reader = Zotero.Reader.getByTabID(tabs?.selectedID as string);
    if (!reader || reader.itemID == null) return null;
    return Zotero.Items.get(reader.itemID);
  }

  /** 获取 Reader 中当前选中的文字 */
  static getSelectedText(): string {
    try {
      const tabs = (globalThis as any).Zotero_Tabs;
      const reader = Zotero.Reader.getByTabID(tabs?.selectedID as string);
      // PDF.js 渲染在 reader._iframeWindow 里，选区独立于主窗口
      const text = (reader as any)?._iframeWindow?.getSelection()?.toString()?.trim() ?? "";
      return text;
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
