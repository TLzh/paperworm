// Zotero 类型增强（从 src/modules/paper/extractor.ts 迁移）
// zotero-types 未提供 PDFWorker.getFullText 的类型声明，此处补充。
// 注意：不声明 const PDFWorker，因为它已经在 Zotero 全局对象中
declare global {
  namespace Zotero {
    interface PDFWorkerInstance {
      getFullText(
        itemID: number,
        maxPages: number | null,
      ): Promise<{
        text: string;
        extractedPages: number;
        totalPages: number;
      }>;
    }
  }
}

export {};
