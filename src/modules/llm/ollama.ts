/**
 * Ollama 本地模型 Provider
 * 流式输出为换行分隔的 JSON 对象（非 SSE）
 * 无需 API Key，通过 baseUrl 指向本地服务
 */

import type { LLMProvider, LLMRequestOptions, ContentPart } from "./provider";
import { zhttp, fetchWithHeaderTimeout, readStreamLines } from "./provider";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async chat(options: LLMRequestOptions): Promise<string> {
    const resp = await zhttp("POST", `${this.baseUrl}/api/chat`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildBody(options, false)),
      successCodes: [200],
    });
    try {
      const data = JSON.parse(resp.responseText) as any;
      return data.message?.content ?? "";
    } catch (e) {
      throw new Error(
        `Failed to parse Ollama response: ${(e as Error).message}`,
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
      res = await fetchWithHeaderTimeout(`${this.baseUrl}/api/chat`, {
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

    const reader = (
      res.body as any
    ).getReader() as ReadableStreamDefaultReader<Uint8Array>;
    let doneReason: string | null = null;

    try {
      await readStreamLines(reader, (line) => {
        if (!line.trim()) return;
        try {
          const json = JSON.parse(line) as any;
          const text = json.message?.content;
          if (text) onChunk(text);
          // thinking 模型：推理增量在 message.thinking 字段
          if (json.message?.thinking) onChunk("", json.message.thinking);
          if (json.done) {
            // done_reason: "stop" | "length"（num_predict 用尽）| "cancel" 等
            doneReason = json.done_reason ?? null;
            return true; // Ollama 以 done 行结束，无需读满整个流
          }
        } catch {
          // 忽略解析失败的行
        }
      });
      onDone(doneReason ?? undefined);
    } catch (e) {
      onError(e as Error);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getModels();
      return true;
    } catch (e) {
      Zotero.log(`PaperWorm testConnection (ollama) error: ${e}`, "error");
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    const resp = await zhttp("GET", `${this.baseUrl}/api/tags`, {
      successCodes: [200],
    });
    try {
      const data = JSON.parse(resp.responseText) as any;
      return ((data.models as any[]) ?? []).map((m) => m.name as string).sort();
    } catch (e) {
      Zotero.log(
        `PaperWorm: failed to parse Ollama models response: ${e}`,
        "error",
      );
      return [];
    }
  }

  private buildBody(options: LLMRequestOptions, stream: boolean) {
    const images: string[] = [];
    const messages = options.messages.map((m) => {
      if (typeof m.content === "string") return m;
      const parts = m.content as ContentPart[];
      parts
        .filter((p) => p.type === "image_url")
        .forEach((p) => {
          const url: string = (p as any).image_url.url;
          const commaIdx = url.indexOf(",");
          if (commaIdx !== -1) images.push(url.slice(commaIdx + 1));
        });
      const text = parts
        .filter((p) => p.type === "text")
        .map((p) => (p as any).text)
        .join("\n");
      return { ...m, content: text };
    });
    return {
      model: options.model,
      messages,
      ...(images.length > 0 ? { images } : {}),
      stream,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2000,
      },
    };
  }
}
