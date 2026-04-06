// LLM Provider 统一接口
// 所有 LLM 厂商适配器都必须实现此接口

/**
 * 发起网络请求的统一封装。
 * 直接使用 chrome 上下文的全局 fetch（由 loadSubScript 继承自 chrome global）。
 */
export function wfetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequestOptions {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMProvider {
  /** 厂商标识，如 "openai" / "anthropic" / "gemini" / "ollama" */
  readonly name: string;
  /** 发送请求，返回完整回复文本 */
  chat(options: LLMRequestOptions): Promise<string>;
  /** 流式发送请求，逐 chunk 回调 */
  chatStream(
    options: LLMRequestOptions,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void>;
  /** 测试 API Key 是否有效 */
  testConnection(): Promise<boolean>;
}
