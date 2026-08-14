// LLM 配置
pref("extensions.zotero.paperworm.llm.provider", "openai");

pref("extensions.zotero.paperworm.llm.openai.apiKey", "");
pref("extensions.zotero.paperworm.llm.openai.model", "gpt-5.6-sol");

pref("extensions.zotero.paperworm.llm.deepseek.apiKey", "");
pref("extensions.zotero.paperworm.llm.deepseek.model", "deepseek-v4-pro");

pref("extensions.zotero.paperworm.llm.anthropic.apiKey", "");
pref("extensions.zotero.paperworm.llm.anthropic.model", "claude-sonnet-5");

pref("extensions.zotero.paperworm.llm.gemini.apiKey", "");
pref("extensions.zotero.paperworm.llm.gemini.model", "gemini-3.7-flash");

pref("extensions.zotero.paperworm.llm.ollama.baseUrl", "http://localhost:11434");
pref("extensions.zotero.paperworm.llm.ollama.model", "llama3.2");

pref("extensions.zotero.paperworm.llm.kimi.apiKey", "");
pref("extensions.zotero.paperworm.llm.kimi.model", "kimi-k3");

pref("extensions.zotero.paperworm.llm.qwen.apiKey", "");
pref("extensions.zotero.paperworm.llm.qwen.model", "qwen3.7-plus");

pref("extensions.zotero.paperworm.llm.mimo.apiKey", "");
pref("extensions.zotero.paperworm.llm.mimo.model", "mimo-v2-pro");

pref("extensions.zotero.paperworm.llm.minimax.apiKey", "");
pref("extensions.zotero.paperworm.llm.minimax.model", "MiniMax-M3");

pref("extensions.zotero.paperworm.llm.openrouter.apiKey", "");
pref("extensions.zotero.paperworm.llm.openrouter.model", "");

// PDF 提取设置
pref("extensions.zotero.paperworm.pdf.extractionMode", "zotero");
pref("extensions.zotero.paperworm.mineru.apiToken", "");

// 请求参数
pref("extensions.zotero.paperworm.llm.temperature", "0.7");
pref("extensions.zotero.paperworm.llm.maxTokens", "2000");

// 系统提示词
pref("extensions.zotero.paperworm.systemPrompt.content", "You are a helpful academic reading assistant. Help the user understand the paper they are reading. Be concise and accurate.");
pref("extensions.zotero.paperworm.systemPrompt.userTemplates", "[]");

// 视觉辅助模型（框选区域截图分析）
pref("extensions.zotero.paperworm.llm.vision.provider", "");
pref("extensions.zotero.paperworm.llm.vision.model", "kimi-k2.6");

// 操作提示词
pref("extensions.zotero.paperworm.action.summarizePrompt", "请对这篇论文做一个结构化总结，包括：研究问题、方法、主要发现、贡献和局限性。\n\n论文标题：{title}");
