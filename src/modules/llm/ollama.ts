/**
 * Ollama 本地模型 Provider
 * 流式输出为换行分隔的 JSON 对象（非 SSE）
 * 无需 API Key，通过 baseUrl 指向本地服务
 */

import type { LLMProvider, LLMRequestOptions } from "./provider";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async chat(options: LLMRequestOptions): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildBody(options, false)),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error ${res.status}: ${err}`);
    }

    const data = await res.json() as any;
    return data.message?.content ?? "";
  }

  async chatStream(
    options: LLMRequestOptions,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.buildBody(options, true)),
      });
    } catch (e) {
      onError(e as Error);
      return;
    }

    if (!res.ok) {
      const err = await res.text();
      onError(new Error(`Ollama error ${res.status}: ${err}`));
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
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line) as any;
            const text = json.message?.content;
            if (text) onChunk(text);
            if (json.done) {
              onDone();
              return;
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
      onDone();
    } catch (e) {
      onError(e as Error);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // GET /api/tags 列出本地模型，无需认证
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  private buildBody(options: LLMRequestOptions, stream: boolean) {
    return {
      model: options.model,
      messages: options.messages,
      stream,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2000,
      },
    };
  }
}
