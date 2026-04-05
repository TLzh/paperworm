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
   * PDF.js 渲染在 reader._iframeWindow 内的嵌套 iframe 里，
   * 需要逐层向下搜索才能拿到真正的选区。
   */
  static getSelectedText(): string {
    try {
      const tabs = (globalThis as any).Zotero_Tabs;
      const reader = Zotero.Reader.getByTabID(tabs?.selectedID as string);
      if (!reader) return "";

      const readerWin = (reader as any)?._iframeWindow as Window | undefined;
      if (!readerWin) return "";

      // 第一层：reader 应用本身
      let text = readerWin.getSelection()?.toString()?.trim() ?? "";
      if (text) return text;

      // 第二层：PDF.js viewer（通常在嵌套的 <iframe> 里）
      const iframes = Array.from(
        readerWin.document?.querySelectorAll("iframe") ?? [],
      ) as HTMLIFrameElement[];

      for (const iframe of iframes) {
        try {
          const win = iframe.contentWindow;
          text = win?.getSelection()?.toString()?.trim() ?? "";
          if (text) return text;

          // 第三层：部分 PDF.js 版本还有一层嵌套
          const inner = Array.from(
            win?.document?.querySelectorAll("iframe") ?? [],
          ) as HTMLIFrameElement[];
          for (const sub of inner) {
            try {
              text = sub.contentWindow?.getSelection()?.toString()?.trim() ?? "";
              if (text) return text;
            } catch { /* cross-origin */ }
          }
        } catch { /* cross-origin */ }
      }

      return "";
    } catch {
      return "";
    }
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
