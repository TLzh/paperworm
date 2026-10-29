/**
 * Session Store — 会话数据层（内存层 + Zotero 笔记持久层）
 *
 * S1 平移自 readerPanel.ts（行为零变化）：
 * - 内存层：histories / activeNoteIDs / getItemKey / getHistory
 * - 序列化：SessionData ↔ base64 ↔ Zotero 笔记 HTML
 * - 持久层：saveSession（子笔记自动保存）/ loadSessions（该论文全部会话）
 *
 * v1.0 计划（见 docs/architecture.md）：此模块将接口化为 SessionStore，
 * 由 PaperSessionStore（本实现）与 StandaloneSessionStore（standalone note +
 * 专用 collection）分别实现，供 ChatCore 按 SessionScope 分发。
 */

import { ChatHistory } from "./history";

// ── 会话数据结构 ─────────────────────────────────────────────────────────────

export interface SessionData {
  version: number;
  title: string;
  created: string; // ISO 8601
  updated: string; // ISO 8601
  messages: Array<{
    role: string;
    content: string;
    /** 可选：该条助手消息的推理字数摘要（推理原文不落盘） */
    reasoningLen?: number;
  }>;
}

/** loadSessions 返回的会话元信息（新→旧排序） */
export interface SessionMeta {
  noteID: number;
  title: string;
  updated: string;
  data: SessionData;
}

// ── 内存层 ───────────────────────────────────────────────────────────────────

// 每篇论文单独维护一份对话历史（以 parentItem.id 为 key）
const histories = new Map<number, ChatHistory>();

// 当前激活的会话 noteID（null = 新会话尚未保存到 Zotero）
export const activeNoteIDs = new Map<number, number | null>();

/**
 * 将 item 归一化为父条目 ID，作为 histories / activeNoteIDs 的统一 key。
 *
 * Zotero 在不同上下文下传入的 item 可能是附件（PDF）或父条目（论文），
 * 两者 id 不同。若不归一化，同一篇论文可能在 Map 中产生两个独立 bucket，
 * 导致面板切换时内存历史"消失"。
 * saveSession / loadSessions 均使用 parentItem，此处保持一致。
 */
export function getItemKey(item: Zotero.Item): number {
  if (item.isAttachment()) {
    return item.parentItem?.id ?? item.id;
  }
  return item.id;
}

export function getHistory(item: Zotero.Item): ChatHistory {
  const key = getItemKey(item);
  if (!histories.has(key)) {
    histories.set(key, new ChatHistory());
  }
  return histories.get(key)!;
}

// ── 序列化 ───────────────────────────────────────────────────────────────────

/**
 * 将 SessionData 序列化为 base64 字符串。
 * 用 TextEncoder 确保 Unicode 正确处理，避免 btoa 对非 ASCII 字符报错。
 */
function sessionToBase64(data: SessionData): string {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** 从 base64 字符串还原 SessionData */
function base64ToSession(b64: string): SessionData {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes)) as SessionData;
}

/**
 * 构建 Zotero 笔记 HTML。
 * 数据存储在 <code class="pw-archive-data"> 中（base64 编码）。
 * 注意：Zotero 存储时会剥离 <code> 上的 class 属性，<details> 也会被转换为 <p>，
 * 因此 parseNoteHtml 不依赖 class 属性来识别数据块，只需匹配足够长的 base64 内容。
 */
function buildNoteHtml(
  title: string,
  visibleMsgs: Array<{ role: string; content: string }>,
  data: SessionData,
): string {
  const rows = visibleMsgs
    .map(
      (m) =>
        `<p><b>${m.role === "user" ? "用户" : "AI"}：</b>${escapeHtml(m.content)}</p>`,
    )
    .join("\n");
  const b64 = sessionToBase64(data);
  return (
    `<h2>PaperWorm · ${escapeHtml(title)}</h2>\n` +
    `<div>${rows}</div>\n` +
    `<p>会话元数据</p><code class="pw-archive-data">${b64}</code>`
  );
}

/** 从笔记 HTML 中提取 SessionData，返回 null 表示非 PaperWorm 笔记或解析失败 */
function parseNoteHtml(html: string): SessionData | null {
  if (!html.includes("PaperWorm")) return null;
  // 优先匹配带 class 属性的（刚保存、尚未经 Zotero 同步处理的笔记）
  let m = html.match(
    /<code[^>]*class=["']pw-archive-data["'][^>]*>([A-Za-z0-9+/=\s]+)<\/code>/,
  );
  // 回退：Zotero 同步/导出后会剥离 class，匹配任意足够长的 base64 <code> 块
  if (!m) m = html.match(/<code[^>]*>([A-Za-z0-9+/=\s]{100,})<\/code>/);
  if (m) {
    try {
      return base64ToSession(m[1].trim());
    } catch {
      /* fall through */
    }
  }
  return null;
}

// ── 持久层 ───────────────────────────────────────────────────────────────────

/**
 * 构建会话保存载荷（标题/时间戳/消息序列化/笔记 HTML）——paper 与 standalone 共用。
 */
function buildSessionPayload(
  history: ChatHistory,
  existingID: number | null,
): { title: string; noteContent: string; data: SessionData } | null {
  const msgs = history.getAll();
  const visibleMsgs = msgs.filter((m) => m.role !== "system");
  if (!visibleMsgs.length) return null;

  // 标题 = 首条用户消息前 25 字（去换行）
  const firstUser = visibleMsgs.find((m) => m.role === "user");
  const firstContent =
    typeof firstUser?.content === "string" ? firstUser.content : "[截图 📷]";
  const title = firstUser
    ? firstContent.replace(/\n/g, " ").trim().slice(0, 25)
    : "未命名会话";

  const now = new Date().toISOString();

  let created = now;
  if (existingID != null) {
    // 保留原 created 时间
    try {
      const prev = parseNoteHtml(Zotero.Items.get(existingID).getNote());
      if (prev?.created) created = prev.created;
    } catch {
      /* ignore */
    }
  }

  // 历史中的 content 始终是 string（图片已在发送层替换为占位符），此处防御性转换
  const stringMessages = msgs.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : "[截图 📷]",
    ...(m.role === "assistant" && m.reasoningLen
      ? { reasoningLen: m.reasoningLen }
      : {}),
  }));
  const stringVisibleMsgs = stringMessages.filter((m) => m.role !== "system");

  const data: SessionData = {
    version: 2,
    title,
    created,
    updated: now,
    messages: stringMessages,
  };
  return {
    title,
    noteContent: buildNoteHtml(title, stringVisibleMsgs, data),
    data,
  };
}

/** 自动保存当前会话到 Zotero child note（每次 AI 响应完成后调用） */
export async function saveSession(
  item: Zotero.Item,
  history: ChatHistory,
): Promise<void> {
  const existingID = activeNoteIDs.get(getItemKey(item)) ?? null;
  const payload = buildSessionPayload(history, existingID);
  if (!payload) return;

  if (existingID != null) {
    const note = Zotero.Items.get(existingID);
    note.setNote(payload.noteContent);
    await note.saveTx();
  } else {
    const note = new Zotero.Item("note");
    note.setNote(payload.noteContent);
    const parentItem = item.isAttachment() ? (item.parentItem ?? item) : item;
    note.parentID = parentItem.id;
    const newID = await note.saveTx();
    activeNoteIDs.set(getItemKey(item), newID as number);
  }
}

/** 读取该论文的所有 PaperWorm 会话，新→旧排序 */
export async function loadSessions(item: Zotero.Item): Promise<SessionMeta[]> {
  const parentItem = item.isAttachment() ? (item.parentItem ?? item) : item;
  const noteIDs: number[] = (parentItem as any).getNotes() as number[];
  const results: SessionMeta[] = [];

  for (const nid of noteIDs) {
    try {
      const note = Zotero.Items.get(nid);
      const html = note.getNote();
      const data = parseNoteHtml(html);
      if (!data) continue;
      results.push({
        noteID: nid,
        title: data.title,
        updated: data.updated,
        data,
      });
    } catch {
      /* skip malformed */
    }
  }

  return results.sort((a, b) => b.updated.localeCompare(a.updated));
}

// ── 通用工具 ─────────────────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Scope 化 API（v1.0：paper 与 standalone 统一入口）────────────────────────

import type { SessionScope } from "./types";

/** standalone 会话的内存 key（与 itemKey 空间不冲突） */
const STANDALONE_KEY = -1;

/** standalone 会话专用 collection 名（用户库内，随 Zotero 同步） */
const STANDALONE_COLLECTION_NAME = "PaperWorm 独立会话";

export function getHistoryByScope(scope: SessionScope): ChatHistory {
  if (scope.kind === "paper") return getHistory(scope.item);
  if (!histories.has(STANDALONE_KEY)) {
    histories.set(STANDALONE_KEY, new ChatHistory());
  }
  return histories.get(STANDALONE_KEY)!;
}

export function getActiveNoteIDByScope(scope: SessionScope): number | null {
  const key = scope.kind === "paper" ? getItemKey(scope.item) : STANDALONE_KEY;
  return activeNoteIDs.get(key) ?? null;
}

export function setActiveNoteIDByScope(
  scope: SessionScope,
  noteID: number | null,
): void {
  const key = scope.kind === "paper" ? getItemKey(scope.item) : STANDALONE_KEY;
  activeNoteIDs.set(key, noteID);
}

/** 获取（无则创建）standalone 会话专用 collection；进行中的创建复用同一 Promise（防并发双建） */
let collectionPromise: Promise<Zotero.Collection> | null = null;

async function ensureStandaloneCollection(): Promise<Zotero.Collection> {
  if (!collectionPromise) {
    collectionPromise = createOrGetStandaloneCollection().catch((e) => {
      collectionPromise = null; // 失败允许下次重试
      throw e;
    });
  }
  return collectionPromise;
}

async function createOrGetStandaloneCollection(): Promise<Zotero.Collection> {
  const libID = Zotero.Libraries.userLibraryID;
  const existing = Zotero.Collections.getByLibrary(libID).find(
    (c) => c.name === STANDALONE_COLLECTION_NAME,
  );
  if (existing) return existing;
  // 官方构造参数方式（collection.js assignProps: name/libraryID/parentID/parentKey）
  const col = new (Zotero.Collection as any)({
    name: STANDALONE_COLLECTION_NAME,
    libraryID: libID,
  });
  await col.saveTx();
  return col as Zotero.Collection;
}

export async function saveSessionByScope(
  scope: SessionScope,
  history: ChatHistory,
): Promise<void> {
  if (scope.kind === "paper") return saveSession(scope.item, history);
  const existingID = getActiveNoteIDByScope(scope);
  const payload = buildSessionPayload(history, existingID);
  if (!payload) return;

  if (existingID != null) {
    const note = Zotero.Items.get(existingID);
    note.setNote(payload.noteContent);
    await note.saveTx();
  } else {
    const col = await ensureStandaloneCollection();
    const note = new Zotero.Item("note");
    note.setNote(payload.noteContent);
    note.addToCollection(col.id);
    const newID = await note.saveTx();
    setActiveNoteIDByScope(scope, newID as number);
  }
}

export async function loadSessionsByScope(
  scope: SessionScope,
): Promise<SessionMeta[]> {
  if (scope.kind === "paper") return loadSessions(scope.item);
  const col = await ensureStandaloneCollection();
  const results: SessionMeta[] = [];
  for (const child of col.getChildItems() as Zotero.Item[]) {
    try {
      if (!child.isNote()) continue;
      const data = parseNoteHtml(child.getNote());
      if (!data) continue;
      results.push({
        noteID: child.id,
        title: data.title,
        updated: data.updated,
        data,
      });
    } catch {
      /* skip malformed */
    }
  }
  return results.sort((a, b) => b.updated.localeCompare(a.updated));
}
