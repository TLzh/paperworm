// LLM 配置
pref("extensions.zotero.paperworm.llm.provider", "openai");

pref("extensions.zotero.paperworm.llm.openai.apiKey", "");
pref("extensions.zotero.paperworm.llm.openai.model", "gpt-6.1-sol");

// ChatGPT 订阅通道（SIWC）：凭据类 pref 由 OAuth 流程写入，默认全部为空
pref("extensions.zotero.paperworm.llm.openai-siwc.model", "gpt-6.1-sol");
pref("extensions.zotero.paperworm.llm.openai-siwc.clientId", "");
pref("extensions.zotero.paperworm.llm.openai-siwc.email", "");
pref("extensions.zotero.paperworm.llm.openai-siwc.subject", "");
pref("extensions.zotero.paperworm.llm.openai-siwc.hostId", "");
pref("extensions.zotero.paperworm.llm.openai-siwc.idToken", "");
pref("extensions.zotero.paperworm.llm.openai-siwc.accessToken", "");
pref("extensions.zotero.paperworm.llm.openai-siwc.refreshToken", "");
pref("extensions.zotero.paperworm.llm.openai-siwc.expiresAt", "");
pref("extensions.zotero.paperworm.llm.openai-siwc.scopes", "");
pref("extensions.zotero.paperworm.llm.openai-siwc.welcomed", "");
pref("extensions.zotero.paperworm.llm.openai-siwc.reauth", "");
pref("extensions.zotero.paperworm.llm.openai-siwc.reasoning", "");

pref("extensions.zotero.paperworm.llm.deepseek.apiKey", "");
pref("extensions.zotero.paperworm.llm.deepseek.model", "deepseek-v4-pro");

pref("extensions.zotero.paperworm.llm.anthropic.apiKey", "");
pref("extensions.zotero.paperworm.llm.anthropic.model", "claude-sonnet-5.5");

pref("extensions.zotero.paperworm.llm.gemini.apiKey", "");
pref("extensions.zotero.paperworm.llm.gemini.model", "gemini-3.8-flash");

pref(
  "extensions.zotero.paperworm.llm.ollama.baseUrl",
  "http://localhost:11434",
);
pref("extensions.zotero.paperworm.llm.ollama.model", "llama3.2");

pref("extensions.zotero.paperworm.llm.kimi.apiKey", "");
pref("extensions.zotero.paperworm.llm.kimi.model", "kimi-k3");

pref("extensions.zotero.paperworm.llm.qwen.apiKey", "");
pref("extensions.zotero.paperworm.llm.qwen.model", "qwen3.8-plus");

pref("extensions.zotero.paperworm.llm.mimo.apiKey", "");
pref("extensions.zotero.paperworm.llm.mimo.model", "mimo-v2.6-pro");

pref("extensions.zotero.paperworm.llm.minimax.apiKey", "");
pref("extensions.zotero.paperworm.llm.minimax.model", "MiniMax-M3");

pref("extensions.zotero.paperworm.llm.zhipu.apiKey", "");
pref("extensions.zotero.paperworm.llm.zhipu.model", "glm-5.3");

pref("extensions.zotero.paperworm.llm.openrouter.apiKey", "");
pref("extensions.zotero.paperworm.llm.openrouter.model", "");

// 推理档位（per-vendor：存厂商原生枚举值，空 = 默认不下发参数；档位表见各 Provider）
pref("extensions.zotero.paperworm.llm.openai.reasoning", "");
pref("extensions.zotero.paperworm.llm.deepseek.reasoning", "");
pref("extensions.zotero.paperworm.llm.anthropic.reasoning", "");
pref("extensions.zotero.paperworm.llm.gemini.reasoning", "");
pref("extensions.zotero.paperworm.llm.ollama.reasoning", "");
pref("extensions.zotero.paperworm.llm.kimi.reasoning", "");
pref("extensions.zotero.paperworm.llm.qwen.reasoning", "");
pref("extensions.zotero.paperworm.llm.mimo.reasoning", "");
pref("extensions.zotero.paperworm.llm.minimax.reasoning", "");
pref("extensions.zotero.paperworm.llm.openrouter.reasoning", "");
pref("extensions.zotero.paperworm.llm.zhipu.reasoning", "");

// PDF 提取设置
pref("extensions.zotero.paperworm.pdf.extractionMode", "zotero");
pref("extensions.zotero.paperworm.mineru.apiToken", "");

// 请求参数
pref("extensions.zotero.paperworm.llm.temperature", "0.7");
pref("extensions.zotero.paperworm.llm.maxTokens", "2000");

// 系统提示词
pref(
  "extensions.zotero.paperworm.systemPrompt.content",
  "You are a helpful academic reading assistant. Help the user understand the paper they are reading. Be concise and accurate.",
);
pref("extensions.zotero.paperworm.systemPrompt.userTemplates", "[]");

// 视觉辅助模型（框选区域截图分析）
pref("extensions.zotero.paperworm.llm.vision.provider", "");
pref("extensions.zotero.paperworm.llm.vision.model", "kimi-k2.6");

// 操作提示词
pref(
  "extensions.zotero.paperworm.action.summarizePrompt",
  "请对这篇论文做一个结构化总结，包括：研究问题、方法、主要发现、贡献和局限性。\n\n论文标题：{title}",
);

// 自定义快捷按钮（JSON 数组：[{name, prompt}]，按钮显示在主面板动作区）
pref("extensions.zotero.paperworm.action.customButtons", "[]");
