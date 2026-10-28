/**
 * OpenAI Responses API Provider（ChatGPT 订阅通道，SIWC）
 *
 * 依据 SIWC Preview limitations（2026-10-28 实拉，docs/vendors.md OpenAI 节）：
 * - 仅公开 /v1/responses 端点（禁用 backend-api）；强制 store:false + stream:true
 * - 不支持 temperature / top_p / max_output_tokens / system role（用 instructions）
 *   → 本 Provider 直接忽略这些选项，UI 层负责按通道禁用控件并说明
 * - reasoning_effort 未列入禁用清单 → 推理档位照常下发（reasoning.effort）
 * - 订阅限额错误码 subscription_sharing_* → SiwcUsageLimitError（UI 显示 Manage usage）
 * - 非流式 chat() 同样走流式聚合（store:false 约束下的合规实现）
 */

import type {
  LLMProvider,
  LLMMessage,
  LLMRequestOptions,
  ContentPart,
  ReasoningLevel,
} from "./provider";
import { fetchWithHeaderTimeout, readStreamLines } from "./provider";
import { config } from "../../../package.json";
import { SiwcAuth, SiwcUsageLimitError, ReauthRequiredError } from "./siwcAuth";
import {
  OPENAI_REASONING_LEVELS,
  parseSupportedReasoningValues,
  saveReasoningSupportCache,
  getReasoningSupportCache,
  isReasoningValueSupported,
} from "./openai";

const BASE_URL = "https://api.openai.com/v1";

/** Responses API input 项（system 走 instructions，不进 input 数组） */
function toInputItems(messages: LLMMessage[]): any[] {
  const items: any[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "assistant" || typeof m.content === "string") {
      items.push({ role: m.role, content: m.content });
      continue;
    }
    // 用户多模态：ContentPart[] → input_text / input_image
    const parts = (m.content as ContentPart[]).map((p) =>
      p.type === "text"
        ? { type: "input_text", text: p.text }
        : { type: "input_image", image_url: p.image_url.url },
    );
    items.push({ role: m.role, content: parts });
  }
  return items;
}

export class OpenAIResponsesProvider implements LLMProvider {
  readonly name = "openai-siwc";

  getReasoningLevels(model?: string): ReasoningLevel[] {
    const levels = [...OPENAI_REASONING_LEVELS];
    // 按运行时学到的支持列表过滤（默认档 "" 永远保留）
    const supported = getReasoningSupportCache("openai-siwc", model);
    return supported
      ? levels.filter((l) => l.value === "" || supported.includes(l.value))
      : levels;
  }

  async chat(options: LLMRequestOptions): Promise<string> {
    // store:false 约束：非流式场景以流式聚合实现
    return new Promise((resolve, reject) => {
      let full = "";
      void this.chatStream(
        options,
        (chunk) => {
          full += chunk;
        },
        (finishReason) => {
          if (finishReason === "length") {
            reject(new Error("输出因长度限制被截断"));
          } else {
            resolve(full);
          }
        },
        reject,
      ).catch(reject);
    });
  }

  async chatStream(
    options: LLMRequestOptions,
    onChunk: (chunk: string, reasoningDelta?: string) => void,
    onDone: (finishReason?: string) => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    let token: string;
    try {
      token = await SiwcAuth.getValidAccessToken();
    } catch (e) {
      onError(e as Error); // ReauthRequiredError → UI 引导重新登录
      return;
    }

    const systemMsg = options.messages.find((m) => m.role === "system");
    const body: Record<string, any> = {
      model: options.model,
      input: toInputItems(options.messages),
      store: false,
      stream: true,
    };
    if (systemMsg && typeof systemMsg.content === "string") {
      body.instructions = systemMsg.content;
    }
    // 推理参数（Responses API 形态；温度/MaxTokens 被通道禁用，忽略）：
    // - effort：所选档位；若该模型被缓存标记为不支持（历史 400 学习结果）则不下发
    // - summary:"auto"：请求推理摘要流（原始思维链不公开，摘要可通过 API 获得）
    const effort =
      options.reasoning &&
      isReasoningValueSupported("openai-siwc", options.model, options.reasoning)
        ? options.reasoning
        : undefined;
    body.reasoning = {
      ...(effort ? { effort } : {}),
      summary: "auto",
    };

    let res: Response;
    try {
      res = await fetchWithHeaderTimeout(`${BASE_URL}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      onError(e instanceof ReauthRequiredError ? e : (e as Error));
      return;
    }

    if (!res.ok) {
      const errText = await res.text();
      // 推理档位不被该模型支持：解析官方支持列表 → 缓存 → 友好提示（下次自动过滤）
      const supported = parseSupportedReasoningValues(errText);
      if (supported) {
        saveReasoningSupportCache("openai-siwc", options.model, supported);
        onError(
          new Error(
            `该模型不支持所选推理档位。可用档位：${supported.join(" / ")}（已自动更新该模型的档位列表，重新打开参数面板即可看到）`,
          ),
        );
        return;
      }
      // 订阅限额/不可用：专属错误码交 UI 层展示官方引导（Manage usage）
      if (errText.includes("subscription_sharing_usage_limit_exceeded")) {
        onError(
          new SiwcUsageLimitError("subscription_sharing_usage_limit_exceeded"),
        );
        return;
      }
      if (errText.includes("subscription_sharing_usage_unavailable")) {
        onError(
          new SiwcUsageLimitError("subscription_sharing_usage_unavailable"),
        );
        return;
      }
      onError(new Error(`OpenAI（订阅）API error ${res.status}: ${errText}`));
      return;
    }

    const reader = (
      res.body as any
    ).getReader() as ReadableStreamDefaultReader<Uint8Array>;
    let finishReason: string | undefined;
    let streamError: Error | null = null;
    // 诊断：采集订阅通道实际推送的 SSE 事件类型（一次性排查摘要流是否可用）
    const seenEventTypes = new Set<string>();

    try {
      await readStreamLines(reader, (line) => {
        if (!line.startsWith("data: ")) return;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") return;
        let ev: any;
        try {
          ev = JSON.parse(data);
        } catch {
          return;
        }
        if (typeof ev.type === "string") seenEventTypes.add(ev.type);
        switch (ev.type) {
          case "response.output_text.delta":
            if (ev.delta) onChunk(ev.delta);
            break;
          case "response.reasoning_summary_text.delta":
            // 推理摘要增量（非原始思维链；订阅通道能提供的最接近形态）
            if (ev.delta) onChunk("", ev.delta);
            break;
          case "response.completed":
            finishReason = "stop";
            break;
          case "response.incomplete":
            // 输出长度上限（订阅通道由套餐管理）
            finishReason = "length";
            break;
          case "response.failed": {
            const code = ev.response?.error?.code ?? "unknown";
            if (
              typeof code === "string" &&
              code.startsWith("subscription_sharing_")
            ) {
              streamError = new SiwcUsageLimitError(code);
            } else {
              streamError = new Error(`响应失败（${code}）`);
            }
            return true; // 提前结束流读取
          }
        }
        return undefined;
      });
      if (streamError) {
        onError(streamError);
        return;
      }
      try {
        Zotero.Prefs.set(
          `${config.prefsPrefix}.debug.siwcEvents`,
          [...seenEventTypes].join(", "),
          true,
        );
      } catch {
        /* ignore */
      }
      onDone(finishReason ?? undefined);
    } catch (e) {
      onError(e as Error);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const models = await this.getModels();
      return models.length > 0;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    const token = await SiwcAuth.getValidAccessToken();
    const res = await fetchWithHeaderTimeout(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`获取模型列表失败（${res.status}）`);
    }
    const data: any = await res.json();
    // SIWC 通道模型列表形如 {models:[{slug,display_name,visibility}]}（官方 SIWC 文档）；
    // 兼容标准 {data:[{id}]} 形态作为兜底
    if (Array.isArray(data.models)) {
      return data.models
        .filter((m: any) => m.visibility === "list")
        .map((m: any) => m.slug as string)
        .filter(Boolean);
    }
    if (Array.isArray(data.data)) {
      return data.data.map((m: any) => m.id as string).filter(Boolean);
    }
    return [];
  }
}
