/**
 * MiniMax Provider
 * 兼容 OpenAI API 格式：
 * 1. 支持 /v1/models 端点（OpenAI 兼容，动态获取模型列表）
 * 2. 使用标准 Bearer 认证
 * 3. TODO: 未来版本考虑启用 reasoning_split 并优化思维链显示
 */

import type { LLMProvider, LLMRequestOptions } from "./provider";
import { zhttp } from "./provider";

const BASE_URL = "https://api.minimaxi.com/v1";

// MiniMax 模型列表（作为 /v1/models 端点调用失败时的 fallback）
const MINIMAX_MODELS = [
  "MiniMax-M3",
  "MiniMax-M2.7",
  "MiniMax-M2.7-highspeed",
  "MiniMax-M2.5",
  "MiniMax-M2.5-highspeed",
  "MiniMax-M2.1",
  "MiniMax-M2.1-highspeed",
  "MiniMax-M2",
];

export class MiniMaxProvider implements LLMProvider {
  readonly name = "minimax";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(options: LLMRequestOptions): Promise<string> {
    const resp = await zhttp("POST", `${BASE_URL}/chat/completions`, {
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(options, false)),
      successCodes: [200],
    });
    try {
      const data = JSON.parse(resp.responseText) as any;
      const content = data.choices?.[0]?.message?.content ?? "";
      return content.replace(/<think>[\s\S]*?<\/think>/g, "");
    } catch (e) {
      throw new Error(
        `Failed to parse MiniMax response: ${(e as Error).message}`,
      );
    }
  }

  async chatStream(
    options: LLMRequestOptions,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, {
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
      onError(new Error(`MiniMax API error ${res.status}: ${err}`));
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
      // MiniMax 已支持 /v1/models 端点，用它验证 API Key 是否有效
      await zhttp("GET", `${BASE_URL}/models`, {
        headers: this.headers(),
        successCodes: [200],
      });
      return true;
    } catch (e) {
      Zotero.log(`PaperWorm testConnection (minimax) error: ${e}`, "error");
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    // MiniMax 已支持 /v1/models 端点（OpenAI 兼容），优先动态获取；
    // 调用失败时 fallback 到硬编码列表
    try {
      const resp = await zhttp("GET", `${BASE_URL}/models`, {
        headers: this.headers(),
        successCodes: [200],
      });
      const data = JSON.parse(resp.responseText) as any;
      const models = ((data.data as any[]) ?? [])
        .map((m) => m.id as string)
        .filter(Boolean);
      if (models.length > 0) return models.sort();
    } catch (e) {
      Zotero.log(`PaperWorm MiniMax getModels error: ${e}`, "warning");
    }
    return [...MINIMAX_MODELS];
  }

  private headers(): Record<string, string> {
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
      // TODO: 未来版本考虑启用 reasoning_split 并优化思维链显示
      // reasoning_split: true,
    };
  }

  private parseSSELine(line: string): string | null {
    if (!line.startsWith("data: ")) return null;
    const data = line.slice(6).trim();
    if (data === "[DONE]") return null;
    try {
      const json = JSON.parse(data) as any;
      const content = json.choices?.[0]?.delta?.content ?? null;
      if (!content) return null;
      // MiniMax 原生格式：思维链包裹在 <think>...</think> 标签中
      // 过滤掉思维链，只返回正式回答
      return content.replace(/<think>[\s\S]*?<\/think>/g, "");
    } catch {
      return null;
    }
  }
}
