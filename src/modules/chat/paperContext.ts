/**
 * 论文上下文构建 — ChatHost.buildSystemPrompt() 的 reader 实现
 * S3 平移自 readerPanel.ts（行为零变化）。
 * 独立会话（S5）将提供 standalone 版本：场景 prompt，无论文上下文。
 */

import { config } from "../../../package.json";
import { PaperExtractor } from "../paper/extractor";

export async function buildSystemContent(item: Zotero.Item): Promise<string> {
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

  // 全文注入（最多 400000 字符，约 120 页；现代大模型上下文均可容纳）
  const fullText = await PaperExtractor.getFullText(item);
  if (fullText) {
    ctx += `\n\nFull text (excerpt):\n${fullText.slice(0, 400000)}`;
    if (fullText.length > 400000) ctx += "\n[truncated…]";
  }

  return ctx;
}
