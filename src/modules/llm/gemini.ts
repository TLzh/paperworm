/**
 * Google Gemini Provider
 * 使用 REST API，认证通过 URL 参数 ?key=... 传入
 * 流式输出返回 JSON 数组（Server-Sent Events 格式）
 */

import type { LLMProvider, LLMMessage, LLMRequestOptions } from "./provider";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(options: LLMRequestOptions): Promise<string> {
    const url = `${BASE_URL}/models/${options.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildBody(options)),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${err}`);
    }

    const data = await res.json() as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  async chatStream(
    options: LLMRequestOptions,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    const url = `${BASE_URL}/models/${options.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.buildBody(options)),
      });
    } catch (e) {
      onError(e as Error);
      return;
    }

    if (!res.ok) {
      const err = await res.text();
      onError(new Error(`Gemini API error ${res.status}: ${err}`));
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
      const res = await fetch(
        `${BASE_URL}/models?key=${this.apiKey}`,
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  private buildBody(options: LLMRequestOptions) {
    const systemMsg = options.messages.find((m) => m.role === "system");
    const otherMessages = options.messages.filter((m) => m.role !== "system");

    const body: Record<string, any> = {
      contents: otherMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 2000,
      },
    };

    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    return body;
  }

  private parseSSELine(line: string): string | null {
    if (!line.startsWith("data: ")) return null;
    try {
      const json = JSON.parse(line.slice(6)) as any;
      return json.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    } catch {
      return null;
    }
  }
}
