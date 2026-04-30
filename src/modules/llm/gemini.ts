/**
 * Google Gemini Provider
 * 使用 REST API，认证通过 x-goog-api-key 请求头传入（避免 Key 出现在 URL 日志中）
 * 流式输出返回 JSON 数组（Server-Sent Events 格式）
 */

import type { LLMProvider, LLMMessage, LLMRequestOptions, ContentPart } from "./provider";
import { zhttp } from "./provider";

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
    const data = JSON.parse(resp.responseText) as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  async chatStream(
    options: LLMRequestOptions,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    // 流式输出需要 ReadableStream，Zotero.HTTP.request() 不支持，使用 fetch()
    const url = `${BASE_URL}/models/${options.model}:streamGenerateContent?alt=sse`;
    let res: Response;
    try {
      res = await fetch(url, {
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
    const data = JSON.parse(resp.responseText) as any;
    const models = ((data.models as any[]) ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => (m.name as string).replace(/^models\//, ""))
      .filter((id) => !id.includes("embedding") && !id.includes("aqa"));
    return models.sort();
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

    if (systemMsg) {
      const sysText = typeof systemMsg.content === "string" ? systemMsg.content : "";
      body.systemInstruction = { parts: [{ text: sysText }] };
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
