# PaperWorm

[![Latest Release](https://img.shields.io/github/v/release/TLzh/paperworm)](https://github.com/TLzh/paperworm/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> AI-powered paper reading assistant for Zotero

PaperWorm adds an AI chat panel to Zotero's PDF reader. While reading a paper, you can ask questions, request summaries, quote selected passages as context, and have a conversation — all in context with the paper you are currently reading.

---

## Features

- **Contextual chat** — the paper's full text, title, authors, year, and abstract are automatically included in every conversation; no manual indexing required for text-based PDFs
- **Streaming responses** — AI replies appear word by word in real time
- **Quick actions** — one-click to summarize the paper, or select text from the PDF as context for your questions
- **Multi-provider** — supports OpenAI, DeepSeek, Anthropic (Claude), Google Gemini, Kimi (Moonshot), Qwen (Alibaba Cloud), OpenRouter, Xiaomi MiMo, MiniMax, and Ollama (local). See [Model Guide](docs/models.md) for details
- **Persistent sessions with cross-device sync** — every conversation is automatically saved as a Zotero child note attached to the paper; sessions survive Zotero restarts and sync to other devices via your free Zotero account
- **Multiple sessions per paper** — start new conversations and switch between them via the **Session List** view
- **Rich text rendering** — Markdown (headings, bold, lists, code blocks) and LaTeX math (via KaTeX MathML) rendered in AI responses
- **Precise layout extraction (MinerU)** — optional layout-aware text extraction using [MinerU](https://github.com/opendatalab/mineru) to better handle tables, formulas, and structured content
- **Multimodal screenshot analysis** — drag to draw a rectangle over any figure, chart, or equation in the PDF; the captured region is attached to your next message and analyzed by a vision-capable model

## Requirements

- Zotero 7, 8, or 9 (`strict_min_version: 6.999`)
- An API key for at least one supported LLM provider (or a local Ollama instance)

## Installation

1. Download the latest `.xpi` file from [Releases](https://github.com/TLzh/paperworm/releases)
2. In Zotero, open **Tools → Add-ons**
3. Click the gear icon → **Install Add-on From File…**
4. Select the downloaded `.xpi`
5. Restart Zotero when prompted

## Setup

1. Open **Edit → Settings → PaperWorm** (or **Zotero → Settings** on macOS)
2. Select your LLM provider and enter your API key
3. Click **Test Connection** to verify
4. Click **Fetch Models** to automatically populate the available models for this provider
5. Open any PDF in Zotero's reader — the PaperWorm panel will appear in the right sidebar. You can now switch between the fetched models directly in the panel.

### Precise Layout Extraction (Optional)

PaperWorm supports enhanced text extraction using [MinerU](https://github.com/opendatalab/mineru), which analyzes document layout to better extract tables, formulas, and structured content from academic papers.

To enable this feature:

1. Go to [mineru.net](https://mineru.net) and create a free account
2. Obtain your API token from the dashboard
3. Open **Edit → Settings → PaperWorm** and enter your MinerU API Token
4. Click **Test Connection** to verify
5. When reading a paper in Zotero, click the **⚡ Fine Extraction** button in the PaperWorm panel to extract structured text
6. The extracted content will be cached as a Zotero note and used for subsequent conversations with this paper

**Note**: The cached content syncs across devices via your Zotero account. Once extracted, the structured text is available on all your devices without re-extraction.

### Multimodal Screenshot Analysis (Optional)

PaperWorm can analyze figures, charts, equations, and any visible region of a PDF by capturing a screenshot and sending it to a vision-capable LLM.

**How to use:**

1. While reading a PDF, click the **框选区域** button in the PaperWorm panel toolbar
2. The cursor changes to a crosshair — drag to select the region you want to capture
3. A thumbnail chip appears above the input box showing your screenshot
4. Type your question (or leave it blank) and press Send
5. The AI will receive both the screenshot and your text

**Configuring the vision assistant model:**

The vision assistant runs as a separate LLM call, independent of your main chat model. To configure it:

1. Open **Edit → Settings → PaperWorm**
2. Scroll to the **视觉辅助模型** (Vision Assistant Model) section
3. Select a provider and enter the vision model name (e.g. `kimi-k2.6` for Kimi)
4. The vision assistant uses the same API key as the selected provider — no extra key needed

**Recommended vision models:**

| Provider        | Model       | Notes                                                        |
| --------------- | ----------- | ------------------------------------------------------------ |
| Kimi (Moonshot) | `kimi-k2.6` | Supports native vision; API key shared with Kimi chat config |

**Notes:**

- If no vision assistant is configured, the screenshot is still described as "视觉模型未配置" and the message is sent with that placeholder — the main model will acknowledge it but cannot see the image
- Screenshot descriptions are cached for the session: the same image region sent multiple times only calls the vision model once
- Screenshot data stays in memory only; stored session notes use `[截图 📷]` as a placeholder instead of the raw image

## Supported Providers

| Provider              | Recommended Model                 | Notes                                                                                                              |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| OpenAI                | `gpt-5.4`                         | Requires API key. See [OpenAI Model Guide](#openai-model-guide) below                                              |
| DeepSeek              | `deepseek-v4-pro`                 | Requires API key. Supports thinking mode and tool calling                                                          |
| Anthropic             | `claude-sonnet-4-6`               | Requires API key. See [Claude Model Guide](#claude-model-guide) below                                              |
| Google Gemini         | `gemini-3-flash-preview` (free)   | Recommended for most tasks; free tier available. See [Gemini Model Guide](#gemini-model-guide) below               |
| Kimi (Moonshot)       | `kimi-k2.6`                       | Requires API key from [platform.moonshot.cn](https://platform.moonshot.cn)                                         |
| Alibaba Cloud Bailian | `qwen3.6-max`                     | Model aggregation platform; requires API key from [bailian.console.aliyun.com](https://bailian.console.aliyun.com) |
| OpenRouter            | any model (e.g. `openai/gpt-4.1`) | Access hundreds of models via a single API key from [openrouter.ai](https://openrouter.ai)                         |
| Xiaomi MiMo           | `mimo-v2-pro`                     | Requires API key from [platform.xiaomimimo.com](https://platform.xiaomimimo.com)                                   |
| MiniMax               | `MiniMax-M2.7`                    | Requires API key from [platform.minimaxi.com](https://platform.minimaxi.com)                                       |
| Ollama                | any local model                   | No API key needed; set base URL (default: `http://localhost:11434`)                                                |

## Switching Providers Mid-Conversation

Every setting — provider, model, API key, temperature, max tokens, and system prompt — is read fresh on each message send. There is no restart or reload required.

This means you can switch providers or models at any point during a conversation. The next message will be sent to the new provider, while the full conversation history remains intact and is passed along as context.

Each provider's API key and model are stored independently, so switching between providers never overwrites your other configurations.

---

## Gemini Model Guide

Google Gemini offers a wide range of models through the Gemini API. Below is a guide to help you choose the right model for paper reading tasks.

### Current Generation Models (Recommended)

**Gemini 3 Series** (Preview status - latest generation)

| Model                     | API Identifier                  | Best For                              | Free Tier    |
| ------------------------- | ------------------------------- | ------------------------------------- | ------------ |
| **Gemini 3 Flash**        | `gemini-3-flash-preview`        | General paper reading, fast responses | ✅ Free      |
| **Gemini 3.1 Pro**        | `gemini-3.1-pro-preview`        | Complex reasoning, detailed analysis  | ❌ Paid only |
| **Gemini 3.1 Flash-Lite** | `gemini-3.1-flash-lite-preview` | High-volume, cost-effective tasks     | ✅ Free      |

**Gemini 2.5 Series** (Stable release)

| Model                     | API Identifier                 | Best For                       | Free Tier    |
| ------------------------- | ------------------------------ | ------------------------------ | ------------ |
| **Gemini 2.5 Flash**      | `gemini-2.5-flash`             | Balanced performance and speed | ✅ Free      |
| **Gemini 2.5 Flash-Lite** | `gemini-2.5-flash-lite`        | Most cost-effective option     | ✅ Free      |
| **Gemini 2.5 Pro**        | `gemini-2.5-pro-preview-03-25` | Maximum reasoning capability   | ❌ Paid only |

### Model Naming Guide

Gemini model names follow this pattern:

```
gemini-{major}.{minor}-{variant}-{status}
```

Examples:

- `gemini-3-flash-preview` — Gemini 3 Flash, preview release
- `gemini-3.1-pro-preview` — Gemini 3.1 Pro, preview release
- `gemini-2.5-flash` — Gemini 2.5 Flash, stable release

### Recommendations for Paper Reading

1. **For most users**: Use `gemini-3-flash-preview` (free, fast, capable)
2. **For complex analysis**: Use `gemini-3.1-pro-preview` (best reasoning)
3. **For high-volume reading**: Use `gemini-3.1-flash-lite-preview` (most economical)
4. **For stable production**: Use `gemini-2.5-flash` (non-preview, reliable)

### Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key and paste it into PaperWorm settings

**Note**: The free tier includes generous rate limits for Flash and Flash-Lite models. Pro models require a paid plan.

---

## OpenAI Model Guide

OpenAI's GPT models are state-of-the-art large language models capable of understanding and generating natural language.

### Latest Generation Models (GPT-5.4 Series)

| Model            | API Identifier | Best For                             | Cost     |
| ---------------- | -------------- | ------------------------------------ | -------- |
| **GPT-5.4**      | `gpt-5.4`      | Complex reasoning, coding, analysis  | Standard |
| **GPT-5.4 Mini** | `gpt-5.4-mini` | Balanced performance and efficiency  | Lower    |
| **GPT-5.4 Nano** | `gpt-5.4-nano` | Simple tasks, high-volume processing | Lowest   |

### Previous Generation (Still Supported)

| Model           | API Identifier | Best For                         |
| --------------- | -------------- | -------------------------------- |
| **GPT-4o**      | `gpt-4o`       | Multimodal tasks (text + vision) |
| **GPT-4o Mini** | `gpt-4o-mini`  | Cost-effective general tasks     |

### Recommendations for Paper Reading

1. **For most users**: Use `gpt-5.4` (flagship model with best reasoning)
2. **For cost-conscious users**: Use `gpt-5.4-mini` (good balance of quality and cost)
3. **For quick summaries**: Use `gpt-5.4-nano` (fastest, most economical)

### Getting an OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or sign in to your account
3. Navigate to **API Keys** in the left sidebar
4. Click **Create new secret key**
5. Copy the key and paste it into PaperWorm settings

**Note**: OpenAI requires a paid account with available credits. New accounts may receive free trial credits.

---

## Claude Model Guide

Anthropic's Claude models are designed for high performance across language, reasoning, analysis, and coding tasks.

### Latest Generation Models

| Model                 | Best For                                    | Speed    | Intelligence  |
| --------------------- | ------------------------------------------- | -------- | ------------- |
| **Claude Opus 4.6**   | Complex analysis, coding, professional work | Standard | Highest       |
| **Claude Sonnet 4.6** | General paper reading, balanced performance | Fast     | High          |
| **Claude Haiku 4.5**  | Quick summaries, high-volume processing     | Fastest  | Near-frontier |

### Model Naming

Claude model names follow this pattern:

```
claude-{variant}-{version}
```

- **Opus**: Most intelligent, best for complex reasoning and coding
- **Sonnet**: Balanced intelligence and speed, good for most tasks
- **Haiku**: Fastest, most cost-effective for simple tasks

### Recommendations for Paper Reading

1. **For most users**: Use `claude-sonnet-4-6` (best balance of quality and speed)
2. **For deep analysis**: Use `claude-opus-4-7` (maximum reasoning capability)
3. **For quick summaries**: Use `claude-haiku-4-5` (fastest, most economical)

### Getting a Claude API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or sign in to your account
3. Navigate to **API Keys** section
4. Click **Create Key** and copy it
5. Paste the key into PaperWorm settings

## Full-Text Context

PaperWorm automatically injects the paper's full text into every conversation so the AI can answer detailed questions about the content.

### How text extraction works

PaperWorm uses multiple strategies in order, stopping at the first that succeeds:

1. **MinerU precise cache** — if you have previously performed fine extraction on this paper, the structured text (with proper handling of tables and formulas) is used immediately
2. **Zotero full-text index** — if the paper has already been indexed by Zotero, the cached text is used immediately
3. **On-demand indexing** — if not yet indexed, PaperWorm triggers Zotero's built-in PDF indexer (`pdftotext`) and reads the result; this is automatic and requires no user action
4. **Rendered page text** — if indexing fails or is unavailable, PaperWorm reads the text directly from the PDF viewer's rendered pages (`.textLayer` DOM elements)

**You do not need to manually pre-index papers.** Strategy 2 handles indexing automatically on first use.

### Limitations

- **Scanned / image-only PDFs** (no OCR text layer): none of the four strategies can extract text. The AI will work from the title, authors, and abstract only.
- **Strategy 4 coverage**: only pages that have been rendered in the viewer (i.e., pages you have scrolled to) are available. For complete coverage of long papers, strategies 1-3 (which read the full file) are preferable — they are attempted first.
- **Character limit**: up to 400,000 characters (~120 pages) of full text are injected per message.

---

## Session Storage

PaperWorm stores each conversation as a **Zotero child note** attached to the paper item. This has two benefits:

1. **Persistence** — sessions survive Zotero restarts (unlike in-memory history)
2. **Free cross-device sync** — Zotero notes are item metadata and sync automatically with a free Zotero account, with no file storage subscription required

### Note format

Each session note contains:

- A human-readable transcript (`用户` / `AI` turns)
- A machine-readable metadata block used by PaperWorm to restore the session

The metadata block appears at the bottom of the note under a `会话元数据` label as a Base64-encoded JSON string. **This is intentional and expected** — it is how PaperWorm stores the conversation data for reloading.

> If you open a PaperWorm session note directly in Zotero's note editor, you will see this Base64 text at the bottom. You can ignore it. Do not edit or delete it manually, as doing so will prevent PaperWorm from loading that session.

Session notes are titled `PaperWorm · <first message>` and are listed under the paper in Zotero's item tree.

---

## Security

API keys are stored in Zotero's local preferences file (`prefs.js`) in plain text, which is standard practice for Zotero plugins. This file is excluded from version control via `.gitignore`.

**Never share your Zotero profile directory or commit `prefs.js` to any repository.**

## Development

### Prerequisites

- Node.js 18+ (tested with v22)
- npm

### Build

```bash
npm install
npm run build
```

The built `.xpi` is output to `.scaffold/build/`.

### Project Structure

```
PaperWorm/
├── addon/                  Static plugin assets
│   ├── bootstrap.js        Zotero entry point
│   ├── manifest.json       Plugin manifest
│   ├── content/            XHTML UI + icons
│   └── locale/             FTL localization (en-US, zh-CN)
├── src/                    TypeScript source
│   ├── index.ts            Entry point
│   ├── hooks.ts            Lifecycle hooks
│   └── modules/
│       ├── llm/            LLM provider abstraction + implementations
│       ├── chat/           Chat history management
│       ├── paper/          Paper metadata extraction
│       └── ui/             Reader panel UI
├── docs/                   Project documentation
└── typings/                Global type declarations
```

### Adding a New LLM Provider

1. Create `src/modules/llm/<name>.ts` implementing the `LLMProvider` interface (skip if the provider is OpenAI-compatible — reuse `OpenAIProvider` with a different `baseUrl`)
2. Register it in `src/modules/llm/manager.ts` — add to `ProviderName` type and `buildProvider()` switch
3. Add the corresponding preference fields in `addon/prefs.js` and `addon/content/preferences.xhtml` (use full pref paths: `extensions.zotero.paperworm.llm.<name>.*`)
4. Add the provider name to the `providers` array in `src/modules/preferenceScript.ts` → `showProviderSection()`

The `LLMProvider` interface requires three methods:

```typescript
interface LLMProvider {
  readonly name: string;
  chat(options: LLMRequestOptions): Promise<string>;
  chatStream(options, onChunk, onDone, onError): Promise<void>;
  testConnection(): Promise<boolean>;
}
```

## Acknowledgments

- [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template) by [@windingwind](https://github.com/windingwind) — project scaffold this plugin is based on
- [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit) by [@windingwind](https://github.com/windingwind) — Zotero plugin utility library
- [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold) by [@northword](https://github.com/northword) — build toolchain
- [KaTeX](https://katex.org) — math formula rendering
- [MinerU](https://github.com/opendatalab/mineru) by [OpenDataLab](https://github.com/opendatalab) — free, non-commercial layout-aware PDF text extraction service
- [HermesAgent](https://github.com/NousResearch/hermes-agent) by [NousResearch](https://github.com/NousResearch) — the vision routing strategy (dedicated vision LLM → text description → main model injection) was inspired by HermesAgent's multimodal architecture

## License

MIT
