/**
 * Google Gemini Provider
 * 使用 REST API，认证通过 x-goog-api-key 请求头传入（避免 Key 出现在 URL 日志中）
 * 流式输出返回 JSON 数组（Server-Sent Events 格式）
 */

import type {
  LLMProvider,
  LLMMessage,
  LLMRequestOptions,
  ContentPart,
  ReasoningLevel,
} from "./provider";
import { zhttp, fetchWithHeaderTimeout, readStreamLines } from "./provider";

/** Gemini 3 起为等级制 thinkingLevel（minimal≈无思考；分模型支持矩阵，如 3.1 Pro 无 minimal） */
const GEMINI_REASONING_LEVELS: ReasoningLevel[] = [
  { value: "", label: "默认", hint: "按模型默认（high 或 minimal）" },
  {
    value: "minimal",
    label: "极低",
    short: "minimal",
    hint: "≈无思考，最低延迟",
  },
  { value: "low", label: "低" },
  { value: "medium", label: "中", short: "medium" },
  { value: "high", label: "高" },
];

function toGeminiParts(content: string | ContentPart[]) {
  if (typeof content === "string") return [{ text: content }];
  return content.map((part) => {
    if (part.type === "text") return { text: part.text };
    const commaIdx = part.image_url.url.indexOf(",");
    if (commaIdx === -1) return { text: "[图片数据格式错误]" };
    const meta = part.image_url.url.slice(0, commaIdx);
    const data = part.image_url.url.slice(commaIdx + 1);
    const mimeType = meta.split(":")[1]?.split(";")[0] ?? "image/png";
    return { inlineData: { mimeType, data } };
  });
}

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getReasoningLevels(_model?: string): ReasoningLevel[] {
    return [...GEMINI_REASONING_LEVELS];
  }

  async chat(options: LLMRequestOptions): Promise<string> {
    const url = `${BASE_URL}/models/${options.model}:generateContent`;
    const resp = await zhttp("POST", url, {
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify(this.buildBody(options)),
      successCodes: [200],
    });
    try {
      const data = JSON.parse(resp.responseText) as any;
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } catch (e) {
      throw new Error(
        `Failed to parse Gemini response: ${(e as Error).message}`,
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
    const url = `${BASE_URL}/models/${options.model}:streamGenerateContent?alt=sse`;
    let res: Response;
    try {
      res = await fetchWithHeaderTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
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
      // Gemini 用 "MAX_TOKENS" 表示因输出上限截断，规范化为 "length"
      onDone(
        finishReason === "MAX_TOKENS" ? "length" : (finishReason ?? undefined),
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
      Zotero.log(`PaperWorm testConnection (gemini) error: ${e}`, "error");
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    const resp = await zhttp("GET", `${BASE_URL}/models`, {
      headers: { "x-goog-api-key": this.apiKey },
      successCodes: [200],
    });
    try {
      const data = JSON.parse(resp.responseText) as any;
      const models = ((data.models as any[]) ?? [])
        .filter((m) =>
          m.supportedGenerationMethods?.includes("generateContent"),
        )
        .map((m) => (m.name as string).replace(/^models\//, ""))
        .filter((id) => !id.includes("embedding") && !id.includes("aqa"));
      return models.sort();
    } catch (e) {
      Zotero.log(
        `PaperWorm: failed to parse Gemini models response: ${e}`,
        "error",
      );
      return [];
    }
  }

  private buildBody(options: LLMRequestOptions) {
    const systemMsg = options.messages.find((m) => m.role === "system");
    const otherMessages = options.messages.filter((m) => m.role !== "system");

    const body: Record<string, any> = {
      contents: otherMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: toGeminiParts(m.content),
      })),
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 2000,
      },
    };

    // 推理档位：Gemini 3 起为 thinkingLevel 等级制（官方 Gemini 3 开发者指南，
    // refs/gemini_docs；等级是"相对配额"而非严格 token 保证）
    if (options.reasoning) {
      (body.generationConfig as any).thinkingConfig = {
        thinkingLevel: options.reasoning,
      };
    }

    if (systemMsg) {
      const sysText =
        typeof systemMsg.content === "string" ? systemMsg.content : "";
      if (typeof systemMsg.content !== "string") {
        Zotero.log(
          "PaperWorm: Gemini system prompt is not a string, ignoring",
          "warning",
        );
      }
      body.systemInstruction = { parts: [{ text: sysText }] };
    }

    return body;
  }

  private parseSSELine(line: string): {
    text: string | null;
    reasoning: string | null;
    finishReason: string | null;
  } {
    if (!line.startsWith("data: ")) {
      return { text: null, reasoning: null, finishReason: null };
    }
    try {
      const json = JSON.parse(line.slice(6)) as any;
      const candidate = json.candidates?.[0];
      // thinking 模型：thought:true 的 parts 是推理增量，其余为正文
      let text: string | null = null;
      let reasoning: string | null = null;
      for (const part of candidate?.content?.parts ?? []) {
        if (typeof part?.text !== "string") continue;
        if (part.thought) reasoning = (reasoning ?? "") + part.text;
        else text = (text ?? "") + part.text;
      }
      return {
        text,
        reasoning,
        finishReason: candidate?.finishReason ?? null,
      };
    } catch {
      return { text: null, reasoning: null, finishReason: null };
    }
  }
}
