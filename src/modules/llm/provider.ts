// LLM Provider 统一接口
// 所有 LLM 厂商适配器都必须实现此接口

/**
 * 通过主窗口发起网络请求。
 * 插件脚本经由 Services.scriptloader.loadSubScript() 加载到自定义沙箱，
 * 该沙箱的 globalThis 不包含 fetch；必须显式从主窗口取得。
 */
export function wfetch(url: string, init?: RequestInit): Promise<Response> {
  const win = Zotero.getMainWindow() as any;
  if (typeof win?.fetch !== "function") {
    throw new Error("fetch is not available in this context");
  }
  return win.fetch(url, init) as Promise<Response>;
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
