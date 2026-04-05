/**
 * Anthropic Claude Provider
 * API 格式与 OpenAI 不同：system prompt 单独传参，streaming 事件类型不同
 */

import type { LLMProvider, LLMMessage, LLMRequestOptions } from "./provider";

const BASE_URL = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(options: LLMRequestOptions): Promise<string> {
    const res = await fetch(`${BASE_URL}/v1/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(options, false)),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json() as any;
    return data.content?.[0]?.text ?? "";
  }

  async chatStream(
    options: LLMRequestOptions,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/v1/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.buildBody(options, true)),
      });
    } catch (e) {
      onError(e as Error);
      return;
    }

    if (!res.ok) {
      const err = await res.text();
      onError(new Error(`Anthropic API error ${res.status}: ${err}`));
      return;
    }

    const reader = (res.body as any).getReader() as ReadableStreamDefaultReader<Uint8Array>;
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const text = this.parseSSELine(line);
          if (text) onChunk(text);
        }
      }
      onDone();
    } catch (e) {
      onError(e as Error);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // 发送极短请求验证 Key，max_tokens=1 几乎不消耗额度
      const res = await fetch(`${BASE_URL}/v1/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      return res.ok || res.status === 400; // 400 = 参数问题但 Key 有效
    } catch {
      return false;
    }
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": API_VERSION,
    };
  }

  private buildBody(options: LLMRequestOptions, stream: boolean) {
    // Anthropic 要求 system prompt 与 messages 分离
    const systemMsg = options.messages.find((m) => m.role === "system");
    const userMessages = options.messages.filter((m) => m.role !== "system");

    const body: Record<string, any> = {
      model: options.model,
      messages: userMessages,
      max_tokens: options.maxTokens ?? 2000,
      stream,
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (systemMsg) body.system = systemMsg.content;
    return body;
  }

  private parseSSELine(line: string): string | null {
    if (!line.startsWith("data: ")) return null;
    try {
      const json = JSON.parse(line.slice(6)) as any;
      // 只处理 content_block_delta 事件中的 text_delta
      if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
        return json.delta.text ?? null;
      }
    } catch {
      // 忽略解析失败的行
    }
    return null;
  }
}
