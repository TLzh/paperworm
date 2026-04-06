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

**阶段**: v0.5.4 — Windows 网络请求修复（wfetch）

**已完成**:
- 创建文档体系（CLAUDE.md / PRD.md / architecture.md / devlog.md）
- 项目代码骨架初始化（基于 zotero-plugin-template）
- 偏好设置页面（LLM 服务配置 / 高级参数 / 系统提示词）
- 支持服务商：OpenAI、DeepSeek、Anthropic、Gemini、Ollama
- LLM Provider 接口 + 五个实现（含流式输出）
- LLMManager：从 prefs 读取配置，按需实例化 Provider（每次发送均重新读取，切换服务商/模型/参数即时生效）
- 偏好设置"测试连接"接入真实 API
- Reader 侧边聊天面板（注册、UI、流式渲染、快捷操作）
- **选中文字注入上下文**：mousedown 捕获阶段获取 PDF 选区，在发送时自动前置引用块
- **快捷操作按钮**：总结本文 / 解释段落 / 翻译 / 引用选中，均已对接选区捕获
- **PDF 全文提取**（三级策略，已验证，无需预建索引）：
  1. Zotero 全文索引（已索引条目直接读取）
  2. 触发即时索引后重试（`Zotero.Fulltext.indexItems`）
  3. 读取 Reader 已渲染的 `.textLayer` DOM 文字层（限定到目标 tab 的 reader window）
- 全文注入上下文上限 80000 字符（约 25 页），覆盖主流论文全文
- **已修复多 tab 全文读取错误**（v0.5.2）：策略 3 通过 `_tabs[i].data.itemID` + `getElementById(tabID).querySelector("browser.reader")` 精确定位目标 PDF 的 reader window，不再依赖私有属性或全局搜索
- **Markdown 渲染**：流式时纯文本，完成后用纯 DOM API（`createElement`/`createTextNode`）渲染
  - 支持：标题（H1–H6）、粗体、斜体、无序列表、代码块、行内代码、水平线
  - Gecko chrome 上下文限制：innerHTML / createContextualFragment / DOMParser+adoptNode 均被拦截，必须使用纯 DOM API
- **KaTeX 数学公式渲染**：
  - 块级：`$$...$$`（围栏或同行）和 `\[...\]`（LaTeX 风格，围栏或同行）均支持
  - 行内：`$...$` 和 `\(...\)`（LaTeX 风格）均支持
  - 使用 KaTeX MathML 输出 + 未挂载元素 innerHTML 技巧注入
  - Firefox 原生渲染 MathML，无需 KaTeX CSS / 字体文件
- 消息区自然展开（移除 max-height 限制）
- **会话持久化与多设备同步**（核心亮点功能）：
  - 每次 AI 响应完成后自动保存会话到 Zotero 子笔记，无需手动操作
  - 会话标题 = 首条用户消息前 25 字，便于识别
  - 每篇论文可有多个独立会话，通过「会话列表」按钮随时切换
  - 加载历史会话后 LLM 可继续看到完整上下文（API 无状态，历史 messages 数组直接传入）
  - Zotero 笔记随免费账号同步，多设备无缝接续阅读历史
  - 数据格式：Zotero child note，内嵌 JSON（v2）+ 人可读 HTML transcript
  - 向下兼容 v1 归档格式（旧版笔记可正常加载）
- **偏好设置体验优化**（v0.5.0）：
  - 高级参数提示统一三段式（范围·解释·推荐）：Temperature `(0–2，低=精准稳定 高=随机创意，推荐 0.1–0.5)`，最大 Token 数 `(100–32000，影响单次回复长度，推荐 2000–4000)`
  - 系统提示词新增内置模板：「开锁专家」（批判性论文解读）；新增「自定义（清空）」快捷选项
  - **用户自定义模板**：可将当前提示词以自定义名称保存，持久化到 Zotero prefs，支持加载和删除
  - 所有设置更改即时生效（下一条消息立刻使用新配置，无需重启）

**已知约束**:
- `.textLayer` 方案仅抓已渲染页（滚动过的页面）；一次性获取全部页面需先建立 Zotero 全文索引
- 会话笔记底部的 Base64 元数据块在 Zotero 笔记 UI 中可见（Zotero 过滤 `style`/`<script>`，`<details>` 不支持折叠），功能不受影响，已在 README 中说明
- 无笔记联动（待实现）

**已上线**:
- GitHub 仓库：[github.com/TLzh/paperworm](https://github.com/TLzh/paperworm)
- GitHub Actions 自动发布：push tag `v*` 即触发构建、生成 `update.json`、创建 Release
- Zotero 自动更新：已验证 v0.5.0 → v0.5.1 全链路正常

**待迭代**（按需求顺序推进）:
- 笔记联动（生成 / 追加笔记）
- 右键菜单快捷入口

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

## 重要约定

- 不要在 hooks.ts 里写业务逻辑，只做分发
- LLM Provider 必须支持流式输出（streaming）
- API Key 只存储在 Zotero prefs，永远不写入代码
- 每个阶段完成后更新本文件的"当前开发状态"
