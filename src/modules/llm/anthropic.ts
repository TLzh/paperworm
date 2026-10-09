/**
 * Anthropic Claude Provider
 * API 格式与 OpenAI 不同：system prompt 单独传参，streaming 事件类型不同
 */

import type {
  LLMProvider,
  LLMMessage,
  LLMRequestOptions,
  ContentPart,
} from "./provider";
import { zhttp, fetchWithHeaderTimeout, readStreamLines } from "./provider";

function toAnthropicContent(content: string | ContentPart[]) {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    const commaIdx = part.image_url.url.indexOf(",");
    if (commaIdx === -1) return { type: "text", text: "[图片数据格式错误]" };
    const meta = part.image_url.url.slice(0, commaIdx);
    const data = part.image_url.url.slice(commaIdx + 1);
    const mediaType = meta.split(":")[1]?.split(";")[0] ?? "image/png";
    return {
      type: "image",
      source: { type: "base64", media_type: mediaType, data },
    };
  });
}

const BASE_URL = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(options: LLMRequestOptions): Promise<string> {
    const resp = await zhttp("POST", `${BASE_URL}/v1/messages`, {
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(options, false)),
      successCodes: [200],
    });
    try {
      const data = JSON.parse(resp.responseText) as any;
      return data.content?.[0]?.text ?? "";
    } catch (e) {
      throw new Error(
        `Failed to parse Anthropic response: ${(e as Error).message}`,
      );
    }
  }

  async chatStream(
    options: LLMRequestOptions,
    onChunk: (chunk: string, reasoningDelta?: string) => void,
    onDone: (finishReason?: string) => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    // 流式输出需要 ReadableStream，Zotero.HTTP.request() 不支持，使用 fetch()
    let res: Response;
    try {
      res = await fetchWithHeaderTimeout(`${BASE_URL}/v1/messages`, {
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

    const reader = (
      res.body as any
    ).getReader() as ReadableStreamDefaultReader<Uint8Array>;
    let stopReason: string | null = null;

    try {
      await readStreamLines(reader, (line) => {
        const parsed = this.parseSSELine(line);
        if (parsed.reasoning) onChunk("", parsed.reasoning);
        if (parsed.text) onChunk(parsed.text);
        if (parsed.stopReason) stopReason = parsed.stopReason;
      });
      // Anthropic 用 "max_tokens" 表示因输出上限截断，规范化为 "length"
      onDone(
        stopReason === "max_tokens" ? "length" : (stopReason ?? undefined),
      );
    } catch (e) {
      onError(e as Error);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getModels();
      return true;
    } catch (e) {
      Zotero.log(`PaperWorm testConnection (anthropic) error: ${e}`, "error");
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const resp = await zhttp("GET", `${BASE_URL}/v1/models`, {
        headers: this.headers(),
        successCodes: [200],
      });
      const data = JSON.parse(resp.responseText) as any;
      return ((data.data as any[]) ?? []).map((m) => m.id as string).sort();
    } catch (e) {
      Zotero.log(`PaperWorm: failed to get Anthropic models: ${e}`, "error");
      return [];
    }
  }

  private headers(): Record<string, string> {
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
      messages: userMessages.map((m) => ({
        ...m,
        content: toAnthropicContent(m.content),
      })),
      max_tokens: options.maxTokens ?? 2000,
      stream,
    };
    if (options.temperature !== undefined)
      body.temperature = options.temperature;
    if (systemMsg)
      body.system =
        typeof systemMsg.content === "string" ? systemMsg.content : "";
    return body;
  }

  private parseSSELine(line: string): {
    text: string | null;
    reasoning: string | null;
    stopReason: string | null;
  } {
    if (!line.startsWith("data: ")) {
      return { text: null, reasoning: null, stopReason: null };
    }
    try {
      const json = JSON.parse(line.slice(6)) as any;
      if (json.type === "content_block_delta" && json.delta) {
        // 正文增量：text_delta
        if (json.delta.type === "text_delta") {
          return {
            text: json.delta.text ?? null,
            reasoning: null,
            stopReason: null,
          };
        }
        // 推理增量：thinking_delta（extended thinking 模式）
        if (json.delta.type === "thinking_delta") {
          return {
            text: null,
            reasoning: json.delta.thinking ?? null,
            stopReason: null,
          };
        }
      }
      // 结束原因：message_delta 事件携带 stop_reason
      if (json.type === "message_delta" && json.delta?.stop_reason) {
        return {
          text: null,
          reasoning: null,
          stopReason: json.delta.stop_reason,
        };
      }
    } catch {
      // 忽略解析失败的行
    }
    return { text: null, reasoning: null, stopReason: null };
  }
}
