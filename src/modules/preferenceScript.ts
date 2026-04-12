// 偏好设置页面脚本
// 当用户打开 Zotero 偏好设置 > PaperWorm 时由 hooks.onPrefsEvent('load') 调用

import { config } from "../../package.json";
import { LLMManager } from "./llm/manager";
import { MinerUTestClient } from "./paper/strategies/mineru/testClient";

const ref = config.addonRef;

/** System Prompt 内置模板 */
const PROMPT_TEMPLATES: Record<string, string> = {
  unlocker: `你是一名'开锁专家'（The Unlocker），地球上知识最渊博的论文领读导师。你的使命是打破学术论文华丽外衣下的平庸，识别那些仅仅为了满足KPI而产生的伪装，并引导用户发现知识的真谛。



目的与目标：



* 深度剖析论文逻辑：不盲从论文作者的结论，通过你海量的基础知识与领域知识，识别论文中论据薄弱或站不住脚的地方。

* 还原知识本貌：拆解论文脉络，用清晰且符合逻辑的方式重述核心内容，避免'SOTA结果'和'标准结构'带来的盲目引导。

* 辨识论文价值：区分'KPI产物'与真正的学术珍珠，对论文质量进行客观、严厉且准确的评估。



行为准则：



1) 深度质询与分析：

a) 始终对论文的每一句话保持审慎。不要简单总结论文结构，而是要挖掘其底层的逻辑基础。

b) 检查论文的'地基'。识别那些看起来坚实（如复杂的公式、精美的图表）但逻辑松散的部分。

c) 利用你掌握的全球知识库，比对论文陈述与已知事实、定理的一致性。



2) 拒绝'鹦鹉学舌'：

a) 严禁直接复制粘贴论文原文或生成模版化的思维导图。

b) 必须用你自己的逻辑语言重新组织词语、公式和论据。

c) 如果论文的论据是正确的，请用更清晰、更本质的逻辑链条进行重述。



3) 导师式的引导：

a) 采取一步步拆解的方式。像伟大的导师一样，带领用户从字里行间走向知识的本质（'走出洞穴'）。

b) 对待用户需毫无保留地分享洞察，态度既要有学者的奉献精神，也要有批判者的锋芒。



语气与风格：



* 睿智且具批判性：言语中透露出对真理的追求和对伪学术的蔑视。

* 逻辑严密：每一句回答都必须经得起推敲，展现极高的智力水平。

* 深刻且富有启发性：不仅解释'是什么'，更要解释'为什么'以及'哪里有问题'。`,

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

// ── 用户模板持久化 ──────────────────────────────────────────────────────────

interface UserTemplate {
  name: string;
  content: string;
}

function loadUserTemplates(): UserTemplate[] {
  try {
    const raw = Zotero.Prefs.get(`${config.prefsPrefix}.systemPrompt.userTemplates`, true) as string;
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUserTemplates(templates: UserTemplate[]): void {
  Zotero.Prefs.set(
    `${config.prefsPrefix}.systemPrompt.userTemplates`,
    JSON.stringify(templates),
    true,
  );
}

function rebuildUserMenuItems(doc: Document): void {
  const menupopup = doc
    .getElementById(`${ref}-prompt-template`)
    ?.querySelector("menupopup");
  const sep = doc.getElementById(`${ref}-user-template-sep`);
  if (!menupopup || !sep) return;

  // 移除旧的用户模板 menuitem
  const toRemove = Array.from(menupopup.querySelectorAll("[data-user-template]"));
  for (const el of toRemove) (el as Element).remove();

  const templates = loadUserTemplates();
  if (templates.length === 0) {
    sep.setAttribute("hidden", "true");
    return;
  }

  sep.setAttribute("hidden", "false");
  templates.forEach((tpl, i) => {
    const item = doc.createElementNS(
      "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      "menuitem",
    ) as Element;
    item.setAttribute("value", `user::${i}`);
    item.setAttribute("label", tpl.name);
    item.setAttribute("data-user-template", "true");
    menupopup.appendChild(item);
  });
}

// ── 主入口 ──────────────────────────────────────────────────────────────────

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

  // 初始化用户模板列表
  rebuildUserMenuItems(doc);
}

function bindPrefsEvents(win: Window) {
  const doc = win.document;

  // Provider 切换 → 显示对应配置区域
  doc.getElementById(`${ref}-provider`)
    ?.addEventListener("command", (e: Event) => {
      const value = (e.target as any).value as string;
      showProviderSection(doc, value);
    });

  // 模板下拉框切换 → 控制删除按钮 enabled/disabled
  doc.getElementById(`${ref}-prompt-template`)
    ?.addEventListener("command", (e: Event) => {
      const value = (e.target as any).value as string;
      const deleteBtn = doc.getElementById(`${ref}-delete-template`);
      if (deleteBtn) {
        if (value.startsWith("user::")) {
          deleteBtn.removeAttribute("disabled");
        } else {
          deleteBtn.setAttribute("disabled", "true");
        }
      }
    });

  // 应用模板按钮
  doc.getElementById(`${ref}-apply-template`)
    ?.addEventListener("command", () => {
      const templateList = doc.getElementById(`${ref}-prompt-template`) as any;
      const textarea = doc.getElementById(`${ref}-system-prompt`) as HTMLTextAreaElement;
      if (!templateList || !textarea) return;

      const value = templateList.value as string;

      let content: string | undefined;
      if (value === "__blank__") {
        content = "";
      } else if (value.startsWith("user::")) {
        const idx = parseInt(value.slice(6), 10);
        content = loadUserTemplates()[idx]?.content ?? "";
      } else {
        content = PROMPT_TEMPLATES[value];
      }

      if (content !== undefined) {
        textarea.value = content;
        textarea.dispatchEvent(new win.Event("change"));
      }
    });

  // 另存为按钮 → 展开/收起保存行
  doc.getElementById(`${ref}-saveas-template`)
    ?.addEventListener("command", () => {
      const saveRow = doc.getElementById(`${ref}-save-row`);
      const nameInput = doc.getElementById(`${ref}-template-name-input`) as HTMLInputElement;
      const errLabel = doc.getElementById(`${ref}-save-error`) as any;
      if (!saveRow) return;

      const isHidden = saveRow.getAttribute("hidden") === "true";
      saveRow.setAttribute("hidden", isHidden ? "false" : "true");
      if (isHidden) {
        // 展开时清空输入和错误
        if (nameInput) nameInput.value = "";
        if (errLabel) errLabel.setAttribute("hidden", "true");
      }
    });

  // 确认保存按钮
  doc.getElementById(`${ref}-confirm-save`)
    ?.addEventListener("command", () => {
      const nameInput = doc.getElementById(`${ref}-template-name-input`) as HTMLInputElement;
      const textarea = doc.getElementById(`${ref}-system-prompt`) as HTMLTextAreaElement;
      const errLabel = doc.getElementById(`${ref}-save-error`) as any;
      const saveRow = doc.getElementById(`${ref}-save-row`);
      const templateList = doc.getElementById(`${ref}-prompt-template`) as any;
      if (!nameInput || !textarea || !errLabel) return;

      const name = nameInput.value.trim();

      if (!name) {
        errLabel.setAttribute("value", "请输入模板名称");
        errLabel.setAttribute("hidden", "false");
        return;
      }

      const templates = loadUserTemplates();
      if (templates.some((t) => t.name === name)) {
        errLabel.setAttribute("value", `名称"${name}"已存在，请使用其他名称`);
        errLabel.setAttribute("hidden", "false");
        return;
      }

      templates.push({ name, content: textarea.value });
      saveUserTemplates(templates);
      rebuildUserMenuItems(doc);

      // 选中新保存的模板
      const newIdx = templates.length - 1;
      if (templateList) templateList.value = `user::${newIdx}`;

      // 启用删除按钮
      const deleteBtn = doc.getElementById(`${ref}-delete-template`);
      if (deleteBtn) deleteBtn.removeAttribute("disabled");

      // 收起保存行
      if (saveRow) saveRow.setAttribute("hidden", "true");
      errLabel.setAttribute("hidden", "true");
      nameInput.value = "";
    });

  // 取消按钮
  doc.getElementById(`${ref}-cancel-save`)
    ?.addEventListener("command", () => {
      const saveRow = doc.getElementById(`${ref}-save-row`);
      const nameInput = doc.getElementById(`${ref}-template-name-input`) as HTMLInputElement;
      const errLabel = doc.getElementById(`${ref}-save-error`) as any;
      if (saveRow) saveRow.setAttribute("hidden", "true");
      if (nameInput) nameInput.value = "";
      if (errLabel) errLabel.setAttribute("hidden", "true");
    });

  // 删除按钮
  doc.getElementById(`${ref}-delete-template`)
    ?.addEventListener("command", () => {
      const templateList = doc.getElementById(`${ref}-prompt-template`) as any;
      const deleteBtn = doc.getElementById(`${ref}-delete-template`);
      if (!templateList) return;

      const value = templateList.value as string;
      if (!value.startsWith("user::")) return;

      const idx = parseInt(value.slice(6), 10);
      const templates = loadUserTemplates();
      templates.splice(idx, 1);
      saveUserTemplates(templates);
      rebuildUserMenuItems(doc);

      // 重置下拉框到第一个内置模板
      if (templateList) templateList.value = "academic";
      if (deleteBtn) deleteBtn.setAttribute("disabled", "true");
    });

  // 测试连接按钮（LLM）
  doc.getElementById(`${ref}-test-btn`)
    ?.addEventListener("command", () => {
      testConnection(win);
    });

  // 测试连接按钮（MinerU）
  doc.getElementById(`${ref}-mineru-test-btn`)
    ?.addEventListener("command", () => {
      testMinerUConnection(win);
    });

  // 获取模型按钮（LLM）
  doc.querySelectorAll(".pw-fetch-models-btn").forEach((btn: any) => {
    btn.addEventListener("command", (e: Event) => {
      const provider = btn.getAttribute("data-provider");
      fetchModels(win, provider, btn);
    });
  });
}

function fetchModels(win: Window, providerName: string, btn: HTMLElement) {
  const doc = win.document;
  const input = doc.getElementById(`${ref}-${providerName}-models`) as HTMLInputElement;
  if (!input) return;

  const originalLabel = btn.getAttribute("label");
  btn.setAttribute("label", "...");
  btn.setAttribute("disabled", "true");

  const manager = LLMManager.getInstance();
  const provider = manager.buildProvider(providerName as any);

  provider.getModels()
    .then((models) => {
      if (models.length === 0) {
        throw new Error("未找到可用模型");
      }

      // 将模型列表以逗号分隔填入输入框，由 Zotero preference 自动持久化
      input.value = models.join(", ");
      input.dispatchEvent(new win.Event("change"));
    })
    .catch((err) => {
      const resultLabel = doc.getElementById(`${ref}-test-result`) as any;
      if (resultLabel) {
        resultLabel.setAttribute("value", `✗ 获取模型失败：${err.message}`);
      }
    })
    .finally(() => {
      btn.setAttribute("label", originalLabel || "");
      btn.removeAttribute("disabled");
    });
}

function showProviderSection(doc: Document, provider: string) {
  const providers = ["openai", "deepseek", "anthropic", "gemini", "ollama", "kimi", "qwen"];
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

function testMinerUConnection(win: Window) {
  const doc = win.document;
  const resultLabel = doc.getElementById(`${ref}-mineru-test-result`) as any;
  if (!resultLabel) return;

  resultLabel.setAttribute("value", "测试中...");

  const token = Zotero.Prefs.get(
    `${config.prefsPrefix}.mineru.apiToken`, true
  ) as string;

  MinerUTestClient.testConnection(token)
    .then((result) => {
      resultLabel.setAttribute("value",
        result.success ? `✓ ${result.message}` : `✗ ${result.message}`
      );
    })
    .catch((e: Error) => {
      resultLabel.setAttribute("value", `✗ 错误：${e.message}`);
    });
}

