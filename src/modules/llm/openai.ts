/**
 * OpenAI 兼容 Provider
 * 同时支持 OpenAI 和 DeepSeek（两者 API 格式完全一致，仅 baseUrl 不同）
 */

import type { LLMProvider, LLMMessage, LLMRequestOptions } from "./provider";
import { zhttp, fetchWithHeaderTimeout, readStreamLines } from "./provider";

export class OpenAIProvider implements LLMProvider {
  readonly name: string;
  private apiKey: string;
  private baseUrl: string;
  private authMode: "bearer" | "api-key";

  constructor(
    name: string,
    apiKey: string,
    baseUrl: string,
    authMode: "bearer" | "api-key" = "bearer",
  ) {
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.authMode = authMode;
  }

  async chat(options: LLMRequestOptions): Promise<string> {
    const resp = await zhttp("POST", `${this.baseUrl}/chat/completions`, {
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(options, false)),
      successCodes: [200],
    });
    try {
      const data = JSON.parse(resp.responseText) as any;
      return data.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      throw new Error(
        `Failed to parse ${this.name} response: ${(e as Error).message}`,
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
      res = await fetchWithHeaderTimeout(`${this.baseUrl}/chat/completions`, {
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
      onError(new Error(`${this.name} API error ${res.status}: ${err}`));
      return;
    }

    const reader = (
      res.body as any
    ).getReader() as ReadableStreamDefaultReader<Uint8Array>;
    let finishReason: string | null = null;

    try {
      await readStreamLines(reader, (line) => {
        const parsed = this.parseSSELine(line);
        if (parsed.reasoning) onChunk("", parsed.reasoning);
        if (parsed.text) onChunk(parsed.text);
        if (parsed.finishReason) finishReason = parsed.finishReason;
      });
      onDone(finishReason ?? undefined);
    } catch (e) {
      onError(e as Error);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getModels();
      return true;
    } catch (e) {
      Zotero.log(
        `PaperWorm testConnection (${this.name}) error: ${e}`,
        "error",
      );
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    const resp = await zhttp("GET", `${this.baseUrl}/models`, {
      headers: this.headers(),
      successCodes: [200],
    });
    try {
      const data = JSON.parse(resp.responseText) as any;
      const models = ((data.data as any[]) ?? [])
        .map((m) => m.id as string)
        .filter((id) => {
          // 过滤掉明显的非对话模型（如 whisper, dall-e, embedding 等）
          const blackList = [
            "whisper",
            "dall-e",
            "embedding",
            "tts",
            "moderation",
            "edit",
          ];
          return !blackList.some((b) => id.toLowerCase().includes(b));
        });
      return models.sort();
    } catch (e) {
      Zotero.log(
        `PaperWorm: failed to parse ${this.name} models response: ${e}`,
        "error",
      );
      return [];
    }
  }

  private headers(): Record<string, string> {
    if (this.authMode === "api-key") {
      return {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      };
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private buildBody(options: LLMRequestOptions, stream: boolean) {
    return {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
      stream,
    };
  }

  private parseSSELine(line: string): {
    text: string | null;
    reasoning: string | null;
    finishReason: string | null;
  } {
    if (!line.startsWith("data: ")) {
      return { text: null, reasoning: null, finishReason: null };
    }
    const data = line.slice(6).trim();
    if (data === "[DONE]") {
      return { text: null, reasoning: null, finishReason: null };
    }
    try {
      const json = JSON.parse(data) as any;
      const delta = json.choices?.[0]?.delta;
      return {
        text: delta?.content ?? null,
        // 思考型模型：推理增量走 reasoning_content（Kimi/DeepSeek）或 reasoning（OpenRouter 等）
        reasoning: delta?.reasoning_content ?? delta?.reasoning ?? null,
        finishReason: json.choices?.[0]?.finish_reason ?? null,
      };
    } catch {
      return { text: null, reasoning: null, finishReason: null };
    }
  }
}
