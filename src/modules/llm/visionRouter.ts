/**
 * 视觉路由模块 — 多厂商视觉辅助（降级路径）
 *
 * 截图投递策略（readerPanel.send 的三级降级链）：
 * ① 主聊天模型直发图片（native，绝大多数现代模型支持）
 * ② 被拒后调用本模块的视觉辅助转述（需配置 llm.vision.provider/model）
 * ③ 仍未配置或失败 → 注入"图片识别失败"占位符，不阻塞主聊天
 *
 * 凭据直接复用该厂商在 LLM 服务配置中已保存的 API Key（或 ChatGPT 订阅登录），
 * 无需额外配置。会话级缓存：相同截图只调用一次视觉 LLM。
 */

import { config } from "../../../package.json";
import { LLMManager } from "./manager";
import type { ProviderName } from "./manager";

function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

// 会话级缓存：key = base64 data URL 的哈希，value = 视觉描述文本
const descriptionCache = new Map<string, string>();

/** 各提供商推荐的视觉模型（设置页切换时自动填充；依据 2026-10 模态核实） */
export const VISION_MODEL_DEFAULTS: Record<string, string> = {
  openai: "gpt-6.1-sol",
  "openai-siwc": "gpt-6.1-sol",
  anthropic: "claude-sonnet-5.5",
  gemini: "gemini-3.8-flash",
  kimi: "kimi-k2.6",
  qwen: "qwen3.8-flash",
  deepseek: "deepseek-flash",
  mimo: "mimo-v2.6-flash",
  minimax: "MiniMax-M3",
  zhipu: "glm-5.3-flash",
  openrouter: "",
  ollama: "",
};

/** 凭据 pref 后缀：订阅通道看登录凭据，Ollama 看 baseUrl，其余看 apiKey */
const CREDENTIAL_PREF: Record<string, string> = {
  "openai-siwc": "refreshToken",
  ollama: "baseUrl",
};

function providerConfigured(provider: string): boolean {
  const key = CREDENTIAL_PREF[provider] ?? "apiKey";
  return !!getPref(`llm.${provider}.${key}`);
}

/** 是否已配置辅助视觉 LLM（provider/model 已选，且该厂商凭据就绪） */
export function isVisionConfigured(): boolean {
  const provider = getPref("llm.vision.provider");
  const model = getPref("llm.vision.model");
  return !!provider && !!model && providerConfigured(provider);
}

/**
 * 调用所选厂商的视觉模型，描述图片内容（带会话级缓存）。
 * @param dataUrl  base64 data URL（data:image/png;base64,...）
 * @param question 用户原始问题，用于两段式 prompt
 */
export async function describeImage(
  dataUrl: string,
  question: string,
): Promise<string> {
  const cacheKey = hashString(dataUrl);
  if (descriptionCache.has(cacheKey)) {
    return descriptionCache.get(cacheKey)!;
  }

  const provider = getPref("llm.vision.provider");
  if (!provider) {
    throw new Error("未启用视觉辅助模型，请在设置中选择视觉提供商");
  }
  const model = getPref("llm.vision.model");
  if (!model) {
    throw new Error(
      "视觉模型名称未填写，请在设置中填写视觉模型（如 gpt-6.1-sol、claude-sonnet-5.5）",
    );
  }
  if (!providerConfigured(provider)) {
    throw new Error(
      `视觉提供商「${provider}」的凭据未配置，请先在 LLM 服务配置中完成 API Key / 登录`,
    );
  }

  const visionPrompt = `请详细描述这张图片中的所有内容，包括文字、图表、数学公式、图形等一切可见元素。然后回答：${question || "这张图片展示了什么？"}`;

  // 不干预厂商默认思考行为（保持视觉模型原生能力）。预算使用独立的
  // llm.vision.maxTokens（设置页可调，默认 8000），与全局 Max Tokens 解耦，
  // 避免用户的小预算设置把视觉辅助饿死；若预算被思考耗尽或模型不支持图片，
  // 下方空内容/假成功检测会明确抛错提示。

  const manager = LLMManager.getInstance();
  let text: string;
  try {
    text = await manager.getProvider(provider as ProviderName).chat({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: visionPrompt },
          ],
        },
      ],
      temperature: 0.1,
      maxTokens: (() => {
        const v = parseInt(getPref("llm.vision.maxTokens") || "8000", 10);
        return Number.isFinite(v) && v >= 100 ? v : 8000;
      })(),
      // 视觉转述属长任务（图片上传 + 模型思考）：120s，远高于默认 30s
      timeoutMs: 120_000,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Zotero.log(`PaperWorm visionRouter error — ${msg}`, "error");
    const isTimeout = /timed?\s*out|timeout|超时/i.test(msg);
    throw new Error(
      isTimeout
        ? `${msg}（请求超时：图片较大或模型思考较长，可稍后重试）`
        : `${msg}（若该模型不支持图片输入，请在设置中更换视觉模型，如 gpt-6.1-sol / claude-sonnet-5.5 / gemini-3.8-flash / kimi-k2.6 / glm-5.3-flash）`,
    );
  }

  const description = (text ?? "").trim();
  if (!description) {
    throw new Error(
      "视觉辅助模型未返回内容（可能是思考占用全部预算，或该模型不支持图片输入；可在设置页调大「视觉 Max Tokens」）",
    );
  }
  // 模型"自称看不到图"的短回复：说明图片未送达或有误，按失败处理（长文中提及不误杀）
  if (
    description.length < 200 &&
    /(无法|不能|看不到|看不见).{0,12}(图片|图像|照片)|(cannot|can't|unable to)\s*(see|view|access|analyze|process).{0,20}(image|picture)/i.test(
      description,
    )
  ) {
    throw new Error(
      `视觉辅助模型表示无法读取图片（${description.slice(0, 80)}…），请检查该模型是否支持图片输入`,
    );
  }
  descriptionCache.set(cacheKey, description);
  return description;
}

// ── "主模型拒绝图片"能力缓存 ─────────────────────────────────────────────────
// 目的：模型不支持视觉时，下次带图消息直接走辅助转述，跳过注定失败的直发。
// 安全设计：缓存值仅为时间戳（无图片数据、无错误详情、无任何 PII）；
// 仅当错误明确命中"图片/视觉"语义时才记录（防把 429/网络错误误判为不支持图片）；
// 30 天 TTL 自动失效（模型升级支持视觉后可重新探测）。

const NO_VISION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function noVisionKey(provider: string, model: string): string {
  return `${config.prefsPrefix}.cache.noVision.${provider}.${model.replace(/[.\s]/g, "_")}`;
}

/** 该模型是否被记录为"拒绝图片"（含 TTL 过期检查） */
export function isVisionRejected(provider: string, model: string): boolean {
  if (!provider || !model) return false;
  try {
    const raw = Zotero.Prefs.get(noVisionKey(provider, model), true) as
      | string
      | undefined;
    const ts = parseInt(raw ?? "0", 10);
    if (!ts) return false;
    if (Date.now() - ts > NO_VISION_TTL_MS) {
      try {
        Zotero.Prefs.clear(noVisionKey(provider, model), true);
      } catch {
        /* ignore */
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** 记录"该模型拒绝图片"（仅时间戳，不存任何错误内容） */
export function markVisionRejected(provider: string, model: string): void {
  if (!provider || !model) return;
  try {
    Zotero.Prefs.set(noVisionKey(provider, model), String(Date.now()), true);
  } catch {
    /* ignore */
  }
}

/** 错误是否明确与"图片输入不被支持"相关（用于防误判） */
export function isVisionRelatedError(err: Error): boolean {
  const msg = err?.message ?? "";
  return (
    /(image|vision|multimodal|图片|视觉)/i.test(msg) &&
    /(support|unsupported|invalid|not\s*(allowed|accept)|cannot|reject|content|type|format)/i.test(
      msg,
    )
  );
}

/** 清空当前会话的图片描述缓存（会话切换时调用） */
export function clearVisionCache(): void {
  descriptionCache.clear();
}

function getPref(key: string): string {
  return (
    (Zotero.Prefs.get(`${config.prefsPrefix}.${key}`, true) as string) ?? ""
  ).trim();
}
