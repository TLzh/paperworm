// LLM Manager — 根据用户配置实例化并返回对应的 Provider
// 业务代码通过 LLMManager.getProvider() 获取 Provider，不直接依赖具体厂商

import type { LLMProvider } from "./provider";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OllamaProvider } from "./ollama";
import { config } from "../../../package.json";

export type ProviderName = "openai" | "deepseek" | "anthropic" | "gemini" | "ollama" | "kimi" | "qwen" | "openrouter";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const KIMI_BASE_URL = "https://api.moonshot.cn/v1";
const QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export class LLMManager {
  private static instance: LLMManager;

  static getInstance(): LLMManager {
    if (!LLMManager.instance) {
      LLMManager.instance = new LLMManager();
    }
    return LLMManager.instance;
  }

  /** 返回当前激活的 Provider（每次调用都从 prefs 读最新配置） */
  getProvider(name?: ProviderName): LLMProvider {
    const target = name ?? this.getActiveProviderName();
    return this.buildProvider(target);
  }

  getActiveProviderName(): ProviderName {
    return (
      Zotero.Prefs.get(`${config.prefsPrefix}.llm.provider`, true) as ProviderName
    ) ?? "openai";
  }

  /** 根据 provider 名称从 prefs 读取配置并实例化 */
  buildProvider(name: ProviderName): LLMProvider {
    const p = config.prefsPrefix;

    switch (name) {
      case "openai": {
        const apiKey = Zotero.Prefs.get(`${p}.llm.openai.apiKey`, true) as string ?? "";
        return new OpenAIProvider("openai", apiKey, OPENAI_BASE_URL);
      }
      case "deepseek": {
        const apiKey = Zotero.Prefs.get(`${p}.llm.deepseek.apiKey`, true) as string ?? "";
        return new OpenAIProvider("deepseek", apiKey, DEEPSEEK_BASE_URL);
      }
      case "anthropic": {
        const apiKey = Zotero.Prefs.get(`${p}.llm.anthropic.apiKey`, true) as string ?? "";
        return new AnthropicProvider(apiKey);
      }
      case "gemini": {
        const apiKey = Zotero.Prefs.get(`${p}.llm.gemini.apiKey`, true) as string ?? "";
        return new GeminiProvider(apiKey);
      }
      case "ollama": {
        const baseUrl = Zotero.Prefs.get(`${p}.llm.ollama.baseUrl`, true) as string ?? "http://localhost:11434";
        return new OllamaProvider(baseUrl);
      }
      case "kimi": {
        const apiKey = Zotero.Prefs.get(`${p}.llm.kimi.apiKey`, true) as string ?? "";
        return new OpenAIProvider("kimi", apiKey, KIMI_BASE_URL);
      }
      case "qwen": {
        const apiKey = Zotero.Prefs.get(`${p}.llm.qwen.apiKey`, true) as string ?? "";
        return new OpenAIProvider("qwen", apiKey, QWEN_BASE_URL);
      }
      case "openrouter": {
        const apiKey = Zotero.Prefs.get(`${p}.llm.openrouter.apiKey`, true) as string ?? "";
        return new OpenAIProvider("openrouter", apiKey, OPENROUTER_BASE_URL);
      }
      default:
        throw new Error(`Unknown provider: ${name}`);
    }
  }
}
