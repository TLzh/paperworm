# Changelog

所有重要的版本变更都记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

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
