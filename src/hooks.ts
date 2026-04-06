import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { registerReaderPanel } from "./modules/ui/readerPanel";
import { createZToolkit } from "./utils/ztoolkit";
import { config } from "../package.json";

/**
 * 将旧版短路径 pref（如 "llm.provider"）迁移到带完整前缀的新路径。
 *
 * 早期版本的 prefs.js 没有 scaffold prefix，Firefox 以短名存储用户设置；
 * 新版添加 prefix 后路径变为 "extensions.zotero.paperworm.llm.provider"。
 * 若不迁移，用户已配置的 API Key / provider 会消失，导致连接始终失败。
 */
function migrateOldPrefs() {
  const p = config.prefsPrefix; // "extensions.zotero.paperworm"
  const MIGRATION_FLAG = `${p}.prefsMigratedV1`;

  // 只执行一次；第一次完成后写入 flag，之后跳过
  if (Zotero.Prefs.get(MIGRATION_FLAG, true)) return;

  /** 直接通过 Firefox Services.prefs 读取短路径 pref，返回 null 如不存在 */
  function readShort(key: string): string | null {
    try {
      const branch = Services.prefs as any;
      if (branch.getPrefType(key) === 0) return null; // 不存在
      return branch.getStringPref?.(key) ?? branch.getCharPref?.(key) ?? null;
    } catch {
      return null;
    }
  }

  // 短路径 → 完整路径 映射
  const shortKeys: Array<[string, string]> = [
    ["llm.provider",           `${p}.llm.provider`],
    ["llm.openai.apiKey",      `${p}.llm.openai.apiKey`],
    ["llm.openai.model",       `${p}.llm.openai.model`],
    ["llm.deepseek.apiKey",    `${p}.llm.deepseek.apiKey`],
    ["llm.deepseek.model",     `${p}.llm.deepseek.model`],
    ["llm.anthropic.apiKey",   `${p}.llm.anthropic.apiKey`],
    ["llm.anthropic.model",    `${p}.llm.anthropic.model`],
    ["llm.gemini.apiKey",      `${p}.llm.gemini.apiKey`],
    ["llm.gemini.model",       `${p}.llm.gemini.model`],
    ["llm.ollama.baseUrl",     `${p}.llm.ollama.baseUrl`],
    ["llm.ollama.model",       `${p}.llm.ollama.model`],
    ["llm.temperature",        `${p}.llm.temperature`],
    ["llm.maxTokens",          `${p}.llm.maxTokens`],
  ];

  let migrated = 0;
  for (const [shortKey, fullKey] of shortKeys) {
    const shortVal = readShort(shortKey);
    if (!shortVal) continue;
    // 全量覆盖：短路径的值代表用户历史配置，优先级最高
    Zotero.Prefs.set(fullKey, shortVal, true);
    migrated++;
  }

  // 标记迁移完成，之后不再执行
  Zotero.Prefs.set(MIGRATION_FLAG, "true", true);

  if (migrated > 0) {
    Zotero.log(`PaperWorm: migrated ${migrated} pref(s) from old short-path to full-path.`, "warning");
  }
}

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // 迁移旧版短路径 pref（如有）
  migrateOldPrefs();

  // 注册 Reader 侧边聊天面板
  registerReaderPanel();

  // 注册偏好设置面板
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });

  await Promise.all(Zotero.getMainWindows().map((win) => onMainWindowLoad(win)));

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  ztoolkit.log("notify", event, type, ids, extraData);
}

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
};
