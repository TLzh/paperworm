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
    onChunk: (chunk: string) => void,
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
    const body: Record<string, any> = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      // OpenAI 新一代模型（gpt-5 系）要求 max_completion_tokens（旧名 max_tokens 返回 400）；
      // 其余 OpenAI 兼容厂商（DeepSeek/Kimi/Qwen/MiMo/OpenRouter/MiniMax）文档均为 max_tokens
      [this.name === "openai" ? "max_completion_tokens" : "max_tokens"]:
        options.maxTokens ?? 2000,
      stream,
    };
    // OpenAI：gpt-5 系推理模型仅接受默认 temperature，统一不发送（T 设置对其余厂商正常生效）
    if (this.name === "openai") delete body.temperature;
    return body;
  }

  private parseSSELine(line: string): {
    text: string | null;
    finishReason: string | null;
  } {
    if (!line.startsWith("data: ")) return { text: null, finishReason: null };
    const data = line.slice(6).trim();
    if (data === "[DONE]") return { text: null, finishReason: null };
    try {
      const json = JSON.parse(data) as any;
      return {
        text: json.choices?.[0]?.delta?.content ?? null,
        finishReason: json.choices?.[0]?.finish_reason ?? null,
      };
    } catch {
      return { text: null, finishReason: null };
    }
  }
}
