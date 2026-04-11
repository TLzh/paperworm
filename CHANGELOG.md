# Changelog

所有重要的版本变更都记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

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
