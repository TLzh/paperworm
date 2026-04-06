/**
 * OpenAI 兼容 Provider
 * 同时支持 OpenAI 和 DeepSeek（两者 API 格式完全一致，仅 baseUrl 不同）
 */

import type { LLMProvider, LLMMessage, LLMRequestOptions } from "./provider";
import { wfetch } from "./provider";

export class OpenAIProvider implements LLMProvider {
  readonly name: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(name: string, apiKey: string, baseUrl: string) {
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async chat(options: LLMRequestOptions): Promise<string> {
    const res = await wfetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(options, false)),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${this.name} API error ${res.status}: ${err}`);
    }

    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content ?? "";
  }

  async chatStream(
    options: LLMRequestOptions,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    let res: Response;
    try {
      res = await wfetch(`${this.baseUrl}/chat/completions`, {
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
      const res = await wfetch(`${this.baseUrl}/models`, {
        headers: this.headers(),
      });
      return res.ok;
    } catch (e) {
      Zotero.log(`PaperWorm testConnection (${this.name}) error: ${e}`, "error");
      return false;
    }
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
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

  private parseSSELine(line: string): string | null {
    if (!line.startsWith("data: ")) return null;
    const data = line.slice(6).trim();
    if (data === "[DONE]") return null;
    try {
      const json = JSON.parse(data) as any;
      return json.choices?.[0]?.delta?.content ?? null;
    } catch {
      return null;
    }
  }
}
