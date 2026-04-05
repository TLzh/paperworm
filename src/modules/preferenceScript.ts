// 偏好设置页面脚本
// 当用户打开 Zotero 偏好设置 > PaperWorm 时由 hooks.onPrefsEvent('load') 调用

import { config } from "../../package.json";
import { LLMManager } from "./llm/manager";

const ref = config.addonRef;

/** System Prompt 内置模板 */
const PROMPT_TEMPLATES: Record<string, string> = {
  academic: `You are a scholarly assistant helping to read and understand academic papers.
Answer questions concisely and accurately based on the paper content.
When the user asks about specific sections or terms, provide clear and detailed explanations.
Always cite the relevant part of the paper when possible.`,

  translate: `You are a professional academic translator.
Translate the provided text into Chinese, preserving technical terms and academic tone.
For key technical terms, optionally include the original English in parentheses.`,

  critical: `You are a critical reviewer analyzing an academic paper.
Evaluate the methodology, identify potential limitations, assess the validity of conclusions,
and highlight areas where reproducibility might be a concern.
Be constructive but rigorous in your analysis.`,

  notes: `You are a research note-taking assistant.
Help summarize key points from this paper in a structured format.
Extract: main contributions, methods used, key results, limitations, and future work.
Format your responses with clear headings and bullet points.`,
};

export function registerPrefsScripts(_window: Window) {
  if (!addon.data.prefs) {
    addon.data.prefs = { window: _window };
  } else {
    addon.data.prefs.window = _window;
  }
  initPrefsUI(_window);
  bindPrefsEvents(_window);
}

function initPrefsUI(win: Window) {
  const doc = win.document;

  // 根据当前保存的 provider，显示对应的配置区域
  const provider = Zotero.Prefs.get(
    `${config.prefsPrefix}.llm.provider`,
    true,
  ) as string ?? "openai";
  showProviderSection(doc, provider);

  // 同步 provider menulist 到当前值（XUL 有时不会自动更新）
  const providerList = doc.getElementById(`${ref}-provider`) as any;
  if (providerList) providerList.value = provider;
}

function bindPrefsEvents(win: Window) {
  const doc = win.document;

  // Provider 切换 → 显示对应配置区域
  doc.getElementById(`${ref}-provider`)
    ?.addEventListener("command", (e: Event) => {
      const value = (e.target as any).value as string;
      showProviderSection(doc, value);
    });

  // 应用模板按钮
  doc.getElementById(`${ref}-apply-template`)
    ?.addEventListener("command", () => {
      const templateList = doc.getElementById(`${ref}-prompt-template`) as any;
      const textarea = doc.getElementById(`${ref}-system-prompt`) as HTMLTextAreaElement;
      if (!templateList || !textarea) return;

      const content = PROMPT_TEMPLATES[templateList.value as string];
      if (content) {
        textarea.value = content;
        // 触发 preference 绑定更新
        textarea.dispatchEvent(new win.Event("change"));
      }
    });

  // 测试连接按钮
  doc.getElementById(`${ref}-test-btn`)
    ?.addEventListener("command", () => {
      testConnection(win);
    });
}

function showProviderSection(doc: Document, provider: string) {
  const providers = ["openai", "deepseek", "anthropic", "gemini", "ollama"];
  for (const p of providers) {
    const el = doc.getElementById(`${ref}-section-${p}`);
    if (el) el.setAttribute("hidden", p !== provider ? "true" : "false");
  }
}

function testConnection(win: Window) {
  const doc = win.document;
  const resultLabel = doc.getElementById(`${ref}-test-result`) as any;
  if (!resultLabel) return;

  resultLabel.setAttribute("value", "测试中...");

  // 使用真实 API 验证连通性
  LLMManager.getInstance()
    .buildProvider(
      LLMManager.getInstance().getActiveProviderName(),
    )
    .testConnection()
    .then((ok) => {
      resultLabel.setAttribute("value", ok ? "✓ 连接成功" : "✗ 连接失败，请检查 Key 或网络");
    })
    .catch((e: Error) => {
      resultLabel.setAttribute("value", `✗ 错误：${e.message}`);
    });
}
