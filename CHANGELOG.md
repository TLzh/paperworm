# Changelog

所有重要的版本变更都记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

---

## [0.6.8] - 2026-04-21

### Added

- **Xiaomi MiMo 支持** — 新增 [Xiaomi MiMo](https://platform.xiaomimimo.com) 服务商，兼容 OpenAI API 格式，支持 `mimo-v2-pro`、`mimo-v2-flash`、`mimo-v2-omni` 等模型。复用 `OpenAIProvider`，使用 `api-key` 请求头认证（MiMo 专用认证方式）
  - 设置页服务商下拉新增 "MiMo（小米）" 选项
  - 支持 "获取模型" 按钮自动拉取 MiMo 可用模型列表
  - 主面板模型切换徽章支持显示 MiMo 名称
- **模型文档更新** — 更新 Qwen 和 Kimi 模型信息
  - Qwen：新增 `qwen3.6-max` 旗舰模型，新增 `qwen3.6-flash` 轻量模型
  - Kimi：更新至 `kimi-k2.6`，支持 262K 上下文和智能体编程

---

## [0.6.7] - 2026-04-20

### Added

- **OpenRouter 支持** — 新增 [OpenRouter](https://openrouter.ai) 服务商，可通过单一 API Key 接入数百个模型（GPT-4o、Claude、Llama、Gemini 等）。API 兼容 OpenAI 格式，复用 `OpenAIProvider`，无额外依赖
  - 设置页服务商下拉新增 "OpenRouter" 选项
  - 支持 "获取模型" 按钮自动拉取 OpenRouter 全量模型列表
  - 主面板模型切换徽章支持显示 OpenRouter 名称

---

## [0.6.6] - 2026-04-16

### Added

- **Temperature & Max Tokens 合并到主面板** — 原"高级参数"两个请求参数移至主面板顶部徽章 `T: 0.7 · 4k ▼`，点击弹出 popover 统一调节；设置页"高级参数"区块已移除
- **"总结全文"提示词可自定义** — 设置页"提示词配置"区块新增"总结全文提示词"编辑框，支持模板变量 `{title}` `{authors}` `{year}` `{abstract}` `{doi}`，为空时使用内置默认值
- **"总结本文"按钮重命名为"总结全文"** — 避免与"选择文本"视觉混淆
- **设置页结构重整** — "系统提示词"区块重命名为"提示词配置"，系统提示词与总结全文提示词并列，分隔线区分

### Fixed

- 模板变量替换改用 `.replaceAll()`，修复自定义提示词中同一变量出现多次时只替换首次的 bug

---

## [0.6.5] - 2026-04-15

### Added

- **面板内 Temperature 调节** — 在主面板顶部新增 `T: 0.7 ▼` 温度徽章，点击弹出 popover，内含滑块（0–2）和数值输入框，双向联动，实时写入偏好设置
  - 切换模型后可立即在同一界面调整对应 temperature，无需前往设置页
  - 徽章每秒同步反映当前偏好值（与模型徽章行为一致）

### Removed

- **设置页 Temperature 输入框** — 已移至主面板，设置页「高级参数」区域不再重复展示

---

## [0.6.4] - 2026-04-14

### Fixed

- 修复历史会话无法被识别/加载的 bug：根因是 Zotero 在存储和同步笔记时会剥除 `<code>` 标签上的 class 属性，导致旧版正则 `class="pw-archive-data"` 匹配失败
  - `parseNoteHtml` 改为双重匹配策略：优先匹配带 class 的 `<code>`（新保存的笔记），回退匹配任意足够长（≥100 字符）的 base64 `<code>` 块（经 Zotero 同步/净化后的笔记）
  - `buildNoteHtml` 移除 `<details>` 包裹（Zotero 会将其转换为 `<p>`，包裹本身无实际效果），写入格式与 Zotero 实际存储的结果对齐

---

## [0.6.3] - 2026-04-12

### Added

- **动态模型获取** — 设置页面新增"获取模型"按钮，直接调用各厂商 API 获取最新可用模型：
  - 支持 OpenAI, DeepSeek, Claude, Gemini, Kimi, Qwen, Ollama
  - 获取到的模型列表以逗号分隔形式保存在设置框中，支持手动编辑
- **配置与使用解耦** — 优化了模型管理逻辑：
  - **设置页**：负责维护每个服务商的"模型池"（即模型列表）
  - **主面板**：负责从已配置的"模型池"中秒开切换当前使用的模型
- **主面板极速切换** — 模型切换菜单现在完全基于本地缓存，响应速度达到极致（秒开），不再有加载延迟

### Removed

- **移除硬编码模型列表** — 删除了代码中所有内置的过时模型列表（如旧版 Claude 和 GPT 模型），确保用户看到的永远是该厂商当前 API 真正支持的内容

---

## [0.6.2] - 2026-04-11

### Fixed

- 修复插件与 Zotero 9.0 不兼容的问题：将 `manifest.json` 中 `strict_max_version` 从 `8.*` 更新至 `9.*`

---

## [0.6.1] - 2026-04-11

### Added

- **"选择文本"功能** — 重构文本引用交互，替代原有"解释段落"/"翻译"/"引用选中"三个分散按钮：
  - 在 PDF 中选中文字后点击"选择文本"，输入框上方显示蓝色引用 chip，内容清晰可见
  - Chip 支持一键关闭（×），发送后自动清除，不会残留到下一条消息
  - 修复旧版引用文字在消息中出现两次的 bug
  - 修复旧版 `capturedSelection` 不清空导致跨消息污染的 bug
- 新增"画框"按钮占位（当前灰色不可用，待多模态截图功能实现后启用）

### Removed

- 移除"解释段落"、"翻译"、"引用选中"三个功能按钮（功能整合入"选择文本"）

---

## [0.6.0] - 2026-04-10

### Added

- **MinerU 精细提取支持** — 集成 [MinerU](https://github.com/opendatalab/mineru) 版面分析服务，提供结构化的 PDF 文本提取：
  - 在 PaperWorm 面板添加"⚡ 精细提取"按钮，一键提取表格、公式等结构化内容
  - 提取结果缓存为 Zotero 子笔记，支持免费账号跨设备同步
  - 优先使用 MinerU 缓存（如果存在），否则回退到 Zotero 原生提取
  - 实时进度条显示上传、解析、下载各阶段进度
- 设置面板新增 MinerU API Token 配置和连接测试功能

### Changed

- 全文提取策略调整为四级（新增 MinerU 缓存作为第一优先级）

### Fixed

- 修复 ZIP 解压路径遍历漏洞：跳过包含 `..`、绝对路径或 Windows 盘符路径的条目
- 完善 HTML 转义函数：添加对双引号和单引号的转义，防止 XSS 攻击
- 添加 MinerU 提取并发保护：防止重复点击"精细提取"按钮导致多次请求

### Security

- 增强文件路径验证，防止路径遍历攻击
- 完善用户输入转义，降低 XSS 风险

---

## [0.5.15] - 2026-04-08

### Fixed

- 修复面板顶部模型徽章（`provider · model`）不随设置变更实时更新的问题：现在每秒自动从 prefs 读取最新配置并刷新显示，切换服务商或修改模型名后立即生效，无需重新打开论文。

---

## [0.5.14] - 2026-04-07

### Added

- 新增通义千问（阿里云 DashScope）支持，推荐模型 `qwen3.6-plus`。API 兼容 OpenAI 格式，复用 `OpenAIProvider`，无额外依赖。

### Changed

- 切换到有活跃会话的论文时，面板自动滚动到 PaperWorm 聊天区块底部（最新消息），即时跳转、无动画。
- 「会话列表」和快捷操作按钮（总结本文 / 解释段落 / 翻译 / 引用选中）改为吸顶显示，长对话时无需翻回顶部即可操作。

### Fixed

- 修复同一篇论文在 Reader 面板中 `item.id` 键值可能不稳定的问题：`histories` 和 `activeNoteIDs` 现在统一使用 `parentItem.id` 作为 key（通过 `getItemKey()` 归一化），与 `saveSession` / `loadSessions` 的逻辑保持一致，防止同一篇论文在内存中产生两个独立的历史 bucket。

---

## [0.5.13] - 2026-04-07

### Added

- 新增 Kimi（月之暗面）服务商支持，推荐模型 `kimi-k2.5`（256K 上下文）。Kimi API 兼容 OpenAI 格式，复用现有 `OpenAIProvider`，无额外依赖。

### Changed

- CI：GitHub Actions 发布工作流新增 `gh release edit --generate-notes` 步骤，每次发布自动生成更新日志。

---

## [0.5.12] - 2026-03-XX

### Added

- AI 回复内容现在可以用鼠标选中并复制（添加 `user-select: text`）。
- Markdown 渲染支持引用块（`>` 开头的行），渲染为带左边框的斜体样式。

---

## [0.5.11] - 2026-03-XX

### Fixed

- 修复多 PDF tab 下选中文字污染其他论文对话的 bug：`getSelectedText()` 现在限定到当前 item 的 reader window，不再全局搜索所有 frame。

---

## [0.5.10] - 2026-03-XX

### Fixed

- 修复 Windows 下 API Key / Provider 配置不生效的根本原因：XHTML 中所有 `preference` 属性改为完整路径（`extensions.zotero.paperworm.*`），消除 UI 写入路径与 TypeScript 读取路径不一致的问题。

---

## [0.5.9] 及更早

详见 Git 提交历史：`git log --oneline`
