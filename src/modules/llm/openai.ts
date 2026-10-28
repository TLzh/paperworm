/**
 * OpenAI 兼容 Provider
 * 同时支持 OpenAI 和 DeepSeek（两者 API 格式完全一致，仅 baseUrl 不同）
 */

import type {
  LLMProvider,
  LLMMessage,
  LLMRequestOptions,
  ReasoningLevel,
} from "./provider";
import { zhttp, fetchWithHeaderTimeout, readStreamLines } from "./provider";
import { config } from "../../../package.json";

/**
 * 各厂商推理档位表（per-vendor，UI 直接渲染；依据各家官方文档，见 docs/vendors.md）
 * value 为厂商原生枚举值，"" = 默认（不下发参数 = 厂商默认行为）。
 */
const REASONING_LEVELS: Record<string, ReasoningLevel[]> = {
  // OpenAI Models 页 + OpenRouter 参数文档：五档（gpt-5/6 系全系）
  openai: [
    { value: "", label: "默认" },
    { value: "none", label: "无思考", short: "none" },
    { value: "low", label: "低", short: "low" },
    { value: "medium", label: "中", short: "medium" },
    { value: "high", label: "高", short: "high" },
    { value: "xhigh", label: "最高", short: "xhigh" },
  ],
  // DeepSeek API Reference：reasoning_effort none/low/high/max（none 即关闭思考）
  deepseek: [
    { value: "", label: "默认", hint: "思考开 · effort=high" },
    { value: "none", label: "关闭", short: "关" },
    { value: "low", label: "低" },
    { value: "high", label: "高" },
    { value: "max", label: "最高", short: "max" },
  ],
  // Kimi 官方（platform.kimi.com 思考模型文档，2026-10-19 实拉）：
  // K3 用顶层 reasoning_effort 三档（不传 thinking）；K2.6 thinking.type 开关；
  // K2.7-code / K3 为始终思考（disabled 报错）→ 见 getReasoningLevels 按模型分流
  kimi: [
    { value: "", label: "默认" },
    { value: "disabled", label: "关闭", short: "关" },
  ],
  // Qwen 百炼：enable_thinking 布尔（omni 系支持 effort，主线模型暂不暴露）
  qwen: [
    { value: "", label: "默认" },
    { value: "disabled", label: "关闭", short: "关" },
  ],
  // MiMo 开放平台：thinking.type enabled/disabled
  mimo: [
    { value: "", label: "默认" },
    { value: "disabled", label: "关闭", short: "关" },
  ],
  // OpenRouter 参数文档：归一化六档
  openrouter: [
    { value: "", label: "默认" },
    { value: "none", label: "无思考", short: "none" },
    { value: "minimal", label: "极低", short: "minimal" },
    { value: "low", label: "低" },
    { value: "medium", label: "中", short: "medium" },
    { value: "high", label: "高" },
    { value: "xhigh", label: "最高", short: "xhigh" },
  ],
  // 智谱 GLM 基础表（5.1/5/5-Turbo/4.x：thinking.type 开关）；
  // 5.2/5.3 系按模型分流为 reasoning_effort 档位（见 getReasoningLevels）
  zhipu: [
    { value: "", label: "默认" },
    { value: "disabled", label: "关闭", short: "关" },
  ],
};

/** OpenAI 档位表（供订阅通道 openaiResponses.ts 复用——SIWC 未禁用 reasoning_effort） */
export const OPENAI_REASONING_LEVELS: ReasoningLevel[] =
  REASONING_LEVELS.openai;

// ── 推理档位的运行时学习（OpenAI 系模型支持矩阵不可静态穷举）────────────────
// 400 错误信息自带支持列表（"Supported values are: 'low', 'medium', ..."）：
// 解析 → 按 provider+model 缓存 → UI 档位表自动过滤 / 发送层安全降级。

/** 解析 400 错误文本中的档位支持列表；非该类型错误返回 null */
export function parseSupportedReasoningValues(
  errorText: string,
): string[] | null {
  const m = /Supported values are:\s*([^"]+?)(?:"|$)/i.exec(errorText);
  if (!m) return null;
  const values = [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
  return values.length > 0 ? values : null;
}

function reasoningCacheKey(provider: string, model: string): string {
  return `${config.prefsPrefix}.cache.reasoning.${provider}.${model.replace(/[.\s]/g, "_")}`;
}

/** 读取某 provider+model 已学到的档位支持列表（null=未知，按全表处理） */
export function getReasoningSupportCache(
  provider: string,
  model: string | undefined,
): string[] | null {
  if (!model) return null;
  try {
    const raw = Zotero.Prefs.get(reasoningCacheKey(provider, model), true) as
      | string
      | undefined;
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  } catch {
    return null;
  }
}

/** 缓存某 provider+model 的合法档位列表 */
export function saveReasoningSupportCache(
  provider: string,
  model: string,
  values: string[],
): void {
  try {
    Zotero.Prefs.set(
      reasoningCacheKey(provider, model),
      JSON.stringify(values),
      true,
    );
  } catch {
    /* ignore */
  }
}

/** 是否允许下发该档位（缓存未知时不限制；默认档 "" 永远允许） */
export function isReasoningValueSupported(
  provider: string,
  model: string | undefined,
  value: string,
): boolean {
  if (!value) return true;
  const supported = getReasoningSupportCache(provider, model);
  return !supported || supported.includes(value);
}

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

  getReasoningLevels(model?: string): ReasoningLevel[] {
    const levels = [...(REASONING_LEVELS[this.name] ?? [])];
    if (levels.length === 0 || !model) return levels;
    const m = model.toLowerCase();
    // Kimi K3：顶层 reasoning_effort 三档（始终思考，不传 thinking）
    if (this.name === "kimi" && /kimi-k3/.test(m)) {
      return [
        { value: "", label: "默认", hint: "effort=max" },
        { value: "low", label: "低" },
        { value: "high", label: "高" },
        { value: "max", label: "最高", short: "max" },
      ];
    }
    // 智谱 GLM 按模型分流（官方深度思考文档，docs/vendors.md §6.1）：
    // 5.3 系始终思考仅 effort 三档；5.2 支持全档；其余 thinking.type 开关
    if (this.name === "zhipu") {
      if (/glm-5\.3/.test(m)) {
        return [
          { value: "", label: "默认", hint: "始终思考 · effort=max" },
          { value: "low", label: "低" },
          { value: "high", label: "高" },
          { value: "max", label: "最高", short: "max" },
        ];
      }
      if (/glm-5\.2/.test(m)) {
        return [
          { value: "", label: "默认", hint: "动态思考 · effort=max" },
          { value: "none", label: "无思考", short: "none" },
          { value: "minimal", label: "极低", short: "minimal" },
          { value: "low", label: "低" },
          { value: "medium", label: "中", short: "medium" },
          { value: "high", label: "高" },
          { value: "xhigh", label: "特高", short: "xhigh" },
          { value: "max", label: "最高", short: "max" },
        ];
      }
    }
    // 仅思考模型（无法关闭思考，各家模型矩阵，docs/vendors.md）：
    // 过滤为只剩默认档，UI 如实显示"无法关闭"
    const onlyThinking =
      (this.name === "kimi" && /k2\.7-code/.test(m)) ||
      (this.name === "qwen" && /(2\.4t-a95b|max-preview)/.test(m)) ||
      (this.name === "deepseek" && /deepseek-r1/.test(m));
    return onlyThinking ? levels.filter((l) => l.value === "") : levels;
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
    onChunk: (chunk: string, reasoningDelta?: string) => void,
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
      if (this.name === "openai") {
        const supported = parseSupportedReasoningValues(err);
        if (supported) {
          saveReasoningSupportCache(this.name, options.model, supported);
          onError(
            new Error(
              `该模型不支持所选推理档位。可用档位：${supported.join(" / ")}（已自动更新该模型的档位列表，重新打开参数面板即可看到）`,
            ),
          );
          return;
        }
      }
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
        if (parsed.reasoning) onChunk("", parsed.reasoning);
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
      // OpenAI 新一代模型（gpt-5/6 系）要求 max_completion_tokens（旧名 max_tokens 返回 400）；
      // 其余 OpenAI 兼容厂商（DeepSeek/Kimi/Qwen/MiMo/OpenRouter/MiniMax）文档均为 max_tokens
      [this.name === "openai" ? "max_completion_tokens" : "max_tokens"]:
        options.maxTokens ?? 2000,
      stream,
    };
    // OpenAI：gpt-5/6 系推理模型仅接受默认 temperature，统一不发送（T 设置对其余厂商正常生效）
    if (this.name === "openai") delete body.temperature;
    // Kimi temperature 为确定值/不可修改（K2.5 传错报 400；K2.6+ 官方明言勿传）—— 全系不发
    if (this.name === "kimi") {
      delete body.temperature;
    }
    // 智谱 GLM temperature 区间 (0,1)（官方思考示例用 1.0）—— 钳制到 (0,1] 避免越界
    if (this.name === "zhipu" && typeof body.temperature === "number") {
      body.temperature = Math.min(1, Math.max(0.01, body.temperature));
    }
    // 推理档位：按厂商原生枚举直出（依据各家官方文档，docs/vendors.md）
    // OpenAI：若该模型已被缓存标记为不支持当前档位（历史 400 学习结果），安全降级为不下发
    const lvl =
      this.name === "openai" &&
      options.reasoning &&
      !isReasoningValueSupported(this.name, options.model, options.reasoning)
        ? undefined
        : options.reasoning;
    if (lvl) {
      switch (this.name) {
        case "deepseek":
          // 官方：reasoning_effort 同时控制开关与力度（none=关闭），单参数即可
          body.reasoning_effort = lvl;
          break;
        case "kimi":
          // K3：reasoning_effort（始终思考，不传 thinking）；K2.6 及更早：thinking.type
          if (/kimi-k3/i.test(options.model)) {
            body.reasoning_effort = lvl;
          } else {
            body.thinking = {
              type: lvl === "disabled" ? "disabled" : "enabled",
            };
          }
          break;
        case "mimo":
          body.thinking = { type: lvl === "disabled" ? "disabled" : "enabled" };
          break;
        case "zhipu": {
          // GLM-5.2/5.3 系：reasoning_effort（5.3 仅 low/high/max，非法值报错——
          // 合法集合由档位表保证）；其余（5.1/5/5-Turbo/4.x）：thinking.type 开关
          const m = options.model.toLowerCase();
          if (/glm-5\.[23]/.test(m)) {
            body.reasoning_effort = lvl;
          } else {
            body.thinking = {
              type: lvl === "disabled" ? "disabled" : "enabled",
            };
          }
          break;
        }
        case "qwen":
          body.enable_thinking = lvl !== "disabled";
          break;
        case "openai":
        case "openrouter":
          body.reasoning_effort = lvl;
          break;
      }
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
    const data = line.slice(6).trim();
    if (data === "[DONE]") {
      return { text: null, reasoning: null, finishReason: null };
    }
    try {
      const json = JSON.parse(data) as any;
      const delta = json.choices?.[0]?.delta;
      return {
        text: delta?.content ?? null,
        // 思考型模型：推理增量走 reasoning_content（Kimi/DeepSeek）或 reasoning（OpenRouter 等）
        reasoning: delta?.reasoning_content ?? delta?.reasoning ?? null,
        finishReason: json.choices?.[0]?.finish_reason ?? null,
      };
    } catch {
      return { text: null, reasoning: null, finishReason: null };
    }
  }
}
