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

// ── 流式请求超时守护 ─────────────────────────────────────────────────────────
// 裸 fetch() / reader.read() 没有任何超时：连接停滞时 onDone/onError 永不触发，
// UI 光标闪烁不止且发送按钮锁死。以下两个机制终结该类悬挂：
// - fetch 发出后 FETCH_HEADER_TIMEOUT 内未收到响应头 → 报错
// - 流读取期间连续 STREAM_IDLE_TIMEOUT 无新数据 → reader.cancel() 中断并报错

/** 请求头超时（ms）：fetch 发出后未收到响应头的最大等待 */
export const FETCH_HEADER_TIMEOUT = 120_000;

/** 流读取空闲超时（ms）：连续无新数据的最长容忍（思考模型的推理 delta 会持续到达并重置计时） */
export const STREAM_IDLE_TIMEOUT = 90_000;

/**
 * fetch + 响应头超时。超时以 Promise.race 实现（AbortController 在 Zotero
 * chrome 上下文不可用，见 mineru/client.ts 注释）；超时后底层 fetch 成为孤儿，
 * 由网络栈自行回收，不影响向用户报错。
 */
export async function fetchWithHeaderTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `请求超时（${FETCH_HEADER_TIMEOUT / 1000}s 未收到服务端响应），请重发`,
          ),
        ),
      FETCH_HEADER_TIMEOUT,
    );
  });
  try {
    return await Promise.race([fetch(url, init), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * 带空闲看门狗的流式读取：逐块解码、按行回调，替代各 Provider 内重复的
 * buffer/split/decode 循环。onLine 返回 true 可提前结束（如 Ollama 的 done 行）。
 *
 * 超时处理：reader.cancel() 会让挂起的 read() 以 done:true 收场（而非 reject），
 * 因此循环正常结束后也需检查 timedOut 标志，统一转换为超时错误。
 */
export async function readStreamLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onLine: (line: string) => boolean | void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const armWatchdog = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      void reader.cancel().catch(() => {});
    }, STREAM_IDLE_TIMEOUT);
  };

  armWatchdog();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      armWatchdog(); // 收到新数据即重置空闲计时
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (onLine(line)) {
          // 提前结束（如 Ollama done 行）：取消未读完的流，尽快释放连接
          void reader.cancel().catch(() => {});
          return;
        }
      }
    }
  } catch (e) {
    if (timedOut) throw streamIdleError();
    throw e;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  if (timedOut) throw streamIdleError();
}

function streamIdleError(): Error {
  return new Error(
    `流式连接停滞（${STREAM_IDLE_TIMEOUT / 1000}s 无新数据），已自动中断。请重发；若频繁出现请检查网络或更换服务商`,
  );
}

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
  /**
   * 流式发送请求，逐 chunk 回调。
   * onChunk 收到两类增量：正文 chunk（第一参数）、推理增量 reasoningDelta（第二参数，
   * 思考型模型在正文前输出，如 Kimi/DeepSeek 的 reasoning_content）。
   * onDone 携带规范化的结束原因：
   * - "stop"   正常写完
   * - "length" 因 Max Tokens 上限被截断（含推理耗尽全部预算、正文为空的情形）
   * - 其他/缺省 厂商自有原因（如 safety）或流被提前关闭
   */
  chatStream(
    options: LLMRequestOptions,
    onChunk: (chunk: string, reasoningDelta?: string) => void,
    onDone: (finishReason?: string) => void,
    onError: (err: Error) => void,
  ): Promise<void>;
  /** 测试 API Key 是否有效 */
  testConnection(): Promise<boolean>;
  /** 获取当前服务商支持的模型列表 */
  getModels(): Promise<string[]>;
}
