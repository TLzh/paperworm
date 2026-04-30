// LLM Provider 统一接口
// 所有 LLM 厂商适配器都必须实现此接口

/**
 * 通过 Zotero.HTTP.request() 发起 HTTP 请求。
 * Zotero.HTTP 使用 XHR + XPCOM 网络层，正确处理 Windows 上的代理、
 * SSL 证书验证、离线检测等平台差异，是 Zotero 插件的官方网络 API。
 * （返回 XMLHttpRequest 对象，.status / .responseText）
 */
export async function zhttp(
  method: string,
  url: string,
  opts: {
    headers?: Record<string, string>;
    body?: string;
    successCodes?: number[] | false; // false = 接受所有状态码
    timeout?: number; // ms；0 = 不限；默认继承 Zotero.HTTP 的 30s
  } = {},
): Promise<{ status: number; responseText: string }> {
  const reqOpts: Record<string, any> = {
    headers: opts.headers,
    body: opts.body,
    successCodes: opts.successCodes !== undefined ? opts.successCodes : [200],
    errorDelayMax: 0, // 禁止 5xx 自动重试，立即抛出
  };
  if (opts.timeout !== undefined) reqOpts.timeout = opts.timeout;
  return (Zotero.HTTP as any).request(method, url, reqOpts);
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
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
  /** 获取当前服务商支持的模型列表 */
  getModels(): Promise<string[]>;
}
