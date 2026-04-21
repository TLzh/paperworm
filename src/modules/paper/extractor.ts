// Paper Extractor — 从 Zotero Reader 中提取论文内容
// 供 LLM 使用的上下文来源

import {
  MinerUClient,
  MinerUCacheManager,
  ImageHandler,
} from "./strategies/mineru";

export interface PaperMetadata {
  title: string;
  authors: string[];
  year: string;
  abstract: string;
  doi: string;
  itemKey: string;
}

// 扩展 Zotero 类型声明 - PDFWorker 方法
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

export class PaperExtractor {
  /** 跟踪正在提取 MinerU 的条目 ID，防止重复请求 */
  private static _extractingItems = new Set<number>();
  /** 获取当前 Reader 中打开的条目 */
  static getCurrentItem(): Zotero.Item | null {
    const tabs = (globalThis as any).Zotero_Tabs;
    const reader = Zotero.Reader.getByTabID(tabs?.selectedID as string);
    if (!reader || reader.itemID == null) return null;
    return Zotero.Items.get(reader.itemID);
  }

  /**
   * 获取当前论文 Reader 中选中的文字。
   *
   * 必须传入 item，只在该 item 对应的 reader window 里搜索——
   * 否则全局遍历会捡到其他 tab 中 PDF 的残留选区（多 tab 时的常见 bug）。
   */
  static getSelectedText(item: Zotero.Item): string {
    try {
      const attachmentID = item.isAttachment()
        ? item.id
        : (item.getAttachments()[0] ?? null);
      if (!attachmentID) return "";

      const readerWin = PaperExtractor._getReaderWindow(attachmentID as number);
      if (!readerWin) return "";

      return (
        PaperExtractor._findInFrames<string>(
          readerWin,
          (win) => {
            const t =
              (win as any).getSelection?.()?.toString?.()?.trim?.() ?? "";
            return t || null;
          },
          new Set(),
        ) ?? ""
      );
    } catch {
      return "";
    }
  }

  /**
   * 获取 PDF 全文。
   * 优先使用 MinerU 精细缓存（已通过"精细提取"按钮提取过），否则使用 Zotero 原生提取。
   */
  static async getFullText(item: Zotero.Item): Promise<string> {
    // 优先使用 MinerU 精细缓存
    const cached = await MinerUCacheManager.getCachedContent(item);
    if (cached) {
      ztoolkit.log("使用 MinerU 精细文本缓存");
      return cached;
    }
    return this.extractWithZotero(item);
  }

  /**
   * 触发 MinerU 精细提取（由用户主动点击"精细提取"按钮调用）。
   * 提取完成后自动缓存为 Zotero 笔记，后续 getFullText 会直接使用缓存。
   */
  static async triggerMinerUExtraction(
    item: Zotero.Item,
    onProgress?: (stage: string, message: string, percent: number) => void,
  ): Promise<string> {
    // 检查是否已在提取中
    const itemId = item.id;
    if (this._extractingItems.has(itemId)) {
      throw new Error("正在提取中，请稍候...");
    }

    try {
      this._extractingItems.add(itemId);
      return await this.extractWithMinerU(item, onProgress);
    } finally {
      this._extractingItems.delete(itemId);
    }
  }

  /**
   * 使用 MinerU 提取 PDF（内部实现）
   */
  private static async extractWithMinerU(
    item: Zotero.Item,
    onProgress?: (stage: string, message: string, percent: number) => void,
  ): Promise<string> {
    // 1. 检查缓存
    const cached = await MinerUCacheManager.getCachedContent(item);
    if (cached) {
      ztoolkit.log("使用 MinerU 缓存内容");
      onProgress?.("cached", "使用缓存内容", 100);
      return cached;
    }

    // 2. 获取 MinerU API Token
    const token = Zotero.Prefs.get(
      "extensions.zotero.paperworm.mineru.apiToken",
      true,
    ) as string;

    if (!token) {
      ztoolkit.log("MinerU API Token 未配置，回退到 Zotero 模式");
      throw new Error("MinerU API Token 未配置");
    }

    // 3. 获取 PDF 文件路径
    const attachment = item.isAttachment()
      ? item
      : Zotero.Items.get(item.getAttachments()[0]);

    if (!attachment) return "";

    const filePath = await attachment.getFilePathAsync();
    if (!filePath) {
      ztoolkit.log("无法获取 PDF 文件路径");
      throw new Error("无法获取 PDF 文件路径");
    }

    // 4. 调用 MinerU API
    let zipPath: string | null = null;
    try {
      onProgress?.("uploading", "正在上传 PDF...", 10);
      ztoolkit.log("开始使用 MinerU 提取 PDF...");

      const client = new MinerUClient({
        apiToken: token,
        enableTable: true,
        enableFormula: true,
        language: "ch",
      });

      // 提取（包括上传、轮询、下载 ZIP）
      zipPath = await client.extractPDF(
        filePath,
        undefined,
        (stage, current, total) => {
          const percent = Math.round((current / total) * 100);
          let message = "正在处理...";
          switch (stage) {
            case "uploading":
              message = "正在上传 PDF...";
              break;
            case "waiting":
              message = "排队等待中（VLM 模型通常需要 2–5 分钟）...";
              break;
            case "processing":
              message = "MinerU 正在解析...";
              break;
            case "downloading":
              message = "正在下载结果...";
              break;
            case "completed":
              message = "处理完成";
              break;
          }
          onProgress?.(stage, message, percent);
        },
      );

      onProgress?.("processing", "正在处理结果...", 95);

      // 5. 处理 ZIP（解压、图片本地化）
      const processedResult = await ImageHandler.processZip(zipPath, item);

      // 6. 保存到缓存
      await MinerUCacheManager.saveCache(processedResult.text, item);

      // 7. 清理 ZIP 文件
      try {
        await IOUtils.remove(zipPath);
      } catch {
        // 忽略清理错误
      }

      onProgress?.("completed", "完成", 100);
      return processedResult.text;
    } catch (error: any) {
      ztoolkit.log("MinerU 提取失败:", error);

      // 清理 ZIP 文件
      if (zipPath) {
        try {
          await IOUtils.remove(zipPath);
        } catch {
          // 忽略
        }
      }

      // 抛出错误，让调用者处理
      throw error;
    }
  }

  /**
   * 使用 Zotero 原生功能提取 PDF
   */
  private static async extractWithZotero(item: Zotero.Item): Promise<string> {
    const attachment = item.isAttachment()
      ? item
      : Zotero.Items.get(item.getAttachments()[0]);

    if (!attachment) return "";

    // 策略 1：尝试读取已有索引（最快）
    try {
      const result = await (Zotero.Fulltext as any).getItemContent(attachment);
      const text =
        typeof result === "string" ? result : (result?.content ?? "");
      if (text.trim()) return text;
    } catch {
      /* continue */
    }

    // 策略 2：使用 Zotero PDFWorker 直接提取全文（最可靠）
    try {
      ztoolkit.log("Using Zotero PDFWorker to extract full text...");
      const result = await Zotero.PDFWorker.getFullText(attachment.id, null);
      if (result?.text) {
        ztoolkit.log(
          `PDFWorker extracted ${result.extractedPages}/${result.totalPages} pages`,
        );
        return result.text;
      }
    } catch (e) {
      ztoolkit.log("PDFWorker extraction failed:", e);
    }

    // 降级方案：如果 PDFWorker 失败，尝试 .textLayer（只能获取已渲染页面）
    try {
      ztoolkit.log("Falling back to .textLayer extraction...");
      const attachmentID = attachment.id;
      const readerWin = PaperExtractor._getReaderWindow(attachmentID);
      if (!readerWin) return "";

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
      if (text) {
        ztoolkit.log(
          ".textLayer extraction successful (limited to rendered pages)",
        );
        return text;
      }
    } catch {
      /* ignore */
    }

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
      } catch {
        /* skip */
      }
    }

    // ── 降级：直接访问 Zotero.Reader._readers 数组（reader.js line 2450）──────
    try {
      const readers: any[] = (Zotero.Reader as any)._readers ?? [];
      for (const r of readers) {
        if (r?.itemID !== attachmentID) continue;
        // _iframeWindow = _iframe.contentWindow（reader.js line 1883）
        const win = r._iframeWindow ?? r._iframe?.contentWindow ?? null;
        if (win) return win as Window;
      }
    } catch {
      /* ignore */
    }

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
    } catch {
      /* ignore */
    }

    // 通过 frames[] 遍历
    try {
      for (let i = 0; i < (win.frames?.length ?? 0); i++) {
        try {
          const r = PaperExtractor._findInFrames(
            win.frames[i],
            finder,
            visited,
          );
          if (r != null) return r;
        } catch {
          /* cross-origin */
        }
      }
    } catch {
      /* ignore */
    }

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
        } catch {
          /* cross-origin */
        }
      }
    } catch {
      /* ignore */
    }

    return null;
  }
}
