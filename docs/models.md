# PaperWorm 模型指南

> 支持的 LLM 提供商和模型速查手册（阵容核实时点：2026-10-16）

---

## 快速选择

| 使用场景     | 推荐模型          | 说明                     |
| ------------ | ----------------- | ------------------------ |
| **日常使用** | Claude Sonnet 5.5 | 最佳平衡，性价比高       |
| **复杂任务** | Claude Fable 5.1  | 最新旗舰，能力最强       |
| **最新旗舰** | GPT-6.1 Sol       | OpenAI 当前最强          |
| **长程任务** | MiMo V2.6-Pro     | 超长上下文，长程任务     |
| **快速响应** | Claude Haiku 5.5  | 最快最便宜，适合简单问题 |
| **中文优化** | Kimi K3           | 月之暗面，中文表现优秀   |
| **免费使用** | Gemini 3.8 Flash  | Google 免费 tier 可用    |

---

## 提供商详情

### Anthropic Claude

**最新模型系列**：Claude 5.5 / Fable 5.1

| 模型           | API ID              | 上下文    | 价格 (输入/输出) | 状态    |
| -------------- | ------------------- | --------- | ---------------- | ------- |
| **Fable 5.1**  | `claude-fable-5.1`  | 1M tokens | 见官方定价       | ✅ 最强 |
| **Opus 5.5**   | `claude-opus-5.5`   | 1M tokens | 见官方定价       | ✅ 最新 |
| **Sonnet 5.5** | `claude-sonnet-5.5` | 1M tokens | 见官方定价       | ✅ 活跃 |
| **Haiku 5.5**  | `claude-haiku-5.5`  | 1M tokens | 见官方定价       | ✅ 活跃 |
| **Mythos**     | `claude-mythos-*`   | 待确认    | 邀请制预览       | ⏳ 预览 |

**特点**：

- 流式输出支持优秀
- 推理控制新体系：Extended Thinking / Adaptive Thinking / Effort / Fast mode（Claude 5 系能力矩阵；Effort 参数 `output_config.effort`，xhigh 需 4.7 Opus 及以上、max 需 4.6 Opus 及以上）
- **Fable 5.1**：Anthropic 能力最强的广泛发布模型
- **Opus 5.5**：面向复杂 agentic coding 与企业级工作
- 4.x 代（Opus 4.8/4.7/4.6 等）仍在售，属遗留代际
- 测试连接使用 Haiku 5.5（便宜且快速）

**注意事项**：

- ❌ `claude-3-haiku-20240307` 已退役，不再可用
- Mythos 尚未在聚合平台架，API 可用性待官方确认

---

### OpenAI

**模型系列**：GPT-6.1（天体命名：Sol/Luna/Terra/Astra，各配 Pro 变体）

| 模型                  | API ID              | 上下文 | 特点              |
| --------------------- | ------------------- | ------ | ----------------- |
| **GPT-6.1 Sol**       | `gpt-6.1-sol`       | 1.05M  | 当前旗舰·复杂推理 |
| **GPT-6.1 Sol Pro**   | `gpt-6.1-sol-pro`   | 1.05M  | 旗舰增强版        |
| **GPT-6 系**          | `gpt-6-sol` 等      | 1.05M  | 上一代旗舰        |
| **GPT-5.6 系**        | `gpt-5.6-sol` 等    | 1.05M  | 成熟稳定          |
| **GPT-5.4 mini/nano** | `gpt-5.4-mini/nano` | 400K   | 低成本高吞吐      |

**特点**：

- 全系支持推理控制：`reasoning_effort` 五档 `none/low/medium/high/xhigh`
- gpt-5 系及以后**不发送 `temperature`**（PaperWorm 已自动处理，使用 `max_completion_tokens`）
- 标准 OpenAI API 格式；开源系 `gpt-oss-120b/20b` 可本地部署
- 遗留 o1/o3/o4 推理系仍在售

---

#### OpenAI（ChatGPT 订阅）

**无需 API Key**：设置 → OpenAI（ChatGPT 订阅）→ 点击 **Continue with ChatGPT**，浏览器完成授权后即可使用你的 ChatGPT 订阅额度（Plus/Pro 等，按订阅计划计费）。

| 项目              | 说明                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| 支持的模型        | 订阅账号可用的 OpenAI 模型（在设置页点"获取模型"查看）                  |
| 推理档位          | 支持（低/中/高/特高/最高等，按模型而定；不支持的档位会自动隐藏）        |
| 温度 / Max Tokens | 由订阅通道管理，面板中此两项置灰（不可调）                              |
| 推理过程显示      | 订阅通道不提供推理摘要（OpenAI 不暴露原始思维链），思考阶段显示等待提示 |
| 额度管理          | 额度用尽时点击面板中的 **Manage usage** 打开 ChatGPT 用量设置           |

> 若浏览器显示"无法访问此页面"（本地回调端口被网络环境拦截），在设置页等待授权状态下复制浏览器地址栏的完整链接，粘贴到设置页的输入框点"完成登录"即可。

---

## Google Gemini

**模型系列**：Gemini 4（Argon）/ Gemini 3.8（Flash 线）

| 模型                 | API ID                   | 上下文    | 价格           | 状态      |
| -------------------- | ------------------------ | --------- | -------------- | --------- |
| **Gemini 4 Argon**   | `gemini-4-argon`         | 1M tokens | 见官方定价     | ✅ 最新   |
| **Gemini 3.8 Flash** | `gemini-3.8-flash`       | 1M tokens | 免费 tier 可用 | ✅ 稳定版 |
| **Gemini 3.7 Flash** | `gemini-3.7-flash`       | 1M tokens | 免费 tier 可用 | ✅ 稳定版 |
| **Gemini 3.1 Pro**   | `gemini-3.1-pro-preview` | 1M tokens | 付费           | ✅ 预览版 |

**特点**：

- Flash 线迭代快（3.5 → 3.8 依次发布），Pro 线迭代慢（当前 3.1 预览）
- 推理控制：`thinkingLevel` 四档 `minimal/low/medium/high`（**分模型支持矩阵**：如 3.1 Pro 不支持 minimal，Flash-Lite 默认即 minimal）
- **温度强烈建议保持默认 1.0**，低于 1.0 可能导致循环或性能下降
- 多模态支持（文本+图像）；图像系另有趣味命名产品线（Nano Banana / Nano Banana Pro）
- 长上下文 1M tokens

**免费使用**：

- 访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
- 生成 API Key（无需信用卡）
- 在 PaperWorm 中填入即可使用

---

### 月之暗面 Kimi

**模型系列**：Kimi K3

| 模型               | API ID           | 上下文      | 特点                     |
| ------------------ | ---------------- | ----------- | ------------------------ |
| **Kimi K3**        | `kimi-k3`        | 1M tokens   | 最新旗舰，仅思考模型     |
| **Kimi K2.7 Code** | `kimi-k2.7-code` | 262K tokens | 代码特化，仅思考         |
| **Kimi K2.6**      | `kimi-k2.6`      | 262K tokens | 原生多模态，可作视觉辅助 |
| **Kimi K2.5**      | `kimi-k2.5`      | 262K tokens | 混合思考（默认开启）     |

**特点**：

- **Kimi K3**：月之暗面最新旗舰，1M 上下文，**仅思考模式**（无法关闭思考）
- **Kimi K2.6**：原生多模态（视觉理解），仍可作为 PaperWorm 视觉辅助模型
- ⚠️ K2.5 系 temperature 为确定值：思考模式 1.0 / 非思考 0.6，**传其他值会报错**（PaperWorm 配置层会自动拦截）
- 中文理解和生成能力优秀
- OpenAI 兼容 API 格式

**定价**：

- 见 [Kimi 官方模型文档](https://platform.moonshot.cn/)

---

### 阿里云百炼

**概述**：[阿里云百炼](https://bailian.console.aliyun.com) 是阿里云推出的模型聚合平台，类似 OpenRouter，通过单一平台接入多家模型厂商的模型。

**模型系列**：Qwen 3.8（通义千问）

| 模型                    | API ID                   | 上下文    | 特点                     |
| ----------------------- | ------------------------ | --------- | ------------------------ |
| **Qwen 3.8 Max Prime**  | `qwen3.8-max-prime`      | 1M tokens | 旗舰之最                 |
| **Qwen 3.8 Max**        | `qwen3.8-max`            | 1M tokens | 旗舰                     |
| **Qwen 3.8 Flash**      | `qwen3.8-flash`          | 1M tokens | 轻量高效                 |
| **Qwen 3.8 Omni Flash** | `qwen3.8-omni-flash`     | 1M tokens | 全模态（支持 effort 档） |
| **Qwen 3.7 系**         | `qwen3.7-max/plus/flash` | 1M tokens | 上一代，仍在售           |

**特点**：

- **模型聚合平台**：除 Qwen 系列外，还支持 MiniMax、DeepSeek、Kimi、GLM 等第三方模型
- Qwen 3.5 及以后**默认开启思考模式**（与旧 Qwen3 相反）
- 思考开关 `enable_thinking`；思考模式下思维链最长 80K、输出上限 64K
- 统一计费，支持按量付费和套餐包

**定价**：

- 见 [阿里云百炼官方文档](https://help.aliyun.com/zh/model-studio/models)

---

### DeepSeek

**最新模型系列**：DeepSeek V4.1

| 模型                    | API ID            | 上下文    | 特点            |
| ----------------------- | ----------------- | --------- | --------------- |
| **DeepSeek V4.1 Flash** | `deepseek-flash`  | 1M tokens | 常青名·快速响应 |
| **DeepSeek V4 Pro**     | `deepseek-v4-pro` | 1M tokens | 旗舰模型        |

**旧模型（已弃用）**：

| 模型              | API ID                                | 状态                                          |
| ----------------- | ------------------------------------- | --------------------------------------------- |
| DeepSeek V4 Flash | `deepseek-v4-flash`                   | ⚠️ 已退役，请求由 V4.1-Flash 承接（Flash 价） |
| DeepSeek V3 / R1  | `deepseek-chat` / `deepseek-reasoner` | ⚠️ 已弃用                                     |

> 说明：官方 API 现仅接受 `deepseek-flash` 与 `deepseek-v4-pro` 两个模型名；快照名（`deepseek-v4.1-flash` 等）在聚合平台仍可见。

**特点**：

- **超长上下文**：1M tokens 上下文，最大 384K 输出长度
- **思考模式**：`thinking`（默认 enabled）+ `reasoning_effort` 四档 `none/low/high/max`（默认 high）
- **预算联动**：不设 max_tokens 时思考模式默认 64K（effort=max 时 128K），非思考 8K
- **双 API 格式兼容**：同时支持 OpenAI 格式和 Anthropic 格式
- 中文场景表现良好，价格极具竞争力

**思考强度（`reasoning_effort`）说明**：

| 级别   | 适用场景                  | 说明                         |
| ------ | ------------------------- | ---------------------------- |
| `none` | 无需思考的任务            | 关闭思考，直接回答           |
| `low`  | 简单任务                  | 快速响应，消耗最少           |
| `high` | 普通对话、日常 Agent 任务 | **默认级别**，平衡质量与速度 |
| `max`  | 复杂 Agent 任务、深度推理 | 最高质量，默认预算翻倍       |

- 兼容性映射：`minimal` → `low`；`medium` / `xhigh` → `high`

**注意事项**：

- 思考模式下 `temperature` 无效（不报错但被忽略）；`top_p` 仅在思考模式生效且有效区间 0.95–1.0
- 思维链内容通过 `reasoning_content` 字段返回，与 `content` 同级
- 进行了工具调用的轮次，后续请求必须回传 `reasoning_content`

**定价**（人民币）：

| 计费项             | DeepSeek Flash | DeepSeek V4 Pro |
| ------------------ | -------------- | --------------- |
| 输入（缓存命中）   | ¥0.2 / MTok    | ¥1 / MTok       |
| 输入（缓存未命中） | ¥1 / MTok      | ¥12 / MTok      |
| 输出               | ¥2 / MTok      | ¥24 / MTok      |

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
- 思考模型支持 `think` 参数：布尔或 `low/medium/high/max` 四档

---

### OpenRouter

**概述**：[OpenRouter](https://openrouter.ai) 是模型聚合平台，通过**单一 API Key** 接入数百个模型，包括 OpenAI、Anthropic、Google、Meta、Mistral 等厂商的模型。

| 模型             | API ID                         | 上下文    | 特点           |
| ---------------- | ------------------------------ | --------- | -------------- |
| GPT-6.1 Sol      | `openai/gpt-6.1-sol`           | 1.05M     | OpenAI 旗舰    |
| Claude Fable 5.1 | `anthropic/claude-fable-5.1`   | 1M tokens | Anthropic 旗舰 |
| Gemini 4 Argon   | `google/gemini-4-argon`        | 1M tokens | Google 旗舰    |
| Kimi K3          | `moonshotai/kimi-k3`           | 1M tokens | 中文旗舰       |
| DeepSeek V4.1    | `deepseek/deepseek-v4.1-flash` | 1M tokens | 推理增强       |

> 注：以上为示例模型，实际可用模型以 OpenRouter「获取模型」按钮拉取到的列表为准。

**特点**：

- 单一 API Key 管理所有模型，无需多个账号
- 支持"获取模型"按钮自动拉取完整模型列表
- 推理控制归一化：`reasoning_effort` 六档 `xhigh/high/medium/low/minimal/none`
- 参数缺席时省略不发（不注入默认值），部分模型有免费额度

**配置方式**：

1. 注册 [openrouter.ai](https://openrouter.ai) 并获取 API Key
2. PaperWorm 设置中选择 "OpenRouter"，填入 API Key
3. 点击"获取模型"自动加载可用模型列表

---

### Xiaomi MiMo

**概述**：[Xiaomi MiMo](https://platform.xiaomimimo.com) 是小米推出的 AI 大模型，兼容 OpenAI API 格式。

**最新模型系列**：MiMo V2.6

| 模型                         | API ID                     | 上下文 | 特点                 |
| ---------------------------- | -------------------------- | ------ | -------------------- |
| **MiMo V2.6-Pro**            | `mimo-v2.6-pro`            | 1.05M  | 最强旗舰             |
| **MiMo V2.6-Pro-UltraSpeed** | `mimo-v2.6-pro-ultraspeed` | 1.05M  | 极速版旗舰           |
| **MiMo V2.6-Flash**          | `mimo-v2.6-flash`          | 1.05M  | 快速响应             |
| **MiMo V2.5-Pro**            | `mimo-v2.5-pro`            | 1.05M  | 上一代旗舰，长程任务 |
| **MiMo V2.5**                | `mimo-v2.5`                | 1.05M  | 全模态 Agent         |

**特点**：

- V2.6 系列为当前旗舰（1M tokens 上下文）
- V2 系（pro/flash/omni）为旧代；思考开关 `thinking`（V2 代默认值按模型不同，V2.6 待官方确认）
- 完全兼容 OpenAI API 格式
- 支持流式输出（SSE 格式）与思维链（reasoning_content）

**配置方式**：

1. 注册 [platform.xiaomimimo.com](https://platform.xiaomimimo.com) 并获取 API Key
2. PaperWorm 设置中选择 "MiMo（小米）"，填入 API Key
3. 点击"获取模型"自动加载可用模型列表

---

### MiniMax

**概述**：[MiniMax](https://platform.minimaxi.com) 是 MiniMax 推出的 AI 大模型，兼容 OpenAI API 格式。

| 模型                       | API ID                   | 上下文      | 特点                             |
| -------------------------- | ------------------------ | ----------- | -------------------------------- |
| **MiniMax-M3**             | `MiniMax-M3`             | 1M tokens   | 最新旗舰，自适应思考（adaptive） |
| **MiniMax-M2.7**           | `MiniMax-M2.7`           | 204K tokens | 自我迭代（~60 TPS）              |
| **MiniMax-M2.7-highspeed** | `MiniMax-M2.7-highspeed` | 204K tokens | M2.7 极速版（~100 TPS）          |
| **MiniMax-M2.5**           | `MiniMax-M2.5`           | 204K tokens | 顶尖性能与极致性价比             |
| **MiniMax-M2.1**           | `MiniMax-M2.1`           | 204K tokens | 强大多语言编程能力               |

**特点**：

- 完全兼容 OpenAI API 格式（Bearer 认证）
- **M3 思考控制**：`thinking: "adaptive"（默认，自适应）|"disabled"`
- M2.x 系为仅思考模型；Temperature 范围 (0.0, 1.0]，推荐 1.0
- M2.x 原生输出思维链包裹在 `<think>` 标签中，PaperWorm 会自动过滤

**注意事项**：

- `temperature` 超出 (0.0, 1.0] 范围会返回错误（M2.x）
- 部分 OpenAI 参数（如 `presence_penalty`、`frequency_penalty`）会被忽略
- 当前不支持图像和音频类型的输入

**配置方式**：

1. 注册 [platform.minimaxi.com](https://platform.minimaxi.com) 获取 API Key
2. PaperWorm 设置中选择 "MiniMax"，填入 API Key
3. 点击"获取模型"自动加载可用模型列表

---

### 智谱 GLM

**概述**：[智谱开放平台](https://open.bigmodel.cn) 提供 GLM 系列模型，标准 API 完全兼容 OpenAI 格式（Bearer 认证），按量计费。

**最新模型系列**：GLM-5.3

| 模型              | API ID          | 上下文 | 特点                               |
| ----------------- | --------------- | ------ | ---------------------------------- |
| **GLM-5.3**       | `glm-5.3`       | 200K   | 旗舰，强制思考 + effort 三档       |
| **GLM-5.3-Flash** | `glm-5.3-flash` | 200K   | 快速版                             |
| **GLM-5.2**       | `glm-5.2`       | 1M     | 动态思考 + effort 全档（none~max） |
| **GLM-5V-Turbo**  | `glm-5v-turbo`  | 200K   | 视觉理解                           |
| **GLM-4.x**       | `glm-4.6` 等    | 128K   | 上一代                             |

**推理档位**（per-vendor，按模型自动分流）：

| 模型系                      | 档位                                              | 说明                                                                                   |
| --------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| GLM-5.3 系                  | 默认 / 低 / 高 / 最高                             | **始终思考**（无法关闭，传 disabled 报错）；`reasoning_effort: low/high/max`，默认 max |
| GLM-5.2                     | 默认 / 无思考 / 极低 / 低 / 中 / 高 / 特高 / 最高 | 动态思考（默认 max）；`reasoning_effort: none~max` 全档原生支持                        |
| GLM-5.1 / 5 / 5-Turbo / 4.x | 默认 / 关闭                                       | `thinking.type` 开关（enabled 为模型自动判断是否思考）                                 |

**特点**：

- 完全兼容 OpenAI API 格式（`open.bigmodel.cn/api/paas/v4`）
- 流式思维链走 `reasoning_content` 字段
- Temperature 区间 (0,1)，默认 0.6；PaperWorm 发送时自动钳制
- 中文场景表现优秀

**注意**：GLM Coding Plan 订阅套餐仅限官方指定编程工具使用（协议条款），PaperWorm 使用标准 API（按量计费），两者互不影响。

**配置方式**：

1. 注册 [open.bigmodel.cn](https://open.bigmodel.cn) 并创建 API Key
2. PaperWorm 设置中选择 "智谱 GLM"，填入 API Key
3. 点击"获取模型"自动加载可用模型列表

---

## 视觉辅助模型（多模态截图分析）

PaperWorm v0.7.0 新增框选区域截图功能：在 PDF 阅读时拖框选取图片/图表/公式区域，截图自动附加到下一条消息，由视觉辅助模型先描述图片内容，再注入主模型上下文。

### 工作原理

1. 用户拖框截图 → 得到 base64 PNG
2. 视觉辅助模型分析图片，生成文字描述（带会话级缓存，相同截图只调用一次）
3. 描述文本以 `[图片内容描述：\n{description}]` 形式注入主模型上下文
4. 主模型结合图片描述和用户问题作出回答
5. 保存历史时，截图以 `[截图 📷]` 占位符替代（不存储原始 base64）

### 推荐视觉模型

| 提供商               | 模型        | 说明                                                              |
| -------------------- | ----------- | ----------------------------------------------------------------- |
| **Kimi（月之暗面）** | `kimi-k2.6` | **推荐**：原生多模态，中文描述能力强；API Key 复用主模型 Kimi Key |

### 配置方式

1. 打开 **设置 → PaperWorm → 视觉辅助模型**
2. 选择提供商（当前支持 Kimi）
3. 填写视觉模型名称（如 `kimi-k2.6`）
4. 无需额外 API Key — 自动使用该提供商已配置的 Key

### 注意事项

- 未配置视觉辅助模型时，发送截图仍可进行，但主模型收到的描述为"视觉模型未配置"
- kimi-k2.6 在视觉任务中默认禁用思考模式（`thinking: disabled`），响应速度更快
- 截图数据仅在内存中保留，会话结束或切换论文后自动清空

---

## 模型选择建议

### 预算优先

- **免费**：Gemini 3.8 Flash（Google）
- **低价**：Ollama 本地部署
- **性价比**：DeepSeek Flash、Kimi K3
- **多模型统一管理**：OpenRouter（单一账号接入全部厂商）

### 质量优先

- **最强智能**：Claude Fable 5.1、GPT-6.1 Sol、Gemini 4 Argon
- **平衡之选**：Claude Sonnet 5.5

### 中文场景

1. **Kimi K3**（月之暗面）- 中文理解最佳
2. **Qwen 3.8 Max**（阿里）- 学术中文优秀
3. **DeepSeek V4** - 高性价比中文模型

### 大文件处理

- **Claude / GPT-6 系 / MiMo V2.6 / Kimi K3**：1M tokens 上下文
- **Gemini**：1M tokens 上下文
- 适合长论文一次性处理

---

## 更新日志

| 日期       | 更新内容                                                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-08 | 新增 Claude 4.6 系列模型信息                                                                                                                                                                                                       |
| 2026-04-08 | 更新 GPT-5.4 系列模型信息                                                                                                                                                                                                          |
| 2026-04-08 | 更新 Gemini 3 系列模型信息                                                                                                                                                                                                         |
| 2026-04-20 | 新增 OpenRouter 服务商支持和文档                                                                                                                                                                                                   |
| 2026-04-21 | 新增 Xiaomi MiMo 服务商支持和文档                                                                                                                                                                                                  |
| 2026-04-21 | 更新 Claude 模型信息：新增 Opus 4.7，更新弃用通知                                                                                                                                                                                  |
| 2026-04-22 | 新增 MiniMax 服务商支持                                                                                                                                                                                                            |
| 2026-04-23 | 更新 Xiaomi MiMo：新增 V2.5 和 V2.5-Pro 模型                                                                                                                                                                                       |
| 2026-04-30 | 新增视觉辅助模型章节；Kimi k2.6 补充视觉理解特性说明                                                                                                                                                                               |
| 2026-08-14 | 全面更新各厂商最新模型：Claude 5（Fable/Opus/Sonnet）、GPT-5.6、Gemini 3.7 Flash、Kimi K3、Qwen 3.7、MiniMax M3                                                                                                                    |
| 2026-10-16 | 基于 OpenRouter 实时快照+官方文档全面更新：Claude 5.5/Fable 5.1、GPT-6.1 Sol、Gemini 4 Argon/3.8 Flash、Qwen 3.8（Max Prime）、MiMo V2.6；修正 DeepSeek effort 四档（含 none）、Gemini 3.1 Pro 上下文 1M；各家推理控制参数对齐最新 |

---

## 思维链（Chain-of-Thought）支持状态

> 本章节记录各模型思维链支持情况及 PaperWorm 的处理策略。

### 当前状态

| 提供商             | 思维链格式                  | PaperWorm 处理                        | 状态      |
| ------------------ | --------------------------- | ------------------------------------- | --------- |
| **MiniMax**        | ✅ `<think>` 标签包裹       | 流式输出时过滤标签，最终内容无思维链  | ✅ 已适配 |
| **DeepSeek**       | ✅ `reasoning_content` 字段 | 解析并显示推理进度计数（已推理 N 字） | ✅ 已适配 |
| **Kimi/Qwen/MiMo** | ✅ `reasoning_content` 字段 | 解析并显示推理进度计数                | ✅ 已适配 |
| **OpenRouter**     | ✅ `reasoning` 字段         | 解析并显示推理进度计数                | ✅ 已适配 |
| **Anthropic**      | ✅ `thinking` content block | 待 v0.9.0 适配                        | ⏳ 待适配 |
| **Gemini**         | ✅ thought 部分             | 待 v0.9.0 适配                        | ⏳ 待适配 |

### MiniMax 思维链处理经验

**发现的问题**：

1. MiniMax 原生格式将思维链包裹在 `<think>...</think>` 标签中，直接包含在 `content` 字段
2. 思维链语言不固定（中文/英文混合），影响阅读体验
3. SSE 流式传输中 `<think>` 标签可能跨多个 chunk，需要在 UI 层累积完整内容后过滤

**实现方案**：

- Provider 层：`minimax.ts` 中过滤 `<think>` 标签（作为第一层防护）
- UI 层：`readerPanel.ts` 中累积 `fullResponse` 后统一过滤（解决跨 chunk 问题）
- 正则表达式：`/<think>[\s\S]*?<\/think>/g`

### DeepSeek 思维链处理经验

1. **默认启用思考模式**（`thinking: enabled`），即默认输出思维链
2. 思维链通过 `reasoning_content` 字段返回，与 `content` 同级（非标签包裹）
3. 思考模式下 `temperature` 无效、`top_p` 仅 0.95–1.0 有效
4. 上下文拼接：无工具调用时历史 `reasoning_content` 无需回传；有工具调用则必须回传

### v0.9.0 规划

- 推理强度控制改为**按厂商原生档位**（per-provider 档位表，不再统一近似映射）
- 推理内容**折叠显示**：思考阶段滚动展示 → 正文开始后自动收起（"已深度思考 · N 字 · Xs"可回看）
- 各厂商 temperature 硬约束在配置层联动拦截（如 Kimi K2.5 固定值）

---

## 参考链接

- [Anthropic Claude 文档](https://docs.anthropic.com/)
- [OpenAI 模型指南](https://platform.openai.com/docs/models)
- [Google Gemini 文档](https://ai.google.dev/)
- [Kimi API 文档](https://platform.moonshot.cn/)
- [Qwen 文档](https://help.aliyun.com/zh/model-studio/)
- [DeepSeek 文档](https://api-docs.deepseek.com/)
- [MiniMax 文档](https://platform.minimaxi.com/docs/)
- [Ollama 模型库](https://ollama.com/library)
- [OpenRouter 模型列表](https://openrouter.ai/models)

---

**维护提示**：模型价格和可用性经常变动，请定期查看官方文档获取最新信息。
