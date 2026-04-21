// 缓存管理器 - 管理 MinerU 精细提取结果的缓存
// 保存为 Zotero 子笔记，与聊天记录同步机制一致，免费账号即可跨设备同步

const CACHE_NOTE_TAG = "_paperworm_mineru_cache";

export class MinerUCacheManager {
  /**
   * 检查是否存在精细文本缓存
   */
  static async hasCache(item: Zotero.Item): Promise<boolean> {
    return (await this._findCacheNote(item)) !== null;
  }

  /**
   * 获取缓存的 Markdown 内容
   */
  static async getCachedContent(item: Zotero.Item): Promise<string | null> {
    const note = await this._findCacheNote(item);
    if (!note) return null;

    const html = note.getNote();
    const match = html.match(
      /<code[^>]*class="pw-mineru-data"[^>]*>([A-Za-z0-9+/=\s]+)<\/code>/,
    );
    if (!match) return null;

    try {
      const binary = atob(match[1].trim());
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (error) {
      ztoolkit.log("读取 MinerU 缓存失败:", error);
      return null;
    }
  }

  /**
   * 保存精细提取结果到 Zotero 笔记
   * Base64 编码避免 HTML 转义问题，与聊天记录存储方式一致
   */
  static async saveCache(
    mdContent: string,
    parentItem: Zotero.Item,
  ): Promise<void> {
    // 清理旧缓存
    await this.cleanupOldCache(parentItem);

    // Base64 编码
    const bytes = new TextEncoder().encode(mdContent);
    let binary = "";
    for (let i = 0; i < bytes.length; i++)
      binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);

    const noteHtml =
      `<h3>PaperWorm · 精细文本</h3>\n` +
      `<code class="pw-mineru-data">${b64}</code>`;

    const parent = parentItem.isAttachment()
      ? (parentItem.parentItem ?? parentItem)
      : parentItem;

    const note = new Zotero.Item("note");
    note.setNote(noteHtml);
    note.parentID = parent.id;
    const newID = await note.saveTx();

    // 添加标识标签（用于后续检索）
    const saved = Zotero.Items.get(newID as number);
    saved.addTag(CACHE_NOTE_TAG);
    await saved.saveTx();

    ztoolkit.log("MinerU 精细文本已保存为 Zotero 笔记");
  }

  /**
   * 清理旧的缓存笔记
   */
  static async cleanupOldCache(parentItem: Zotero.Item): Promise<void> {
    const note = await this._findCacheNote(parentItem);
    if (note) {
      await note.eraseTx();
    }
  }

  /**
   * 查找缓存笔记（通过标签识别）
   */
  private static async _findCacheNote(
    item: Zotero.Item,
  ): Promise<Zotero.Item | null> {
    const parent = item.isAttachment() ? (item.parentItem ?? item) : item;
    const noteIDs: number[] = (parent as any).getNotes() as number[];

    for (const nid of noteIDs) {
      try {
        const note = Zotero.Items.get(nid);
        const tags = note.getTags();
        if (tags.some((t) => t.tag === CACHE_NOTE_TAG)) {
          return note;
        }
      } catch {
        /* skip */
      }
    }
    return null;
  }
}
