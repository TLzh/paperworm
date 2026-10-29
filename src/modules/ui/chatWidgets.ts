/**
 * Chat 共享 UI 组件 — 消息渲染 + 模型切换 + 参数徽章 + SIWC 欢迎层
 * S2 平移自 readerPanel.ts（行为零变化）。
 * 供 ReaderShell 与 StandaloneShell（v1.0）共用，保证同一套设计语言。
 */

import { config } from "../../../package.json";

/** 外部点击监听的文档：游离 createHTMLDocument（defaultView 为 null）回退主窗口文档 */
function clickDoc(doc: Document): Document {
  return doc.defaultView ? doc : (Zotero.getMainWindow().document as Document);
}
import { LLMManager } from "../llm/manager";
import { SiwcAuth } from "../llm/siwcAuth";
import { setMarkdown } from "../chat/markdown";

export function appendMessage(
  doc: Document,
  container: HTMLElement,
  role: "user" | "assistant",
  text: string,
  asMarkdown = false,
): HTMLElement {
  const el = doc.createElement("div");
  el.className = `pw-msg pw-msg-${role}`;
  if (asMarkdown && text) {
    setMarkdown(el, text);
  } else {
    el.textContent = text;
  }
  container.appendChild(el);
  return el;
}

export function scrollToBottom(el: HTMLElement) {
  el.scrollTop = el.scrollHeight;
}

/**
 * 回答因 Max Tokens 上限被截断时，在消息末尾追加提示。
 * 仅 UI 展示，不入会话历史（用户输入"继续"即可从断点接着生成）。
 */
export function appendTruncationHint(
  doc: Document,
  msgEl: HTMLElement,
  maxTokens: number,
): void {
  const hint = doc.createElement("div");
  hint.className = "pw-truncated-hint";
  hint.textContent = `⚠ 回答因达到 Max Tokens 上限（${maxTokens}）被截断 — 输入"继续"可接着生成，或点上方 T 徽章调大 Max Tokens`;
  msgEl.appendChild(hint);
}

export function getProviderDisplayName(providerId: string): string {
  const displayNames: Record<string, string> = {
    openai: "OpenAI",
    "openai-siwc": "OpenAI 订阅",
    deepseek: "DeepSeek",
    anthropic: "Claude",
    gemini: "Gemini",
    ollama: "Ollama",
    kimi: "Kimi",
    qwen: "阿里云百炼",
    openrouter: "OpenRouter",
    mimo: "MiMo",
    minimax: "MiniMax",
    zhipu: "智谱 GLM",
  };
  return displayNames[providerId] || providerId;
}

// 提供商配置接口
export interface ConfiguredProvider {
  name: string; // 显示名：OpenAI, Claude, etc.
  providerId: string; // id：openai, anthropic, etc.
  model: string; // 当前激活的模型名 (llm.<id>.model)
  modelsList: string[]; // 可选模型列表 (llm.<id>.models)
}

// 获取所有已配置且有可用模型的提供商列表
export function getConfiguredProviders(): ConfiguredProvider[] {
  const p = config.prefsPrefix;
  const providers: ConfiguredProvider[] = [];

  const providerConfigs = [
    { id: "openai", keyPref: "apiKey" },
    { id: "openai-siwc", keyPref: "refreshToken" }, // 登录后凭据存在即视为已配置
    { id: "deepseek", keyPref: "apiKey" },
    { id: "anthropic", keyPref: "apiKey" },
    { id: "gemini", keyPref: "apiKey" },
    { id: "kimi", keyPref: "apiKey" },
    { id: "qwen", keyPref: "apiKey" },
    { id: "openrouter", keyPref: "apiKey" },
    { id: "mimo", keyPref: "apiKey" },
    { id: "minimax", keyPref: "apiKey" },
    { id: "zhipu", keyPref: "apiKey" },
    { id: "ollama", keyPref: "baseUrl" },
  ];

  for (const cfg of providerConfigs) {
    const key = Zotero.Prefs.get(
      `${p}.llm.${cfg.id}.${cfg.keyPref}`,
      true,
    ) as string;
    const isConfigured = cfg.id === "ollama" ? !!key : !!key && key.length > 0;

    if (isConfigured) {
      // 从模型列表配置读取（逗号分隔）
      const modelsStr =
        (Zotero.Prefs.get(`${p}.llm.${cfg.id}.models`, true) as string) || "";
      const modelsList = modelsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // 已配置即出现在下拉中：models 列表为空时用当前 model pref 兜底
      // （如 ChatGPT 订阅登录后未点"获取模型"，或 API key 厂商未拉列表）
      const currentModel =
        (Zotero.Prefs.get(`${p}.llm.${cfg.id}.model`, true) as string) || "";
      const effectiveModels =
        modelsList.length > 0 ? modelsList : currentModel ? [currentModel] : [];
      if (effectiveModels.length > 0) {
        providers.push({
          name: getProviderDisplayName(cfg.id),
          providerId: cfg.id,
          model: currentModel || effectiveModels[0],
          modelsList: effectiveModels,
        });
      }
    }
  }

  return providers;
}

/**
 * ChatGPT 订阅首次登录确认 overlay（官方 UI 规范：仅首次 sign-in 后展示一次，
 * "You're using your ChatGPT plan" + Got it；之后不再出现）。
 */
export function maybeShowSiwcWelcome(doc: Document, panel: HTMLElement): void {
  const pName = LLMManager.getInstance().getActiveProviderName();
  if (
    pName !== "openai-siwc" ||
    !SiwcAuth.isSignedIn() ||
    SiwcAuth.isWelcomed()
  ) {
    return;
  }
  const overlay = doc.createElement("div");
  overlay.className = "pw-siwc-welcome";
  const card = doc.createElement("div");
  card.className = "pw-siwc-welcome-card";
  const title = doc.createElement("div");
  title.className = "pw-siwc-welcome-title";
  title.textContent = "You're using your ChatGPT plan";
  const desc = doc.createElement("div");
  desc.className = "pw-siwc-welcome-desc";
  desc.textContent =
    "PaperWorm 中的 AI 请求将使用你的 ChatGPT 订阅额度，可在 ChatGPT 设置中查看与管理用量。";
  const btn = doc.createElement("div");
  btn.className = "pw-siwc-welcome-btn";
  btn.setAttribute("role", "button");
  btn.setAttribute("tabindex", "0");
  btn.textContent = "Got it";
  btn.addEventListener("click", () => {
    SiwcAuth.markWelcomed();
    overlay.remove();
  });
  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(btn);
  overlay.appendChild(card);
  panel.appendChild(overlay);
}

/** T 徽章文本：温度 · MaxTokens（· 推理档位后缀，per-vendor 原生档位的 short 标签） */
export function getParamsBadgeText(): string {
  const t = parseFloat(
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.llm.temperature`,
      true,
    ) as string) ?? "0.7",
  ).toFixed(1);
  const m = parseInt(
    (Zotero.Prefs.get(`${config.prefsPrefix}.llm.maxTokens`, true) as string) ??
      "2000",
  );
  const mk = m >= 1000 ? Math.round(m / 1000) + "k" : String(m);
  const manager = LLMManager.getInstance();
  const pName = manager.getActiveProviderName();
  const raw =
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.llm.${pName}.reasoning`,
      true,
    ) as string) ?? "";
  let suffix = "";
  if (raw) {
    // 档位标签由 provider 档位表定义；若该模型已被学习为"不支持此档位"
    // （档位表已过滤掉它），则徽章回退为"默认"，避免显示实际未下发的值
    const model =
      (Zotero.Prefs.get(
        `${config.prefsPrefix}.llm.${pName}.model`,
        true,
      ) as string) ?? undefined;
    const levels = manager.getProvider().getReasoningLevels(model);
    const level = levels.find((l) => l.value === raw);
    suffix = level ? ` · ${level.short ?? raw}` : "";
  }
  return `T: ${t} · ${mk}${suffix}`;
}

// 显示请求参数 popover（Temperature + Max Tokens + 深度思考）
export function showParamsPopover(
  doc: Document,
  panel: HTMLElement,
  trigger: HTMLElement,
  badge: HTMLElement,
): void {
  // 已有 popover 则关闭（切换行为）
  const existing = panel.querySelector(".pw-temp-popover");
  if (existing) {
    existing.remove();
    return;
  }

  const curTemp = parseFloat(
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.llm.temperature`,
      true,
    ) as string) ?? "0.7",
  );
  const curTokens = parseInt(
    (Zotero.Prefs.get(`${config.prefsPrefix}.llm.maxTokens`, true) as string) ??
      "2000",
  );
  // ChatGPT 订阅通道（SIWC）：温度与 MaxTokens 被官方禁用 → 控件置灰 + 说明（诚实 UI）
  const siwcChannel =
    LLMManager.getInstance().getActiveProviderName() === "openai-siwc";

  const popover = doc.createElement("div");
  popover.className = "pw-temp-popover";

  // 预算挤占提示的刷新钩子：由下方"深度思考"区块赋值实现（无档位表时保持空操作），
  // Max Tokens 滑条/输入实时变化时即时联动，无需重开 popover
  let refreshBudgetHint: () => void = () => {};

  function makeSectionTitle(text: string) {
    const el = doc.createElement("div");
    el.className = "pw-temp-title";
    el.textContent = text;
    return el;
  }

  function makeHint(text: string) {
    const el = doc.createElement("div");
    el.className = "pw-temp-hint";
    el.textContent = text;
    return el;
  }

  // ── Temperature ──
  popover.appendChild(makeSectionTitle("Temperature"));

  const tempRow = doc.createElement("div");
  tempRow.className = "pw-temp-row";

  const slider = doc.createElement("input") as HTMLInputElement;
  slider.type = "range";
  slider.className = "pw-temp-slider";
  slider.min = "0";
  slider.max = "2";
  slider.step = "0.1";
  slider.value = String(curTemp);

  const tempInput = doc.createElement("input") as HTMLInputElement;
  tempInput.type = "number";
  tempInput.className = "pw-temp-input";
  tempInput.min = "0";
  tempInput.max = "2";
  tempInput.step = "0.1";
  tempInput.value = curTemp.toFixed(1);

  tempRow.appendChild(slider);
  tempRow.appendChild(tempInput);
  popover.appendChild(tempRow);
  popover.appendChild(
    makeHint(
      siwcChannel
        ? "订阅通道不支持温度调节（ChatGPT 订阅通道官方限制），此项不生效"
        : "0 = 精准稳定   2 = 随机创意   推荐 0.1–0.7",
    ),
  );
  if (siwcChannel) {
    slider.disabled = true;
    tempInput.disabled = true;
  }

  // Kimi temperature 为确定值/不可修改（K2.5 传错报 400；K2.6+ 官方明言勿传）—— 发送层已全系剥离
  // GLM temperature 区间 (0,1)—— 发送层已自动钳制到 (0,1]
  {
    const manager = LLMManager.getInstance();
    const pName = manager.getActiveProviderName();
    if (pName === "kimi") {
      popover.appendChild(
        makeHint(
          "Kimi 各系温度为固定值（官方明言请勿传入），此设置不生效，请求中已自动省略",
        ),
      );
    } else if (pName === "zhipu") {
      popover.appendChild(
        makeHint("GLM 温度区间为 (0,1)，超出部分发送时自动就近钳制"),
      );
    }
  }

  // ── 分隔线 ──
  const divider = doc.createElement("div");
  divider.className = "pw-params-divider";
  popover.appendChild(divider);

  // ── Max Tokens ──
  popover.appendChild(makeSectionTitle("Max Tokens"));

  const tokensRow = doc.createElement("div");
  tokensRow.className = "pw-temp-row";

  const tokensSlider = doc.createElement("input") as HTMLInputElement;
  tokensSlider.type = "range";
  tokensSlider.className = "pw-temp-slider";
  tokensSlider.min = "100";
  tokensSlider.max = "32000";
  tokensSlider.step = "100";
  tokensSlider.value = String(curTokens);

  const tokensInput = doc.createElement("input") as HTMLInputElement;
  tokensInput.type = "number";
  tokensInput.className = "pw-tokens-input";
  tokensInput.min = "100";
  tokensInput.max = "32000";
  tokensInput.step = "100";
  tokensInput.value = String(curTokens);

  tokensRow.appendChild(tokensSlider);
  tokensRow.appendChild(tokensInput);
  popover.appendChild(tokensRow);
  popover.appendChild(
    makeHint(
      siwcChannel
        ? "订阅通道由 ChatGPT 套餐管理输出长度，此项不生效"
        : "100–32000   思考模型建议 ≥8000",
    ),
  );
  if (siwcChannel) {
    tokensSlider.disabled = true;
    tokensInput.disabled = true;
  }

  // ── 深度思考 ──
  const divider2 = doc.createElement("div");
  divider2.className = "pw-params-divider";
  popover.appendChild(divider2);

  popover.appendChild(makeSectionTitle("深度思考"));

  {
    const manager = LLMManager.getInstance();
    const pName = manager.getActiveProviderName();
    const model =
      (Zotero.Prefs.get(
        `${config.prefsPrefix}.llm.${pName}.model`,
        true,
      ) as string) ?? "";
    const levels = manager.getProvider().getReasoningLevels(model || undefined);
    const reasoningKey = `${config.prefsPrefix}.llm.${pName}.reasoning`;

    if (levels.length === 0) {
      // 无档位表（如 Anthropic 官方参数待核实）：诚实告知而非近似映射
      popover.appendChild(
        makeHint(
          "该厂商推理配置即将支持（官方参数核实中），当前使用厂商默认行为",
        ),
      );
    } else {
      const thinkRow = doc.createElement("div");
      thinkRow.className = "pw-thinking-row";

      // 预算挤占提示：非显式关闭类档位（含默认——DeepSeek 等厂商默认思考开、
      // gpt-5/6 无法完全关闭推理）且 Max Tokens 偏低时动态显示
      const budgetHint = doc.createElement("div");
      budgetHint.className = "pw-temp-hint";
      refreshBudgetHint = () => {
        // 订阅通道：MaxTokens 不适用，预算提示恒空
        if (pName === "openai-siwc") {
          budgetHint.textContent = "";
          return;
        }
        const cur =
          (Zotero.Prefs.get(
            `${config.prefsPrefix}.llm.${pName}.reasoning`,
            true,
          ) as string) ?? "";
        const tokens = parseInt(
          (Zotero.Prefs.get(
            `${config.prefsPrefix}.llm.maxTokens`,
            true,
          ) as string) ?? "2000",
        );
        const isThinking = !["none", "disabled", "off"].includes(cur);
        budgetHint.textContent =
          isThinking && tokens < 8000
            ? `⚠ 当前 Max Tokens（${tokens}）偏低，思考 token 会分享此预算（含厂商默认开启思考的模型），可能挤占正文导致回答被截断，建议 ≥8000`
            : "";
      };

      for (const lv of levels) {
        const el = doc.createElement("div");
        el.className = "pw-thinking-opt";
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.textContent = lv.label;
        if (lv.hint) el.title = lv.hint;
        if (
          ((Zotero.Prefs.get(reasoningKey, true) as string) ?? "") === lv.value
        ) {
          el.classList.add("pw-thinking-active");
        }
        el.addEventListener("click", () => {
          Zotero.Prefs.set(reasoningKey, lv.value, true);
          thinkRow
            .querySelectorAll(".pw-thinking-opt")
            .forEach((o: Element) => o.classList.remove("pw-thinking-active"));
          el.classList.add("pw-thinking-active");
          refreshBudgetHint();
          updateBadge();
        });
        thinkRow.appendChild(el);
      }
      popover.appendChild(thinkRow);
      popover.appendChild(
        makeHint(
          "档位为该厂商官方原生枚举（每家独立记忆）；默认 = 不下发参数，使用厂商默认行为。立即生效",
        ),
      );
      popover.appendChild(budgetHint);
      refreshBudgetHint();
    }
  }

  // ── 定位 ──
  panel.appendChild(popover);
  const rect = trigger.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  popover.style.top = `${rect.bottom - panelRect.top + 4}px`;
  popover.style.left = `${rect.left - panelRect.left}px`;

  // ── 更新徽章文字 ──
  function updateBadge() {
    badge.textContent = getParamsBadgeText();
  }

  // Temperature 联动
  function applyTemp(v: number) {
    const clamped = Math.min(2, Math.max(0, v));
    const str = clamped.toFixed(1);
    slider.value = str;
    tempInput.value = str;
    Zotero.Prefs.set(`${config.prefsPrefix}.llm.temperature`, str, true);
    updateBadge();
  }
  slider.addEventListener("input", () => applyTemp(parseFloat(slider.value)));
  tempInput.addEventListener("change", () =>
    applyTemp(parseFloat(tempInput.value) || 0),
  );

  // Max Tokens 联动
  function applyTokens(v: number) {
    const clamped = Math.min(32000, Math.max(100, v));
    tokensInput.value = String(clamped);
    tokensSlider.value = String(clamped);
    Zotero.Prefs.set(
      `${config.prefsPrefix}.llm.maxTokens`,
      String(clamped),
      true,
    );
    updateBadge();
    refreshBudgetHint(); // 预算提示随 Max Tokens 实时更新
  }
  tokensSlider.addEventListener("input", () =>
    applyTokens(parseInt(tokensSlider.value) || 2000),
  );
  tokensInput.addEventListener("change", () =>
    applyTokens(parseInt(tokensInput.value) || 2000),
  );

  // ── 点击外部关闭 ──
  const docForClicks = clickDoc(doc);
  const closeHandler = (ev: MouseEvent) => {
    if (!popover.contains(ev.target as Node) && ev.target !== trigger) {
      popover.remove();
      docForClicks.removeEventListener("click", closeHandler, true);
    }
  };
  docForClicks.addEventListener("click", closeHandler, true);
}

// 显示提供商下拉菜单
export function showProviderDropdown(
  doc: Document,
  panel: HTMLElement,
  triggerEl: HTMLElement,
  dropdownState: { open: boolean },
): void {
  // 关闭已打开的下拉
  const existingDropdown = panel.querySelector(
    ".pw-provider-dropdown",
  ) as HTMLElement;
  if (existingDropdown) {
    existingDropdown.remove();
    dropdownState.open = false;
    return;
  }

  dropdownState.open = true;

  const dropdown = doc.createElement("div");
  dropdown.className = "pw-provider-dropdown";

  const providers = getConfiguredProviders();
  const currentProviderId = LLMManager.getInstance().getActiveProviderName();

  function renderProviders() {
    dropdown.textContent = "";
    if (providers.length === 0) {
      const emptyMsg = doc.createElement("div");
      emptyMsg.className = "pw-dropdown-empty";
      emptyMsg.textContent = "未配置服务商或模型列表为空，请前往设置";
      dropdown.appendChild(emptyMsg);
      return;
    }

    providers.forEach((provider) => {
      const item = doc.createElement("div");
      item.className = "pw-dropdown-item";
      if (provider.providerId === currentProviderId) {
        item.classList.add("pw-dropdown-active");
      }

      const nameEl = doc.createElement("span");
      nameEl.className = "pw-dropdown-provider";
      nameEl.textContent = provider.name;

      const modelEl = doc.createElement("span");
      modelEl.className = "pw-dropdown-model";
      modelEl.textContent = provider.model;

      item.appendChild(nameEl);
      item.appendChild(modelEl);

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        renderModels(provider);
      });

      dropdown.appendChild(item);
    });
  }

  function renderModels(provider: ConfiguredProvider) {
    dropdown.textContent = "";

    // 返回按钮
    const backBtn = doc.createElement("div");
    backBtn.className = "pw-dropdown-back";
    backBtn.textContent = `← 返回选择服务商`;
    backBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      renderProviders();
    });
    dropdown.appendChild(backBtn);

    provider.modelsList.forEach((modelId) => {
      const item = doc.createElement("div");
      item.className = "pw-dropdown-item pw-model-item";
      if (
        provider.providerId === currentProviderId &&
        modelId === provider.model
      ) {
        item.classList.add("pw-dropdown-active");
      }
      item.textContent = modelId;
      item.addEventListener("click", () => {
        // 更新配置：llm.provider 记录厂商，llm.<id>.model 记录该厂商激活的模型
        const p = config.prefsPrefix;
        Zotero.Prefs.set(`${p}.llm.provider`, provider.providerId, true);
        Zotero.Prefs.set(
          `${p}.llm.${provider.providerId}.model`,
          modelId,
          true,
        );

        // 更新 UI 徽章
        const badge = panel.querySelector(".pw-model-text") as HTMLElement;
        if (badge) badge.textContent = `${provider.name} · ${modelId}`;

        dropdown.remove();
        dropdownState.open = false;
      });
      dropdown.appendChild(item);
    });
  }

  renderProviders();

  // 添加到面板并定位
  panel.appendChild(dropdown);

  const rect = triggerEl.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom - panelRect.top + 4}px`;
  dropdown.style.left = `${rect.left - panelRect.left}px`;

  // 点击外部关闭
  const docForClicks = clickDoc(doc);
  setTimeout(() => {
    const closeHandler = (e: MouseEvent) => {
      if (!dropdown.contains(e.target as Node) && e.target !== triggerEl) {
        dropdown.remove();
        dropdownState.open = false;
        docForClicks.removeEventListener("click", closeHandler);
      }
    };
    docForClicks.addEventListener("click", closeHandler);
  }, 0);
}
