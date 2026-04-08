# PaperWorm — 版本发布规范

## 版本号规则

遵循语义化版本 `MAJOR.MINOR.PATCH`：

| 类型 | 版本号变化 | 示例场景 |
|------|-----------|---------|
| 重大重构 / 破坏性变更 | MAJOR 递增 | 核心架构重写 |
| 新功能 | MINOR 递增 | 新增模板管理、笔记联动等 |
| Bug 修复 / 小优化 | PATCH 递增 | UI 调整、逻辑修复 |

---

## Commit Message 规范（必须）

**为什么需要规范**：GitHub Actions 会根据 commit message 自动生成 Release Notes。只有规范的 commit 才能被正确分类。

### 格式要求

```
<type>: <简短描述>

<可选的详细描述>
```

### Type 前缀对照表

| 前缀 | 用途 | Release Notes 分类 |
|------|------|-------------------|
| `feat:` | 新功能 | ✨ Features |
| `fix:` | Bug 修复 | 🐛 Bug Fixes |
| `docs:` | 文档更新 | 📚 Documentation |
| `style:` | 代码格式（不影响功能） | 🎨 Styles |
| `refactor:` | 代码重构 | ♻️ Code Refactoring |
| `perf:` | 性能优化 | ⚡ Performance |
| `test:` | 测试相关 | ✅ Tests |
| `chore:` | 构建/工具/依赖 | 🔧 Maintenance |
| `ci:` | CI/CD 配置 | 🔧 Maintenance |
| `release:` | 版本发布（仅用于发布 commit） | 🚀 Release |

### 正确示例

```bash
# 新功能
git commit -m "feat: add provider dropdown for quick model switching"

# Bug 修复
git commit -m "fix: dropdown positioning to always expand downward"

# 文档更新
git commit -m "docs: update CLAUDE.md with new dev workflow"

# 代码重构
git commit -m "refactor: simplify getConfiguredProviders logic"

# 版本发布（特殊，用于最终发布 commit）
git commit -m "release: v0.5.16 — 模型快速切换 & 开发流程优化"
```

### 错误示例

```bash
# ❌ 没有 type 前缀
git commit -m "update code"

# ❌ 使用了未定义的 type
git commit -m "update: add new feature"

# ❌ 首字母大写（应小写）
git commit -m "Feat: add something"
```

---

## 发布 Checklist

每次发布按顺序完成以下步骤，全部打勾后再推送 tag。

### 一、代码确认

- [ ] `make build` 无 TypeScript 报错，`.xpi` 正常生成
- [ ] 新功能 / 修复已在 Zotero 中手动验证
- [ ] **所有 commit message 符合规范**（使用上述 type 前缀）

### 二、文档更新（本步骤与代码同一个 commit 提交）

- [ ] **`package.json`**：`version` 字段递增为新版本号
- [ ] **`CLAUDE.md`**：
  - 「当前开发状态」的「阶段」行改为新版本号和主题
  - 「已完成」列表追加本版本新增内容
- [ ] **`docs/devlog.md`**：
  - 顶部版本索引表追加一行
  - 文末（`<!-- 后续日志追加在此处 -->` 前）追加本版本条目（包含完成内容、关键决策）
- [ ] **`README.md`**（按需）：如有用户可见的新功能，更新 Features 或相关章节

### 三、发布操作

```bash
# 1. 最终构建确认版本号已更新
make build

# 2. 提交所有改动（代码 + 文档）
git add package.json CLAUDE.md src/ ...
git commit -m "release: v{VERSION} — 一句话描述"

# 3. 打 tag + 推送（触发 GitHub Actions 自动发布）
git tag v{VERSION}
git push origin main --tags
```

### 四、Release Notes（自动生成）

GitHub Actions 已配置为**自动生成 Release Notes**。只要 commit message 符合规范，发布后会自动生成分类的更新说明。

**发布流程**：
1. 推送 tag 后，GitHub Actions 自动创建 Release
2. Release Notes 根据 commit message 自动生成
3. 如有需要，可手动微调 Release 页面的描述

**生成规则**：
- GitHub 会分析本次 tag 与上次 tag 之间的所有 commit
- 根据 type 前缀自动分类到 Features / Bug Fixes / Documentation 等
- 包含提交者信息和 commit 链接

> **注意**：如果 commit message 不规范（如缺少 type 前缀），该 commit 会被归类到 "Other Changes" 或无法正确显示。请务必遵守规范！

### 五、发布验证

- [ ] [GitHub Actions](https://github.com/TLzh/paperworm/actions) 中 workflow 执行成功（绿色）
- [ ] [Releases 页面](https://github.com/TLzh/paperworm/releases) 出现新 Release，`.xpi` 附件正常
- [ ] **Release Notes 已自动生成**（检查分类是否正确）
- [ ] （可选）在 Zotero 中触发「检查更新」，确认自动更新提示出现

> **README 徽章说明**：`[![Latest Release](...)]` 是动态徽章，从 GitHub Release 自动读取，
> 无需手动修改。Release 创建后几分钟内（shields.io 缓存刷新）即显示新版本号。

---

## 自动更新机制

`manifest.json` 中的 `update_url` 指向：
```
https://github.com/TLzh/paperworm/releases/download/release/update.json
```

Zotero 定期拉取此文件，与本地版本比对，有新版本时提示用户更新。
用户无需手动下载，点击更新即可自动安装。已安装用户的设置不会丢失。

---

## 注意事项

- 不要先推 tag 再补提交 — 确保 `main` 分支已包含所有改动后再打 tag
- `addon/prefs.js` 含 API Key，已在 `.gitignore` 中排除，不会进入 Release source code
- GitHub Actions 所需的 `GITHUB_TOKEN` 由 GitHub 自动提供，无需手动配置
- **Commit message 规范是 Release Notes 自动生成的关键**，请务必遵守
