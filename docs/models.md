# PaperWorm 模型指南

> 支持的 LLM 提供商和模型速查手册

---

## 快速选择

| 使用场景 | 推荐模型 | 说明 |
|---------|---------|------|
| **日常使用** | Claude Sonnet 4.6 | 最佳平衡，性价比高 |
| **复杂任务** | Claude Opus 4.6 | 最强智能，适合深度分析 |
| **快速响应** | Claude Haiku 4.5 | 最快最便宜，适合简单问题 |
| **中文优化** | Kimi k2.5 | 月之暗面，中文表现优秀 |
| **代码生成** | GPT-5.4 | OpenAI 最新旗舰模型 |
| **免费使用** | Gemini 3 Flash | Google 免费 tier 可用 |

---

## 提供商详情

### Anthropic Claude

**模型系列**：Claude 4.6

| 模型 | API ID | 上下文 | 价格 (输入/输出) | 状态 |
|------|--------|--------|-----------------|------|
| **Opus 4.6** | `claude-opus-4-6` | 1M tokens | \$5/\$25 per MTok | ✅ 活跃 |
| **Sonnet 4.6** | `claude-sonnet-4-6` | 1M tokens | \$3/\$15 per MTok | ✅ 活跃 |
| **Haiku 4.5** | `claude-haiku-4-5` | 200K tokens | \$1/\$5 per MTok | ✅ 活跃 |

**特点**：
- 流式输出支持优秀
- 支持 Extended Thinking（深度推理）
- 测试连接使用 Haiku 4.5（便宜且快速）

**注意事项**：
- ❌ `claude-3-haiku-20240307` 已弃用，2026-04-20 退役

---

### OpenAI

**模型系列**：GPT-5.4

| 模型 | API ID | 上下文 | 特点 |
|------|--------|--------|------|
| **GPT-5.4** | `gpt-5.4` | 128K tokens | 最强旗舰 |
| **GPT-5.4 Mini** | `gpt-5.4-mini` | 128K tokens | 性价比高 |
| **GPT-5.4 Nano** | `gpt-5.4-nano` | 128K tokens | 最快最便宜 |

**特点**：
- 支持 Function Calling（高级功能）
- 知识截止 2025 年
- 标准 OpenAI API 格式

---

### Google Gemini

**模型系列**：Gemini 3

| 模型 | API ID | 上下文 | 价格 | 状态 |
|------|--------|--------|------|------|
| **Gemini 3 Flash** | `gemini-3-flash-preview` | 1M tokens | 免费 tier 可用 | ✅ 预览版 |
| **Gemini 3.1 Pro** | `gemini-3.1-pro-preview` | 2M tokens | 付费 | ✅ 预览版 |

**特点**：
- Google AI Studio 免费额度 generous
- 多模态支持（文本+图像）
- 长上下文（最高 2M tokens）

**免费使用**：
- 访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
- 生成 API Key（无需信用卡）
- 在 PaperWorm 中填入即可使用

---

### 月之暗面 Kimi

**模型系列**：Kimi k2.5

| 模型 | API ID | 上下文 | 特点 |
|------|--------|--------|------|
| **Kimi k2.5** | `kimi-k2.5` | 256K tokens | 中文优化 |

**特点**：
- 中文理解和生成能力优秀
- OpenAI 兼容 API 格式
- 适合中文论文阅读

**定价**：
- 输入：\$2 / MTok
- 输出：\$10 / MTok

---

### 阿里云通义千问

**模型系列**：Qwen 3

| 模型 | API ID | 上下文 | 特点 |
|------|--------|--------|------|
| **Qwen 3.6 Plus** | `qwen3.6-plus` | 128K tokens | 中文优化 |

**特点**：
- DashScope 平台
- 中文多轮对话优化
- 适合学术场景

**定价**：
- 输入：\$0.5 / MTok
- 输出：\$2 / MTok

---

### DeepSeek

**模型系列**：DeepSeek V3

| 模型 | API ID | 上下文 | 特点 |
|------|--------|--------|------|
| **DeepSeek V3** | `deepseek-chat` | 64K tokens | 国产开源 |

**特点**：
- 价格极具竞争力
- 中文场景表现良好
- API 与 OpenAI 兼容

**定价**：
- 输入：\$0.07 / MTok（缓存命中）/ \$0.27（未命中）
- 输出：\$1.1 / MTok

---

### Ollama（本地部署）

**支持的模型**：任意 Ollama 支持的本地模型

| 模型 | 大小 | 要求 |
|------|------|------|
| Llama 3.1 | 8B/70B | 本地运行 |
| Mistral | 7B | 本地运行 |
| Qwen 2.5 | 7B/14B/32B | 本地运行 |

**配置方式**：
1. 安装 Ollama：https://ollama.com
2. 下载模型：`ollama pull llama3.1`
3. PaperWorm 设置中填写 Base URL：`http://localhost:11434`
4. 模型名填写：`llama3.1`

**特点**：
- 完全免费（仅消耗本地算力）
- 隐私安全（数据不出本地）
- 无需 API Key

---

### OpenRouter

**概述**：[OpenRouter](https://openrouter.ai) 是模型聚合平台，通过**单一 API Key** 接入数百个模型，包括 OpenAI、Anthropic、Google、Meta、Mistral 等厂商的模型。

| 模型 | API ID | 上下文 | 特点 |
|------|--------|--------|------|
| GPT-4.1 | `openai/gpt-4.1` | 1M tokens | OpenAI 旗舰 |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4-6` | 200K tokens | Anthropic 旗舰 |
| Gemini 2.5 Flash | `google/gemini-2.5-flash-preview` | 1M tokens | 高速低价 |
| Llama 4 Maverick | `meta-llama/llama-4-maverick` | 1M tokens | 开源旗舰 |
| DeepSeek R2 | `deepseek/deepseek-r2` | 128K tokens | 推理增强 |

**特点**：
- 单一 API Key 管理所有模型，无需多个账号
- 支持"获取模型"按钮自动拉取完整模型列表
- 部分模型有免费额度
- 统一账单，方便成本控制

**配置方式**：
1. 注册 [openrouter.ai](https://openrouter.ai) 并获取 API Key
2. PaperWorm 设置中选择 "OpenRouter"，填入 API Key
3. 点击"获取模型"自动加载可用模型列表

---

## 模型选择建议

### 预算优先
- **免费**：Gemini 3 Flash（Google）
- **低价**：Ollama 本地部署
- **性价比**：DeepSeek V3、Kimi k2.5
- **多模型统一管理**：OpenRouter（单一账号接入全部厂商）

### 质量优先
- **最强智能**：Claude Opus 4.6、GPT-5.4
- **平衡之选**：Claude Sonnet 4.6

### 中文场景
1. **Kimi k2.5**（月之暗面）- 中文理解最佳
2. **Qwen 3.6 Plus**（阿里）- 学术中文优秀
3. **DeepSeek V3** - 高性价比中文模型

### 大文件处理
- **Claude**：最高 1M tokens 上下文
- **Gemini**：最高 2M tokens 上下文
- 适合整本书或长论文一次性处理

---

## 更新日志

| 日期 | 更新内容 |
|------|----------|
| 2026-04-08 | 新增 Claude 4.6 系列模型信息 |
| 2026-04-08 | 修正 Anthropic 测试模型为 Haiku 4.5（原 3-haiku 已弃用） |
| 2026-04-08 | 更新 GPT-5.4 系列模型信息 |
| 2026-04-08 | 更新 Gemini 3 系列模型信息 |
| 2026-04-20 | 新增 OpenRouter 服务商支持和文档 |

---

## 参考链接

- [Anthropic Claude 文档](https://docs.anthropic.com/)
- [OpenAI 模型指南](https://platform.openai.com/docs/models)
- [Google Gemini 文档](https://ai.google.dev/)
- [Kimi API 文档](https://platform.moonshot.cn/)
- [Qwen 文档](https://help.aliyun.com/dashscope/)
- [DeepSeek 文档](https://platform.deepseek.com/)
- [Ollama 模型库](https://ollama.com/library)

---

**维护提示**：模型价格和可用性经常变动，请定期查看官方文档获取最新信息。
