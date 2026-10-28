# PaperWorm — 开发指南

## 项目概述

PaperWorm 是一个 Zotero 8 插件，定位为**论文阅读 AI 助手**。
用户在 Zotero 阅读 PDF 时，可以在侧边面板与 LLM 对话，
对当前论文提问、总结、解释段落、生成笔记等。

## 关键信息

- **插件 ID**: `paperworm@paperworm.dev`
- **Namespace / addonRef**: `paperworm`
- **Zotero 全局实例**: `Zotero.PaperWorm`
- **目标平台**: Zotero 7/8/9/10（兼容 6.999+；Zotero 10 底座仍为 Firefox 140 ESR，`strict_max_version: 10.0.*`）
- **构建工具**: zotero-plugin-scaffold + esbuild (target: firefox115)
- **主语言**: TypeScript
- **核心依赖**: zotero-plugin-toolkit ^5.x, zotero-types ^4.x

## 项目目录结构

```
PaperWorm/
├── DEVELOPMENT.md        ← 本文件
├── README.md
├── CHANGELOG.md
├── addon/                ← 插件静态资源
│   ├── bootstrap.js      ← Zotero 加载入口
│   ├── manifest.json     ← 插件清单
│   ├── prefs.js          ← 偏好设置默认值（不入 git）
│   └── content/          ← XHTML / CSS / 图标
├── src/                  ← TypeScript 源码
│   ├── index.ts          ← 入口，挂载到 Zotero.PaperWorm
│   ├── addon.ts          ← Addon 类，持有全局状态
│   ├── hooks.ts          ← 生命周期钩子分发
│   ├── modules/          ← 功能模块
│   │   ├── llm/          ← LLM 抽象层（Provider 接口 + 各厂商实现）
│   │   ├── paper/        ← PDF 内容提取
│   │   ├── chat/         ← 聊天逻辑与历史管理
│   │   └── ui/           ← UI 注册（面板、菜单等）
│   └── utils/            ← 工具函数
└── typings/              ← 全局类型声明
```

## 架构核心思路

### LLM 抽象层

所有 LLM 调用通过统一的 `LLMProvider` 接口，
业务代码不感知具体厂商，便于后续扩展。

### 内容提取策略

从 `Zotero.Reader` 获取当前打开的 PDF 条目，
优先使用用户选中文本，其次提取全文（上限 400,000 字符，约 120 页）。

### UI 策略

主界面在 Reader Pane 右侧侧边面板（`registerReaderItemPaneSection`），
设置界面在 Zotero 偏好设置中注册独立分页。

---

## ⚠️ 安全红线 — 每次开发必读

**API Key 绝对不能出现在任何版本控制或云端存储中。**

- Zotero prefs 以**明文**存储 API Key，`prefs.js` 文件不得进入 Git
- 代码中**禁止硬编码**任何 API Key，包括测试用的临时 Key
- 日志、注释、文档中**禁止出现**真实 Key 的任何片段
- `.gitignore` 必须包含：`.env`、`prefs.js`、`*.key`
- 在做任何 git 相关操作前，主动检查暂存内容是否含有凭证

违反此规则会导致用户的 API Key 永久泄露且无法撤回。

---

## ⚠️ PDF 全文提取陷阱 — 每次碰 extractor.ts 必读

### 多 tab 场景下禁止从主窗口全局搜索 `.textLayer`

`_findInFrames(Zotero.getMainWindow(), ...)` 会做深度优先搜索，
**总是返回第一个打开的 PDF tab 的 `.textLayer`**，与当前活跃 tab 无关。

**正确做法**：先定位目标 PDF 的 reader browser，再在其 contentWindow 内搜索：

```typescript
// 通过 _tabs[i].data.itemID 找到对应 tab
const tab = tabs._tabs.find(
  (t) => t.type === "reader" && t.data?.itemID === attachmentID,
);
// _tabContainer.id = tabID（Zotero 源码 reader.js 确认）
const tabCont = mainWin.document.getElementById(tab.id);
// _iframe = <browser class="reader">
const browser =
  tabCont.querySelector("browser.reader") ?? tabCont.querySelector("browser");
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

将 `<style>` 标签放在面板 wrapper div 内部（随内容一起注入），
不要尝试注入到 `doc.head`（XUL 文档的 CSS 作用域可能隔离）。

### 面板模板必须是严格合法的 XML（v0.9.1 事故）

reader 面板通过 `wrapper.innerHTML = \`模板\``注入，**Zotero 的 reader 文档按 XML 严格解析**（不是宽松 HTML）。任何 HTML 容错写法都会抛`NS_ERROR_DOM_SYNTAX_ERR`（"An invalid or illegal string was specified"），**且异常表现为整个面板空白**（v0.9.1 开发中 `<span ... hidden>` 裸布尔属性导致面板全空白，排查多轮才定位）。

必须遵守：

- **布尔属性必须带值**：`hidden="true"`（❌ `hidden`）、`disabled="true"`（❌ `disabled`）、`checked="true"`
- **void 元素必须自闭合**：`<br/>`、`<input ... />`、`<img ... />`
- **属性值必须加引号**（单双均可）
- 面板渲染失败时 `onRender` 的 catch 会把错误显示在面板中（`[PaperWorm] 面板初始化失败`）+ 落盘 `paperworm.debug.lastPanelError`；`getParamsBadgeText` 等模板插值已有独立降级，勿删除
- 新增模板标记后，立即在 Zotero 里重开面板验证一次（不能只跑 build）

---

## ⚠️ Zotero Prefs 开发陷阱 — 每次写设置相关代码必读

### `preference` 属性必须使用完整路径

Zotero 偏好设置面板通过 `preference` 属性绑定 UI 元素与 pref 存储。
**关键行为**（见 `refs/zotero-main/chrome/content/zotero/preferences/preferences.js`）：

```javascript
// Zotero 源码：preference 属性值原样使用（global=true）
let value = Zotero.Prefs.get(preference, true); // 读取时原样
Zotero.Prefs.set(preference, value, true); // 写入时原样
```

这意味着 `preference="llm.provider"` 会把值 write 到 Firefox prefs 中的字面路径 `llm.provider`，
而 TypeScript 代码通过 `Zotero.Prefs.get("extensions.zotero.paperworm.llm.provider", true)`
读取——**两条路径完全不同**，UI 修改的值永远对代码不可见。

**模型管理的特殊偏好设计**：
为了实现配置与使用的解耦，我们使用了两套偏好：

- `llm.<provider>.models`：存储该厂商的**模型列表**（逗号分隔的字符串），由设置页通过“获取模型”按钮维护。
- `llm.<provider>.model`：存储该厂商当前**激活的模型**，由主面板下拉菜单切换时更新。

**正确写法示例**：

```xml
<!-- ❌ 错误 — 写到 "llm.provider"，代码读不到 -->
<menulist preference="llm.provider" />

<!-- ✅ 正确 — 与代码读取路径一致 -->
<menulist preference="extensions.zotero.paperworm.llm.provider" />
```

**规则**：

- XHTML 中所有 `preference` 属性值必须以 `extensions.zotero.paperworm.` 开头
- TypeScript 中所有 `Zotero.Prefs.get/set` 调用必须使用 `${config.prefsPrefix}.xxx` 形式（`global=true`）
- 两者路径必须完全一致，否则 UI 与代码读写的是不同 pref

### LLM 网络请求：非流式用 `Zotero.HTTP.request()`，流式用 `fetch()`

Zotero 插件沙盒中有两种 HTTP 方式，用途不同：

| 场景                                       | 正确方式                              | 原因                                          |
| ------------------------------------------ | ------------------------------------- | --------------------------------------------- |
| 非流式请求（testConnection / chat）        | `Zotero.HTTP.request()` via `zhttp()` | 正确处理 Windows 代理、SSL、离线检测          |
| 流式请求（chatStream，SSE/ReadableStream） | `fetch()`                             | `Zotero.HTTP.request()` 不支持 ReadableStream |

```typescript
// ❌ 错误 — 非流式用 fetch()，在 Windows 可能失败
const res = await fetch(url, { headers, body });

// ✅ 正确 — 非流式用 zhttp()（封装 Zotero.HTTP.request）
const resp = await zhttp("POST", url, { headers, body, successCodes: [200] });
```

`zhttp()` 封装在 `src/modules/llm/provider.ts`，所有非流式调用均应使用它。

### 流式请求必须走 `fetchWithHeaderTimeout()` + `readStreamLines()`

裸 `fetch()` / `reader.read()` **没有任何超时**：连接停滞时 `onDone`/`onError` 永不触发，
UI 光标闪烁不止且发送按钮锁死（`pw-disabled`），只能靠切 tab 重渲染面板恢复。
`provider.ts` 提供的守护机制：

| 机制                                | 超时 | 说明                                                  |
| ----------------------------------- | ---- | ----------------------------------------------------- |
| `fetchWithHeaderTimeout(url, init)` | 120s | fetch 发出后未收到响应头即报错（`Promise.race` 实现） |
| `readStreamLines(reader, onLine)`   | 90s  | 流读取空闲看门狗；每收到新数据重置计时                |

新增 Provider 时**不要手写** buffer/decode/split 循环，只需实现各自的 `parseSSELine`
并接入 `readStreamLines`，参照 `openai.ts` 现有写法。

两个关键陷阱：

1. **`reader.cancel()` 不会让挂起的 `read()` reject**——按 Streams 规范它以 `{done: true}`
   正常收场。看门狗必须靠 `timedOut` 标志在循环结束后补检，否则连接停滞会被误判为
   正常完成（`readStreamLines` 已处理，勿在 Provider 内绕过它）。
2. **AbortController 在 Zotero chrome 特权上下文不可用**（经验记录见
   `mineru/client.ts` 头注释），所以超时中断一律用 `reader.cancel()` / Promise.race。

### 流式结束原因（finish_reason）约定

各家信号统一**规范化为 `"length"`** 后经 `onDone(finishReason)` 上报：

| Provider 原始值                                                                     | 规范化     |
| ----------------------------------------------------------------------------------- | ---------- |
| OpenAI 系（含 DeepSeek/Kimi/Qwen/OpenRouter/MiMo/MiniMax）`finish_reason: "length"` | `"length"` |
| Anthropic `message_delta.delta.stop_reason: "max_tokens"`                           | `"length"` |
| Gemini `candidates[0].finishReason: "MAX_TOKENS"`                                   | `"length"` |
| Ollama `done_reason: "length"`                                                      | `"length"` |

UI 层（`readerPanel.ts` 的 `send()`）只在 `finishReason === "length"` 时显示截断提示；
**截断但无提示** 即代表流被提前关闭或厂商侧问题——这是用户侧的诊断依据，勿破坏该语义。

### 推理档位约定（per-vendor，`llm.<provider>.reasoning` pref）

**设计哲学**：忠实厂商 > 统一抽象。推理档位是**厂商相关参数**，不做插件层统一近似映射——UI 档位表由各 Provider 的 `getReasoningLevels(model?)` 提供（`ReasoningLevel{value,label,short,hint}`），popover 按当前厂商**及其模型**动态渲染；pref 存**厂商原生枚举值**（`llm.<provider>.reasoning`，空 = 默认 = 不下发参数，永远最安全）。各 Provider 在 buildBody 中将原生值直接映射为官方参数。

**事实依据（不在本文件复制参数明细）**：运行时真相 = 各 Provider 的 `*_REASONING_LEVELS` 常量与 buildBody；调查档案（端点/模型矩阵/档位枚举/温度规则/订阅判定 + 核实日期）= 工作区 `docs/vendors.md`；用户向描述 = `docs/models.md`。改档位 → 改代码常量 → 同步 vendors.md 对应小节核实日期。

规则与陷阱：

- **档位表与映射同源**：改档位先改 Provider 内 `*_REASONING_LEVELS` 常量与 getReasoningLevels 分流，UI 自动跟随；不存在 UI 硬编码档位
- **按模型分流**：同厂商不同模型档位不同（kimi-k3 effort 三档 vs K2.x 开关；GLM-5.3 三档 vs 5.2 全档 vs 旧系开关；仅思考模型只剩默认档）——getReasoningLevels 的 model 参数必传当前模型
- **默认值是一片雷区**：DeepSeek/Kimi(月暗)/Qwen(3.5+)/GLM(5.2+) 默认思考开、MiMo 按模型不同、Gemini 按模型两端分布——`""` 档永远不下发参数，规避全部默认值假设
- **新增厂商必须先取得官方文档确认**，无文档返回空档位表（UI 显示"暂不支持"），宁可不生效，不可发未知参数；有的厂商非法枚举值直接 400（GLM-5.3 系、Kimi K3 传 thinking）——合法集合只能由档位表保证
- **temperature 硬约束在发送层拦截**（Kimi 全系剥离、GLM 钳制 (0,1]、OpenAI gpt-5/6 不发）+ popover 提示层告知；不要指望用户记住各家规则
- **思考流显示**：`onChunk(chunk, reasoningDelta?)` 双通道；UI 思考块（`.pw-thinking`）思考中滚动展示 → 首个正文 chunk 自动收起为摘要头（仅执行一次，**用时定格于思考结束时刻**；用户手动展开过则尊重）。**推理原文不落盘**，仅 `reasoningLen` 摘要随会话持久化（`LLMMessage.reasoningLen` 为 UI 元数据，**buildMessages 发送前必须剥离**，否则未知字段进入厂商请求体可能 400）
- **OpenAI 直连无推理原文**（Chat Completions 不透出思维链），思考块自动退化为不出现；DeepSeek/Kimi/Qwen/MiMo/GLM 走 `reasoning_content`、OpenRouter 走 `reasoning`、Gemini 走 thought parts
- 思考型模型推理耗尽全部 Max Tokens 时正文为空（`finish_reason="length"` + 空 content），UI 有专门诊断文案 + 思考块保留供查看推理进度，勿当作普通空响应处理

### OpenAI 系档位的运行时学习（v0.9.1）

OpenAI 模型太多且从 `/v1/models` 动态拉取，档位支持矩阵不可静态穷举。机制（`openai.ts` 的 helpers）：

- 400 错误消息自带 `Supported values are: 'low', ...` → `parseSupportedReasoningValues()` 解析
- 按 provider+model 缓存到 pref `cache.reasoning.<provider>.<model>`（模型名中的 `.` 替换为 `_`）
- `getReasoningLevels()` 按缓存过滤（默认档 `""` 永远保留）；`buildBody()` 发送前用 `isReasoningValueSupported()` 兜底降级（不下发不支持的值）
- 徽章：档位被过滤后不再显示残留值（回退为无后缀）
- 新厂商接入若出现同类"逐模型枚举差异"，优先复用该机制而不是维护静态矩阵

### ChatGPT 订阅通道（SIWC）开发约定（v0.9.1）

- Provider 名 `openai-siwc`；OAuth 核心在 `siwcAuth.ts`，推理在 `openaiResponses.ts`（Responses API 事件流）
- **回调监听不要用 `Zotero.Server`**：部分环境插件注册的端点不派发/不响应（浏览器访问空响应，而内置 connector 端点正常；Run JavaScript 直接调用却正常）。改用插件自建 loopback 监听（`nsIServerSocket`，23120–23125，SIWC 允许端口可变）；另有手动粘贴兜底（completeManual）
- 凭据存 prefs（与 API key 实践一致），永不写日志；reauth 标记生命周期：refresh 失败置位 → 刷新成功/登录成功清除 → 登出清除
- 通道限制：禁 temperature/top_p/max_output_tokens/system role（用 `instructions`）；`reasoning.effort` 可用；`reasoning.summary:"auto"` 已请求但**实测无 reasoning 事件**（OpenAI 不暴露原始 CoT；summary 需组织验证，订阅通道不适用）→ UI 显示诚实等待提示
- 监听器安全：loopback only、仅 GET、64KB 上限、state 校验、回调后 1.5s 自关（只关自己那个 server，防重关联赛）、onShutdown 清理
- 手动流程的 code_verifier 在内存 pending 中，10 分钟有效；重启 Zotero 后必须重新登录

---

## ⚠️ 截图捕获陷阱 — 每次碰 screenshot/视觉相关代码必读

### Zotero 主窗口是 XUL 文档，无法注入 HTML overlay

Zotero 的主窗口（`Zotero.getMainWindow()`）是 XUL 文档，`document.body === null`。
任何向 `mainWin.document.body` 插入元素的尝试都会静默失败（`appendChild` 到 null）。

**正确做法**：overlay 必须注入到 PDF viewer 的 HTML contentDocument，而不是主窗口。

定位路径（与全文提取的 reader window 定位相同，见上方"PDF 全文提取"章节）：

1. 通过 `Zotero_Tabs` 找到目标论文的 reader window
2. 用 `_findDocumentWithCanvases()` 递归遍历帧树，找到含 `<canvas>` 的 HTML 文档
3. 将 overlay 注入该文档的 `document.body`

```typescript
// ❌ 错误 — mainWin.document.body 是 null（XUL 文档）
mainWin.document.body.appendChild(overlay);

// ✅ 正确 — 注入 PDF viewer 的 HTML contentDocument
pdfDoc.body.appendChild(overlay);
```

### `ctx.drawWindow()` 在 Zotero 7 (Firefox 115+) 已移除

`CanvasRenderingContext2D.drawWindow()` 是 Gecko 特权 API，在 Firefox 115+ 已被移除。
即使在 chrome 特权上下文中调用，也会抛出 `TypeError: ctx.drawWindow is not a function`。

**正确做法**：直接从 PDF.js 渲染的 `<canvas>` 元素用 `drawImage()` 裁剪：

```typescript
// ❌ 错误 — Firefox 115+ 已移除
ctx.drawWindow(win, x, y, w, h, "white");

// ✅ 正确 — 从 PDF.js canvas 裁剪目标区域
const scale = canvas.width / canvas.getBoundingClientRect().width;
offscreen.getContext("2d").drawImage(
  canvas,
  (selX - canvasRect.left) * scale, // 源 x
  (selY - canvasRect.top) * scale, // 源 y
  selW * scale,
  selH * scale, // 源宽高
  0,
  0,
  selW * scale,
  selH * scale, // 目标
);
```

这个方案坐标系一致（overlay 和 canvas 都在同一 contentDocument 里），
`getBoundingClientRect()` 直接可用，无需额外偏移计算。

---

## 重要约定

- 不要在 `hooks.ts` 里写业务逻辑，只做分发
- LLM Provider 必须支持流式输出（streaming）
- API Key 只存储在 Zotero prefs，永远不写入代码
- 每次发版后更新 `CHANGELOG.md`
