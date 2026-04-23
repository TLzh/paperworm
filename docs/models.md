# PaperWorm 模型指南

> 支持的 LLM 提供商和模型速查手册

---

## 快速选择

| 使用场景       | 推荐模型          | 说明                       |
| -------------- | ----------------- | -------------------------- |
| **日常使用**   | Claude Sonnet 4.6 | 最佳平衡，性价比高         |
| **复杂任务**   | Claude Opus 4.7   | 最新旗舰，智能体编程最强   |
| **长程任务**   | MiMo V2.5-Pro     | 近千轮工具调用，超长上下文 |
| **快速响应**   | Claude Haiku 4.5  | 最快最便宜，适合简单问题   |
| **中文优化**   | Kimi k2.5         | 月之暗面，中文表现优秀     |
| **代码生成**   | GPT-5.4           | OpenAI 最新旗舰模型        |
| **免费使用**   | Gemini 3 Flash    | Google 免费 tier 可用      |

---

## 提供商详情

### Anthropic Claude

**最新模型系列**：Claude 4.7

| 模型           | API ID              | 上下文      | 价格 (输入/输出)  | 状态    |
| -------------- | ------------------- | ----------- | ----------------- | ------- |
| **Opus 4.7**   | `claude-opus-4-7`   | 1M tokens   | \$5/\$25 per MTok | ✅ 最新 |
| **Sonnet 4.6** | `claude-sonnet-4-6` | 1M tokens   | \$3/\$15 per MTok | ✅ 活跃 |
| **Haiku 4.5**  | `claude-haiku-4-5`  | 200K tokens | \$1/\$5 per MTok  | ✅ 活跃 |

**特点**：

- 流式输出支持优秀
- 支持 Extended Thinking（深度推理）
- **Opus 4.7**：智能体编程（agentic coding）能力大幅提升
- 测试连接使用 Haiku 4.5（便宜且快速）

**注意事项**：

- ❌ `claude-3-haiku-20240307` 已退役，不再可用
- ⚠️ `claude-sonnet-4-20250514` 和 `claude-opus-4-20250514` 将于 **2026-06-15** 退役

---

### OpenAI

**模型系列**：GPT-5.4

| 模型             | API ID         | 上下文      | 特点       |
| ---------------- | -------------- | ----------- | ---------- |
| **GPT-5.4**      | `gpt-5.4`      | 128K tokens | 最强旗舰   |
| **GPT-5.4 Mini** | `gpt-5.4-mini` | 128K tokens | 性价比高   |
| **GPT-5.4 Nano** | `gpt-5.4-nano` | 128K tokens | 最快最便宜 |

**特点**：

- 支持 Function Calling（高级功能）
- 知识截止 2025 年
- 标准 OpenAI API 格式

---

### Google Gemini

**模型系列**：Gemini 3

| 模型               | API ID                   | 上下文    | 价格           | 状态      |
| ------------------ | ------------------------ | --------- | -------------- | --------- |
| **Gemini 3 Flash** | `gemini-3-flash-preview` | 1M tokens | 免费 tier 可用 | ✅ 预览版 |
| **Gemini 3.1 Pro** | `gemini-3.1-pro-preview` | 2M tokens | 付费           | ✅ 预览版 |

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

**模型系列**：Kimi k2.6

| 模型          | API ID      | 上下文      | 特点       |
| ------------- | ----------- | ----------- | ---------- |
| **Kimi k2.6** | `kimi-k2.6` | 262K tokens | 智能体编程 |

**特点**：

- **智能体编码（Agentic Coding）**：支持 12 小时长时运行、4000 步协同操作
- **Agent Swarm**：单次调度最多 300 个子智能体
- 中文理解和生成能力优秀
- OpenAI 兼容 API 格式
- 适合中文论文阅读和复杂编程任务

**定价**：

- 输入：\$2 / MTok
- 输出：\$10 / MTok

---

### 阿里云通义千问

**模型系列**：Qwen 3.6

| 模型               | API ID          | 上下文      | 特点     |
| ------------------ | --------------- | ----------- | -------- |
| **Qwen 3.6 Max**   | `qwen3.6-max`   | 128K tokens | 最新旗舰 |
| **Qwen 3.6 Plus**  | `qwen3.6-plus`  | 128K tokens | 中文优化 |
| **Qwen 3.6 Flash** | `qwen3.6-flash` | 128K tokens | 轻量高效 |

**特点**：

- DashScope 平台
- **Qwen 3.6 Max**：更强的世界知识和指令遵循能力，智能体编程表现显著提升
- **Qwen 3.6 Plus**：中文多轮对话优化，适合学术场景
- **Qwen 3.6 Flash**：轻量高效，Agentic Coding 能力全面提升

**定价**：

- Qwen 3.6 Max：输入 \$1.0 / MTok，输出 \$4.0 / MTok
- Qwen 3.6 Plus：输入 \$0.5 / MTok，输出 \$2.0 / MTok
- Qwen 3.6 Flash：输入 \$0.1 / MTok，输出 \$0.4 / MTok

---

### DeepSeek

**模型系列**：DeepSeek V3

| 模型            | API ID          | 上下文     | 特点     |
| --------------- | --------------- | ---------- | -------- |
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

| 模型      | 大小       | 要求     |
| --------- | ---------- | -------- |
| Llama 3.1 | 8B/70B     | 本地运行 |
| Mistral   | 7B         | 本地运行 |
| Qwen 2.5  | 7B/14B/32B | 本地运行 |

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

| 模型              | API ID                            | 上下文      | 特点           |
| ----------------- | --------------------------------- | ----------- | -------------- |
| GPT-4.1           | `openai/gpt-4.1`                  | 1M tokens   | OpenAI 旗舰    |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4-6`     | 200K tokens | Anthropic 旗舰 |
| Gemini 2.5 Flash  | `google/gemini-2.5-flash-preview` | 1M tokens   | 高速低价       |
| Llama 4 Maverick  | `meta-llama/llama-4-maverick`     | 1M tokens   | 开源旗舰       |
| DeepSeek R2       | `deepseek/deepseek-r2`            | 128K tokens | 推理增强       |

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

### Xiaomi MiMo

**概述**：[Xiaomi MiMo](https://platform.xiaomimimo.com) 是小米推出的 AI 大模型，兼容 OpenAI API 格式，支持 `api-key` 认证方式。

**最新模型系列**：MiMo V2.5

| 模型                 | API ID            | 上下文       | 特点                       |
| -------------------- | ----------------- | ------------ | -------------------------- |
| **MiMo V2.5-Pro**    | `mimo-v2.5-pro`   | 1M tokens    | 最强旗舰，长程任务专家     |
| **MiMo V2.5**        | `mimo-v2.5`       | 1M tokens    | 全模态 Agent，性价比高     |
| **MiMo V2 Pro**      | `mimo-v2-pro`     | 131K tokens  | 旗舰模型，深度推理         |
| **MiMo V2 Flash**    | `mimo-v2-flash`   | 65K tokens   | 快速响应，性价比高         |
| **MiMo V2 Omni**     | `mimo-v2-omni`    | 32K tokens   | 多模态支持                 |

**V2.5 系列亮点**：

- **MiMo V2.5-Pro**：小米最强模型，在复杂软件工程、长程任务方面与 Claude Opus 4.6、GPT-5.4 竞争；支持近千轮工具调用的长程任务
- **MiMo V2.5**：原生全模态 Agent 模型，支持图像、音频、视频理解；Token 效率比 V2-Pro 提升约 50%
- **超长上下文**：V2.5 系列支持 1M tokens 上下文
- **即将开源**：V2.5-Pro 和 V2.5 即将全球开源

**定价**（Token Plan）：

- MiMo V2.5：1x（1 Token = 1 Credit）
- MiMo V2.5-Pro：2x（1 Token = 2 Credits）
- 夜间优惠（00:00-08:00 北京时间）：额外 8 折

**特点**：

- 完全兼容 OpenAI API 格式
- 使用 `api-key` 请求头认证（非 Bearer）
- 支持流式输出（SSE 格式）
- 支持思维链（thinking mode）

**配置方式**：

1. 注册 [platform.xiaomimimo.com](https://platform.xiaomimimo.com) 并获取 API Key
2. PaperWorm 设置中选择 "MiMo（小米）"，填入 API Key
3. 点击"获取模型"自动加载可用模型列表

---

### MiniMax

**概述**：[MiniMax](https://platform.minimaxi.com) 是 MiniMax 推出的 AI 大模型，兼容 OpenAI API 格式，支持 `reasoning_split` 参数分离思考内容。

| 模型                       | API ID                   | 上下文      | 特点                          |
| -------------------------- | ------------------------ | ----------- | ----------------------------- |
| **MiniMax-M2.7**           | `MiniMax-M2.7`           | 204K tokens | 开启模型的自我迭代（~60 TPS） |
| **MiniMax-M2.7-highspeed** | `MiniMax-M2.7-highspeed` | 204K tokens | M2.7 极速版（~100 TPS）       |
| **MiniMax-M2.5**           | `MiniMax-M2.5`           | 204K tokens | 顶尖性能与极致性价比          |
| **MiniMax-M2.5-highspeed** | `MiniMax-M2.5-highspeed` | 204K tokens | M2.5 极速版（~100 TPS）       |
| **MiniMax-M2.1**           | `MiniMax-M2.1`           | 204K tokens | 强大多语言编程能力            |
| **MiniMax-M2.1-highspeed** | `MiniMax-M2.1-highspeed` | 204K tokens | M2.1 极速版（~100 TPS）       |
| **MiniMax-M2**             | `MiniMax-M2`             | 204K tokens | 专为高效编码与 Agent 工作流   |

**特点**：

- 完全兼容 OpenAI API 格式（Bearer 认证）
- Temperature 范围：(0.0, 1.0]，推荐 1.0
- 模型原生输出包含思维链（包裹在 `<think>` 标签中），PaperWorm 会自动过滤

**注意事项**：

- `temperature` 超出 (0.0, 1.0] 范围会返回错误
- 部分 OpenAI 参数（如 `presence_penalty`、`frequency_penalty`）会被忽略
- 当前不支持图像和音频类型的输入

**配置方式**：

1. 注册 [platform.minimaxi.com](https://platform.minimaxi.com) 并获取 API Key
2. PaperWorm 设置中选择 "MiniMax"，填入 API Key
3. 点击"获取模型"自动加载可用模型列表

---

## 模型选择建议

### 预算优先

- **免费**：Gemini 3 Flash（Google）
- **低价**：Ollama 本地部署
- **性价比**：DeepSeek V3、Kimi k2.5
- **多模型统一管理**：OpenRouter（单一账号接入全部厂商）

### 质量优先

- **最强智能**：Claude Opus 4.7、GPT-5.4
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

| 日期       | 更新内容                                          |
| ---------- | ------------------------------------------------- |
| 2026-04-08 | 新增 Claude 4.6 系列模型信息                      |
| 2026-04-08 | 更新 GPT-5.4 系列模型信息                         |
| 2026-04-08 | 更新 Gemini 3 系列模型信息                        |
| 2026-04-20 | 新增 OpenRouter 服务商支持和文档                  |
| 2026-04-21 | 新增 Xiaomi MiMo 服务商支持和文档                 |
| 2026-04-21 | 更新 Claude 模型信息：新增 Opus 4.7，更新弃用通知 |
| 2026-04-22 | 新增 MiniMax 服务商支持 |
| 2026-04-23 | 更新 Xiaomi MiMo：新增 V2.5 和 V2.5-Pro 模型 |

---

## 思维链（Chain-of-Thought）支持状态

> 本章节记录各模型思维链支持情况及 PaperWorm 的处理策略。

### 当前状态

| 提供商 | 思维链支持 | PaperWorm 处理 | 状态 |
|--------|-----------|----------------|------|
| **MiniMax** | ✅ `<think>` 标签包裹 | 流式输出时过滤标签，最终内容无思维链 | ✅ 已适配 |
| **OpenAI (o1/o3)** | ✅ `reasoning_content` | 未处理 | ⏳ 待适配 |
| **DeepSeek** | ✅ `<think>` 标签包裹 | 未处理 | ⏳ 待适配 |
| **Anthropic** | ✅ `thinking` content block | 未处理 | ⏳ 待适配 |
| **Gemini** | ✅ `thought` 字段 | 未处理 | ⏳ 待适配 |
| **Kimi/Qwen/MiMo** | 部分支持 | 未处理 | ⏳ 待适配 |

### MiniMax 思维链处理经验

**发现的问题**：
1. MiniMax 原生格式将思维链包裹在 `<think>...</think>` 标签中，直接包含在 `content` 字段
2. 思维链语言不固定（中文/英文混合），影响阅读体验
3. SSE 流式传输中 `<think>` 标签可能跨多个 chunk，需要在 UI 层累积完整内容后过滤

**实现方案**：
- Provider 层：`minimax.ts` 中过滤 `<think>` 标签（作为第一层防护）
- UI 层：`readerPanel.ts` 中累积 `fullResponse` 后统一过滤（解决跨 chunk 问题）
- 正则表达式：`/<think>[\s\S]*?<\/think>/g`

**注意事项**：
- 流式输出时思维链会短暂显示，完成后自动过滤
- 这是当前最优解，未来版本将设计统一的思维链显示架构

### 未来规划

**v0.7.x 目标**：
- 设计统一的思维链显示架构（可折叠、灰色显示）
- 支持所有主流模型的思维链提取
- 用户可配置是否显示思维链

---

## 参考链接

- [Anthropic Claude 文档](https://docs.anthropic.com/)
- [OpenAI 模型指南](https://platform.openai.com/docs/models)
- [Google Gemini 文档](https://ai.google.dev/)
- [Kimi API 文档](https://platform.moonshot.cn/)
- [Qwen 文档](https://help.aliyun.com/dashscope/)
- [DeepSeek 文档](https://platform.deepseek.com/)
- [MiniMax 文档](https://platform.minimaxi.com/docs/)
- [Ollama 模型库](https://ollama.com/library)

---

**维护提示**：模型价格和可用性经常变动，请定期查看官方文档获取最新信息。
