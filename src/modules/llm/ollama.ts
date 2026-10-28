/**
 * Ollama 本地模型 Provider
 * 流式输出为换行分隔的 JSON 对象（非 SSE）
 * 无需 API Key，通过 baseUrl 指向本地服务
 */

import type {
  LLMProvider,
  LLMRequestOptions,
  ContentPart,
  ReasoningLevel,
} from "./provider";
import { zhttp, fetchWithHeaderTimeout, readStreamLines } from "./provider";

/** Ollama think：布尔或档位字符串（官方 docs/api.md：low/medium/high/max） */
const OLLAMA_REASONING_LEVELS: ReasoningLevel[] = [
  { value: "", label: "默认", hint: "模型自身默认" },
  { value: "off", label: "关闭", short: "关" },
  { value: "low", label: "低" },
  { value: "medium", label: "中", short: "medium" },
  { value: "high", label: "高" },
  { value: "max", label: "最高", short: "max" },
];

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  getReasoningLevels(_model?: string): ReasoningLevel[] {
    return [...OLLAMA_REASONING_LEVELS];
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
    // 推理档位：think 支持布尔或 low/medium/high/max 档位字符串（官方 docs/api.md）
    let think: boolean | string | undefined;
    if (options.reasoning === "off") think = false;
    else if (options.reasoning) think = options.reasoning;

    return {
      model: options.model,
      messages,
      ...(images.length > 0 ? { images } : {}),
      stream,
      ...(think !== undefined ? { think } : {}),
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2000,
      },
    };
  }
}
