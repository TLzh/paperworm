// MinerU ZIP 处理器
// 解压 ZIP，提取结构化 Markdown 文本，移除图片引用（LLM 无法看图，仅保留文字）

import { ExtractionResult } from "./types";

export class ImageHandler {
  /**
   * 处理 ZIP 文件：解压、读取 Markdown、移除图片引用
   */
  static async processZip(
    zipPath: string,
    _parentItem: Zotero.Item,
  ): Promise<ExtractionResult> {
    const tempDir = Zotero.getTempDirectory();
    const extractDir = tempDir.clone();
    extractDir.append(`mineru_extract_${Date.now()}`);

    try {
      // 1. 解压 ZIP 文件
      await this.unzipFile(zipPath, extractDir.path);

      // 2. 查找 Markdown 文件
      const mdFile = await this.findMarkdownFile(extractDir);
      if (!mdFile) {
        throw new Error("ZIP 中未找到 Markdown 文件");
      }

      // 3. 读取 Markdown 内容
      const content = await Zotero.File.getContentsAsync(mdFile.path);
      if (typeof content !== "string") {
        throw new Error("无法读取 Markdown 内容");
      }

      // 4. 移除图片引用（`![alt](path)` → 删除），合并多余空行
      const mdContent = content
        .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return {
        text: mdContent,
        source: "mineru",
        hasStructure: true,
      };
    } finally {
      try {
        await IOUtils.remove(extractDir.path, { recursive: true });
      } catch {
        // 忽略清理错误
      }
    }
  }

  /**
   * 解压 ZIP 文件 — 使用 Gecko 内置 nsIZipReader，无需外部命令
   */
  private static async unzipFile(
    zipPath: string,
    destDir: string,
  ): Promise<void> {
    if (!(await IOUtils.exists(destDir))) {
      await IOUtils.makeDirectory(destDir);
    }

    const zipFile = Zotero.File.pathToFile(zipPath);
    const zipReader = (Components.classes as any)[
      "@mozilla.org/libjar/zip-reader;1"
    ].createInstance((Components.interfaces as any).nsIZipReader);

    zipReader.open(zipFile);
    try {
      const entries = zipReader.findEntries("*");
      while (entries.hasMore()) {
        const entryName: string = entries.getNext();
        if (entryName.endsWith("/")) continue;

        // 安全检查：防止路径遍历攻击
        if (
          entryName.includes("..") ||
          entryName.startsWith("/") ||
          entryName.includes("\\")
        ) {
          ztoolkit.log(`跳过可疑路径: ${entryName}`);
          continue;
        }

        const parts = entryName.split("/").filter((p: string) => p.length > 0);
        const currentDir = Zotero.File.pathToFile(destDir);
        for (let i = 0; i < parts.length - 1; i++) {
          currentDir.append(parts[i]);
          if (!currentDir.exists()) {
            currentDir.create(
              (Components.interfaces as any).nsIFile.DIRECTORY_TYPE,
              0o755,
            );
          }
        }

        const destFile = currentDir.clone();
        destFile.append(parts[parts.length - 1]);
        zipReader.extract(entryName, destFile);
      }
    } finally {
      zipReader.close();
    }
  }

  /**
   * 递归查找 Markdown 文件，优先返回 full.md（MinerU v4 标准输出文件名）
   */
  private static async findMarkdownFile(dir: nsIFile): Promise<nsIFile | null> {
    const fullMd = dir.clone();
    fullMd.append("full.md");
    if (fullMd.exists() && fullMd.isFile()) return fullMd;

    const entries = dir.directoryEntries;
    const subdirs: nsIFile[] = [];
    while (entries.hasMoreElements()) {
      const entry = entries.getNext() as nsIFile;
      if (entry.isFile() && entry.leafName.endsWith(".md")) return entry;
      if (entry.isDirectory()) subdirs.push(entry.clone());
    }
    for (const subdir of subdirs) {
      const found = await this.findMarkdownFile(subdir);
      if (found) return found;
    }
    return null;
  }
}
