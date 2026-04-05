# PaperWorm

> AI-powered paper reading assistant for Zotero

PaperWorm adds an AI chat panel to Zotero's PDF reader. While reading a paper, you can ask questions, request summaries, translate passages, and have a conversation — all in context with the paper you are currently reading.

---

## Features

- **Contextual chat** — the paper's title, authors, year, and abstract are automatically included in every conversation
- **Streaming responses** — AI replies appear word by word in real time
- **Quick actions** — one-click prompts to summarize the paper, explain a paragraph, or translate text
- **Multi-provider** — supports OpenAI, DeepSeek, Anthropic (Claude), Google Gemini, and Ollama (local)
- **Persistent sessions with cross-device sync** — every conversation is automatically saved as a Zotero child note attached to the paper; sessions survive Zotero restarts and sync to other devices via your free Zotero account
- **Multiple sessions per paper** — start new conversations and switch between them via the **Session List** view
- **Rich text rendering** — Markdown (headings, bold, lists, code blocks) and LaTeX math (via KaTeX MathML) rendered in AI responses

## Requirements

- Zotero 7 or 8 (`strict_min_version: 6.999`)
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
4. Open any PDF in Zotero's reader — the PaperWorm panel will appear in the right sidebar

## Supported Providers

| Provider | Recommended Model | Notes |
|---|---|---|
| OpenAI | `gpt-4o` | Requires API key |
| DeepSeek | `deepseek-chat` | Requires API key |
| Anthropic | `claude-sonnet-4-5` | Requires API key |
| Google Gemini | `gemini-2.0-flash` | Requires API key |
| Ollama | any local model | No API key needed; set base URL (default: `http://localhost:11434`) |

## Switching Providers Mid-Conversation

Every setting — provider, model, API key, temperature, max tokens, and system prompt — is read fresh on each message send. There is no restart or reload required.

This means you can switch providers or models at any point during a conversation. The next message will be sent to the new provider, while the full conversation history remains intact and is passed along as context.

Each provider's API key and model are stored independently, so switching between providers never overwrites your other configurations.

## Session Storage

PaperWorm stores each conversation as a **Zotero child note** attached to the paper item. This has two benefits:

1. **Persistence** — sessions survive Zotero restarts (unlike in-memory history)
2. **Free cross-device sync** — Zotero notes are item metadata and sync automatically with a free Zotero account, with no file storage subscription required

### Note format

Each session note contains:
- A human-readable transcript (`用户` / `AI` turns)
- A machine-readable metadata block used by PaperWorm to restore the session

The metadata block appears at the bottom of the note as a collapsed `▶ 会话元数据` section containing a Base64-encoded JSON string. **This is intentional and expected** — it is how PaperWorm stores the conversation data for reloading.

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

1. Create `src/modules/llm/<name>.ts` implementing the `LLMProvider` interface
2. Register it in `src/modules/llm/manager.ts`
3. Add the corresponding preference fields in `addon/prefs.js` and `addon/content/preferences.xhtml`

The `LLMProvider` interface requires three methods:

```typescript
interface LLMProvider {
  readonly name: string;
  chat(options: LLMRequestOptions): Promise<string>;
  chatStream(options, onChunk, onDone, onError): Promise<void>;
  testConnection(): Promise<boolean>;
}
```

## License

MIT
