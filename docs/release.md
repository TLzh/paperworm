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

### 四、Release Notes（由 Claude 通过 gh CLI 更新）

GitHub Actions 创建 Release 时不含描述文字（CI 自动生成的 commit 列表格式对用户不友好）。
**标准做法：CI 完成后，由 Claude 根据 CHANGELOG.md 生成用户友好的 Release Notes，通过 `gh release edit` 直接写入。**

**流程（无需手动复制粘贴）**：
1. 推送 tag → GitHub Actions 自动构建 `.xpi` 并创建空 Release
2. 等 Actions 绿灯（约 2 分钟）
3. 告诉 Claude："CI 完成了，帮我写 v0.X.Y 的 Release Notes"
4. Claude 从 CHANGELOG.md 提取本版本条目，生成中英文说明，执行：
   ```bash
   gh release edit vX.Y.Z --repo TLzh/paperworm --notes "..."
   ```
5. 打开 Releases 页面确认内容正确

**Release Notes 内容规范**：
- 用 `## What's New` 开头，重点功能用 `###` 分节
- 核心功能附使用步骤（How to use）
- 底部附 CHANGELOG.md 链接
- 语言：英文为主（面向开源用户）

### 五、发布验证

- [ ] [GitHub Actions](https://github.com/TLzh/paperworm/actions) 中 workflow 执行成功（绿色）
- [ ] [Releases 页面](https://github.com/TLzh/paperworm/releases) 出现新 Release，`.xpi` 附件正常
- [ ] **Release Notes 已填写**（通过 Claude + gh CLI 更新）
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
- Commit message 规范仍建议遵守（方便 git log 可读），但不再是 Release Notes 的生成依据
