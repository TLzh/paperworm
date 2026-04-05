// Chat History — 管理当前会话的对话历史
// 当前版本：内存存储（后续可扩展为持久化）

import type { LLMMessage } from "../llm/provider";

export class ChatHistory {
  private messages: LLMMessage[] = [];

  add(message: LLMMessage) {
    this.messages.push(message);
  }

  getAll(): LLMMessage[] {
    return [...this.messages];
  }

  clear() {
    this.messages = [];
  }

  get length() {
    return this.messages.length;
  }
}
