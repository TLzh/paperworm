// Chat History — 管理当前会话的对话历史
// 当前版本：内存存储（后续可扩展为持久化）

import type { LLMMessage } from "../llm/provider";

export class ChatHistory {
  private messages: LLMMessage[] = [];

  add(message: LLMMessage) {
    this.messages.push(message);
  }

  /** 移除指定索引的消息（发送失败时撤回 user 消息，避免重发产生连续重复） */
  remove(index: number) {
    if (index >= 0 && index < this.messages.length) {
      this.messages.splice(index, 1);
    }
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
