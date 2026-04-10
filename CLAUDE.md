# PaperWorm — Claude 项目说明书

## 项目概述

PaperWorm 是一个 Zotero 8 插件，定位为**论文阅读 AI 助手**。
用户在 Zotero 阅读 PDF 时，可以在侧边面板与 LLM 对话，
对当前论文提问、总结、解释段落、生成笔记等。

## 关键信息

- **插件 ID**: `paperworm@paperworm.dev`
- **Namespace / addonRef**: `paperworm`
- **Zotero 全局实例**: `Zotero.PaperWorm`
- **目标平台**: Zotero 8（兼容 6.999+）
- **构建工具**: zotero-plugin-scaffold + esbuild (target: firefox115)
- **主语言**: TypeScript
- **核心依赖**: zotero-plugin-toolkit ^5.x, zotero-types ^4.x

## 项目目录结构

本仓库是工作区（workspace）的子目录，工作区结构如下：

```
workspace/
├── PaperWorm/                ← 本仓库（open-source plugin）
│   ├── CLAUDE.md             ← 本文件
│   ├── README.md
│   ├── addon/                ← 插件静态资源
│   │   ├── bootstrap.js      ← Zotero 加载入口
│   │   ├── manifest.json     ← 插件清单
│   │   ├── prefs.js          ← 偏好设置默认值（不入 git）
│   │   └── content/          ← XHTML / CSS / 图标
│   ├── src/                  ← TypeScript 源码
│   │   ├── index.ts          ← 入口，挂载到 Zotero.PaperWorm
│   │   ├── addon.ts          ← Addon 类，持有全局状态
│   │   ├── hooks.ts          ← 生命周期钩子分发
│   │   ├── modules/          ← 功能模块
│   │   │   ├── llm/          ← LLM 抽象层（Provider 接口 + 各厂商实现）
│   │   │   ├── paper/        ← PDF 内容提取
│   │   │   ├── chat/         ← 聊天逻辑与历史管理
│   │   │   └── ui/           ← UI 注册（面板、菜单等）
│   │   └── utils/            ← 工具函数
│   └── typings/              ← 全局类型声明
├── docs/                     ← 内部开发文档（不入 git）
├── refs/                     ← 参考资料
└── releases/                 ← 编译产物归档（.xpi）
```

## 架构核心思路

### LLM 抽象层
所有 LLM 调用通过统一的 `LLMProvider` 接口，
业务代码不感知具体厂商，便于后续扩展。

### 内容提取策略
从 `Zotero.Reader` 获取当前打开的 PDF 条目，
优先使用用户选中文本，其次提取全文（分块避免 token 超限）。

### UI 策略
主界面在 Reader Pane 右侧侧边面板（`registerReaderItemPaneSection`），
设置界面在 Zotero 偏好设置中注册独立分页。

## 当前开发状态

**阶段**: v0.6.0 — MinerU 精细提取支持 & 安全加固

**已完成**:
- 创建文档体系（CLAUDE.md / PRD.md / architecture.md / devlog.md）
- 项目代码骨架初始化（基于 zotero-plugin-template）
- 偏好设置页面（LLM 服务配置 / 高级参数 / 系统提示词）
- 支持服务商：OpenAI、DeepSeek、Anthropic、Gemini、Ollama、Kimi（月之暗面）、Qwen（通义千问）
- LLM Provider 接口 + 七个实现（含流式输出）
- LLMManager：从 prefs 读取配置，按需实例化 Provider（每次发送均重新读取，切换服务商/模型/参数即时生效）
- 偏好设置"测试连接"接入真实 API
- Reader 侧边聊天面板（注册、UI、流式渲染、快捷操作）
- **选中文字注入上下文**：mousedown 捕获阶段获取 PDF 选区，在发送时自动前置引用块
- **快捷操作按钮**：总结本文 / 解释段落 / 翻译 / 引用选中，均已对接选区捕获
- **PDF 全文提取**（四级策略）：
  1. MinerU 精细缓存（已提取的结构化文本）
  2. Zotero 全文索引（已索引条目直接读取）
  3. 触发即时索引后重试（`Zotero.Fulltext.indexItems`）
  4. 读取 Reader 已渲染的 `.textLayer` DOM 文字层（限定到目标 tab 的 reader window）
- **MinerU 精细提取**（v0.6.0 重磅功能）：
  - 集成 MinerU API 进行版面分析，智能识别表格、公式等结构化内容
  - 面板添加"⚡ 精细提取"按钮，一键提取结构化 Markdown
  - 提取结果缓存为 Zotero 子笔记，支持免费账号跨设备同步
  - 实时进度条显示上传、解析、下载各阶段进度
  - 并发保护防止重复点击，安全机制防范路径遍历攻击
- 全文注入上下文上限 80000 字符（约 25 页），覆盖主流论文全文
- **已修复多 tab 全文读取错误**（v0.5.2）：策略 4 通过 `_tabs[i].data.itemID` + `getElementById(tabID).querySelector("browser.reader")` 精确定位目标 PDF 的 reader window
- **Markdown 渲染**：流式时纯文本，完成后用纯 DOM API渲染
  - 支持：标题（H1–H6）、粗体、斜体、无序列表、代码块、行内代码、水平线、表格、引用块
- **KaTeX 数学公式渲染**：
  - 块级：`$$...$$` 和 `\[...\]` 均支持
  - 行内：`$...$` 和 `\(...\)` 均支持
- **会话持久化与多设备同步**（核心亮点功能）：
  - 每次 AI 响应完成后自动保存会话到 Zotero 子笔记
  - 会话标题 = 首条用户消息前 25 字
  - 每篇论文可有多个独立会话，通过「会话列表」按钮随时切换
  - Zotero 笔记随免费账号同步，多设备无缝接续
- **模型徽章实时刷新**（v0.5.15）
- **模型快速切换**（v0.5.16）

**安全加固**（v0.6.0）：
- 修复 ZIP 路径遍历漏洞，防止恶意 PDF 提取攻击
- 完善 HTML 转义，防范 XSS 注入
- 添加请求并发锁，防止资源滥用

**已上线**:
- GitHub 仓库：[github.com/TLzh/paperworm](https://github.com/TLzh/paperworm)
- GitHub Actions 自动发布：push tag `v*` 即触发构建
- Zotero 自动更新：已验证全链路正常

## ⚠️ 安全红线 — 每次开发必读

**API Key 绝对不能出现在任何版本控制或云端存储中。**

- Zotero prefs 以**明文**存储 API Key，`prefs.js` 文件不得进入 Git
- 代码中**禁止硬编码**任何 API Key，包括测试用的临时 Key
- 日志、注释、文档中**禁止出现**真实 Key 的任何片段
- `.gitignore` 必须包含：`.env`、`prefs.js`、`*.key`
- 在做任何 git 相关操作前，主动检查暂存内容是否含有凭证

违反此规则会导致用户的 API Key 永久泄露且无法撤回。

## ⚠️ PDF 全文提取陷阱 — 每次碰 extractor.ts 必读

### 多 tab 场景下禁止从主窗口全局搜索 `.textLayer`

`_findInFrames(Zotero.getMainWindow(), ...)` 会做深度优先搜索，
**总是返回第一个打开的 PDF tab 的 `.textLayer`**，与当前活跃 tab 无关。

**正确做法**：先定位目标 PDF 的 reader browser，再在其 contentWindow 内搜索：

```typescript
// 通过 _tabs[i].data.itemID 找到对应 tab
const tab = tabs._tabs.find(t => t.type === "reader" && t.data?.itemID === attachmentID);
// _tabContainer.id = tabID（Zotero 源码 reader.js 确认）
const tabCont = mainWin.document.getElementById(tab.id);
// _iframe = <browser class="reader">
const browser = tabCont.querySelector("browser.reader") ?? tabCont.querySelector("browser");
// 在正确的 window 内搜索，不会跨 tab 污染
return browser.contentWindow;
```

这是基于 Zotero 开源代码（`chrome/content/zotero/xpcom/reader.js`）确认的 DOM 结构，
不依赖任何可能为 undefined 的私有属性（`_iframeWindow`、`_window` 等均为可选字段）。

---

## ⚠️ Zotero XUL UI 开发陷阱 — 每次写 UI 必读

### Item Pane Section 中禁止使用 `<button>` 元素

在 `ItemPaneManager.registerSection` 的 `onRender` body 内，
**Zotero 的全局 CSS 会将所有 `<button>` 元素隐藏（`display: none`）**，
无论用 `innerHTML` 还是 `createElement` 创建，统统不可见。

**正确做法**：
```typescript
// ❌ 错误 — button 在 Item Pane body 里不可见
const btn = doc.createElement("button");

// ✅ 正确 — 用 div 模拟按钮
const btn = doc.createElement("div");
btn.setAttribute("role", "button");
btn.setAttribute("tabindex", "0");
btn.style.cursor = "pointer";
```

- `disabled` 状态用 CSS class（如 `.pw-disabled`）而非 `element.disabled`
- `<input type="button">` 同样不可用，统一改 div/span

### CSS 注入方式

将 `<style>` 标签放在面板 wrapper div 内部（随内容一起 innerHTML），
不要尝试注入到 `doc.head`（XUL 文档的 CSS 作用域可能隔离）。

## ⚠️ Zotero Prefs 开发陷阱 — 每次写设置相关代码必读

### `preference` 属性必须使用完整路径

Zotero 偏好设置面板通过 `preference` 属性绑定 UI 元素与 pref 存储。
**关键行为**（见 `refs/zotero-main/chrome/content/zotero/preferences/preferences.js`）：

```javascript
// Zotero 源码：preference 属性值原样使用（global=true）
let value = Zotero.Prefs.get(preference, true);    // 读取时原样
Zotero.Prefs.set(preference, value, true);          // 写入时原样
```

这意味着 `preference="llm.provider"` 会把值写到 Firefox prefs 中的字面路径 `llm.provider`，
而我们的 TypeScript 代码通过 `Zotero.Prefs.get("extensions.zotero.paperworm.llm.provider", true)`
读取——**两条路径完全不同**，UI 修改的值永远对代码不可见。

**正确写法**：

```xml
<!-- ❌ 错误 — 写到 "llm.provider"，代码读不到 -->
<menulist preference="llm.provider" />

<!-- ✅ 正确 — 与代码读取路径一致 -->
<menulist preference="extensions.zotero.paperworm.llm.provider" />
```

**历史教训**（v0.5.3 ~ v0.5.9）：
- 早期 `preference` 属性使用短路径，导致 UI 修改写到错误位置
- 代码一直从完整路径读取，始终拿到 prefs.js 的默认值
- 结果：用户配置的 API Key / Provider 被忽略，连接始终失败
- v0.5.10 将全部 14 个 `preference` 属性改为完整路径，彻底修复

**规则**：
- XHTML 中所有 `preference` 属性值必须以 `extensions.zotero.paperworm.` 开头
- TypeScript 中所有 `Zotero.Prefs.get/set` 调用必须使用 `${config.prefsPrefix}.xxx` 形式（`global=true`）
- 两者路径必须完全一致，否则 UI 与代码读写的是不同 pref

### LLM 网络请求：非流式用 `Zotero.HTTP.request()`，流式用 `fetch()`

Zotero 插件沙盒中有两种 HTTP 方式，用途不同：

| 场景 | 正确方式 | 原因 |
|------|---------|------|
| 非流式请求（testConnection / chat） | `Zotero.HTTP.request()` via `zhttp()` | 正确处理 Windows 代理、SSL、离线检测 |
| 流式请求（chatStream，SSE/ReadableStream） | `fetch()` | `Zotero.HTTP.request()` 不支持 ReadableStream |

```typescript
// ❌ 错误 — 非流式用 fetch()，在 Windows 可能失败
const res = await fetch(url, { headers, body });

// ✅ 正确 — 非流式用 zhttp()（封装 Zotero.HTTP.request）
const resp = await zhttp("POST", url, { headers, body, successCodes: [200] });
```

`zhttp()` 封装在 `src/modules/llm/provider.ts`，所有非流式调用均应使用它。

## 本地开发与测试

### 配置（已简化）

`.env` 已指向 default profile（有所有文献），无需额外配置。

### 开发流程

```bash
cd PaperWorm
make start     # 启动开发（热重载）
```

**注意**：开发前确保关闭日常 Zotero（释放 23119 端口）。

### 端口说明

- **端口**：23119（default profile 锁定）
- **Profile**：始终使用 default（有所有文献）
- **热加载**：代码保存后自动生效（无需重启）

### Git 安全规范

每次 commit 前必须确认：

```bash
git diff --staged   # 扫一眼暂存内容，确认无敏感文件
git status --short  # 确认无应被忽略的文件出现在列表
```

**绝对不能进 git 的文件：**

| 文件 | 原因 |
|------|------|
| `addon/prefs.js` | 含 API Key 明文 |
| `.env` | 含本地路径，习惯上不提交 |
| `*.key`、`.env.*` | 潜在凭证 |

三者均已在 `.gitignore`，但每次操作前仍需肉眼确认。

---

## 发版流程规范

### 日常开发（不发版）

1. 正常提交代码（`git commit`）
2. 将改动记录到 `CHANGELOG.md` 的 `[Unreleased]` 区块
   - `Added` — 新功能
   - `Fixed` — Bug 修复
   - `Changed` — 行为变更 / 重构
   - `Removed` — 删除功能
3. **不修改 `package.json` 版本号**，不打 tag

### 发版时机（满足任一条件）

- 有用户可感知的重要新功能或 Bug 修复
- `[Unreleased]` 积累了足够多的改动（大致 5+ 条有意义的变更）
- 外部反馈促使需要尽快推送

### 发版步骤

```bash
# 1. 确认 CHANGELOG.md [Unreleased] 内容完整
# 2. 将 [Unreleased] 重命名为新版本，加上日期
#    例：## [0.5.14] - 2026-04-20
# 3. 在顶部新增空的 [Unreleased] 区块（为下次准备）
# 4. 更新 package.json 版本号
# 5. 更新 CLAUDE.md "当前开发状态"中的阶段描述
# 6. 构建验证
npm run build
# 7. 提交（包含 CHANGELOG + package.json）
git add CHANGELOG.md package.json CLAUDE.md
git commit -m "release: v0.x.y — <一句话摘要>"
# 8. 打 tag 并推送（触发 GitHub Actions 自动构建 + 发布）
git tag v0.x.y
git push origin main && git push origin v0.x.y
```

GitHub Actions 会自动：构建 XPI → 上传 Release Assets → 用 changelogen 生成 Release Notes。

### 注意

- `prefs.js` 永远不入 Git（已在 `.gitignore`）
- 发版前检查 `git diff --stat` 确认无敏感文件暂存
- Release Notes 由 CI 自动生成；如需补充说明，发版后手动编辑 GitHub Release 页面

### 待处理：GitHub Actions Node.js 20 弃用（截止 2026-06-02）

GitHub 已宣布 Node.js 20 运行时将于 **2026 年 6 月 2 日**起强制切换至 Node.js 24，
届时 `.github/workflows/release.yml` 中的 `actions/checkout@v4` 和 `actions/setup-node@v4`
可能无法正常工作。

**处理时机**：2026 年 5 月，确认 GitHub 已发布兼容 Node.js 24 的新版本后再升级，
避免现在盲目猜版本号。升级方式：

```yaml
# 将 release.yml 中的两行改为新版本，例如（版本号需届时确认）：
- uses: actions/checkout@v5
- uses: actions/setup-node@v5
```

### ⚠️ CI 发版踩坑记录

#### 坑 1：`zotero-plugin release` 在 CI 里不传版本号会失败（v0.5.14）

**现象**：CI `Build & Release` 步骤以 exit code 1 失败，日志无明显错误信息。

**根本原因**：`zotero-plugin release` 内部使用 `bumpp` 做版本管理。不传版本号时，
bumpp 会尝试交互式询问下一个版本号，或自动 bump 后执行 `git push`。
而 CI 通过 tag 触发时，`actions/checkout` 检出的是 **detached HEAD** 状态，
`git push` 必然失败，导致整个 job 退出码为 1。

**修复**：在 CI 的 release 命令中显式传入版本号，scaffold 检测到 `new version == old version` 时会跳过 bumpp 的 commit/tag/push：

```yaml
run: npm run release -- "${GITHUB_REF_NAME#v}" --yes
#                        ^^^^^^^^^^^^^^^^^^^^^ 去掉 v 前缀，如 v0.5.14 → 0.5.14
#                                               ^^^^^ 跳过 bumpp 的交互确认
```

---

#### 坑 2：`gh release edit` 不支持 `--generate-notes` flag（v0.5.14）

**现象**：CI `Generate release notes` 步骤报 `unknown flag: --generate-notes`。

**根本原因**：`--generate-notes` 只在 `gh release create` 中有效，`gh release edit` 不支持该 flag。

**修复**：直接删除该步骤。`zotero-plugin release` 已通过 changelogen 自动生成 Release Notes，无需额外步骤覆盖。如需手动补充，发版后在 GitHub Release 页面直接编辑即可。

## 重要约定

- 不要在 hooks.ts 里写业务逻辑，只做分发
- LLM Provider 必须支持流式输出（streaming）
- API Key 只存储在 Zotero prefs，永远不写入代码
- 每个阶段完成后更新本文件的"当前开发状态"和 CHANGELOG.md
