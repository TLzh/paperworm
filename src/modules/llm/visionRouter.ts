/**
 * 视觉路由模块 — Kimi 视觉辅助
 *
 * 当前仅支持 Kimi 视觉模型（kimi-k2.6、kimi-k2.5、moonshot-v1-*-vision-preview）。
 * 其他 provider 将在各自文档完备后逐步接入。
 *
 * API Key 直接复用 LLM 服务配置中已保存的 Kimi API Key（llm.kimi.apiKey），
 * 无需额外配置。
 *
 * 会话级缓存：相同截图只调用一次视觉 LLM。
 */

import { config } from "../../../package.json";
import { zhttp } from "./provider";

// 会话级缓存：key = 完整 base64 data URL，value = 视觉描述文本
const descriptionCache = new Map<string, string>();

const KIMI_BASE_URL = "https://api.moonshot.cn/v1";

/** 读取 prefs，判断当前应使用哪种视觉模式 */
export function getVisionMode(): "native" | "text" {
  // 当前始终返回 text；native 模式留作后续按 model capability 扩展
  return "text";
}

/** 是否已配置辅助视觉 LLM（provider = kimi，model 已填，Kimi API Key 已配置） */
export function isVisionConfigured(): boolean {
  const provider = getPref("llm.vision.provider");
  const model = getPref("llm.vision.model");
  const apiKey = getPref("llm.kimi.apiKey");
  return provider === "kimi" && !!model && !!apiKey;
}

/**
 * 调用 Kimi 视觉模型，描述图片内容（带会话级缓存）。
 * @param dataUrl  base64 data URL（data:image/png;base64,...）
 * @param question 用户原始问题，用于两段式 prompt
 */
export async function describeImage(
  dataUrl: string,
  question: string,
): Promise<string> {
  if (descriptionCache.has(dataUrl)) {
    return descriptionCache.get(dataUrl)!;
  }

  const provider = getPref("llm.vision.provider");
  if (provider !== "kimi") {
    throw new Error(
      "当前仅支持 Kimi 视觉辅助模型，请在设置中选择「Kimi（月之暗面）」",
    );
  }

  const model = getPref("llm.vision.model");
  if (!model) {
    throw new Error("视觉模型名称未填写，请在设置中填写（如 kimi-k2.6）");
  }

  const apiKey = getPref("llm.kimi.apiKey");
  if (!apiKey) {
    throw new Error(
      "Kimi API Key 未配置，请先在「LLM 服务配置」中填写 Kimi API Key",
    );
  }

  const visionPrompt = `请详细描述这张图片中的所有内容，包括文字、图表、数学公式、图形等一切可见元素。然后回答：${question || "这张图片展示了什么？"}`;

  const isKimiK2 = model.toLowerCase().startsWith("kimi-k2");

  const body: Record<string, any> = {
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
  };

  if (isKimiK2) {
    // kimi-k2.5/k2.6 默认开启思考模式（thinking: enabled），会生成大量推理 token，
    // 图片描述不需要思考，禁用后响应速度大幅提升，且可正常设置 max_tokens
    body.thinking = { type: "disabled" };
    body.max_tokens = 800;
  } else {
    body.temperature = 0.1;
    body.max_tokens = 800;
  }

  // 使用 successCodes: false 接受所有 HTTP 状态码，以便读取 Kimi 返回的错误 JSON
  const resp = await zhttp("POST", `${KIMI_BASE_URL}/chat/completions`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    successCodes: false,
    timeout: 0,
  });

  if (resp.status !== 200) {
    let errDetail = `HTTP ${resp.status}`;
    try {
      const errBody = JSON.parse(resp.responseText) as any;
      errDetail += `: ${errBody.error?.message ?? errBody.message ?? resp.responseText.slice(0, 300)}`;
    } catch {
      errDetail += `: ${resp.responseText.slice(0, 300)}`;
    }
    Zotero.log(`PaperWorm visionRouter error — ${errDetail}`, "error");
    throw new Error(errDetail);
  }

  const data = JSON.parse(resp.responseText) as any;
  const description: string =
    data.choices?.[0]?.message?.content ?? "（无法解析图片内容）";

  descriptionCache.set(dataUrl, description);
  return description;
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
