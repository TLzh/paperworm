/**
 * StandaloneShell — 独立会话（v1.0「两个半」之二）
 * 主工具栏常驻按钮 + Zotero_Tabs 独立 tab + ChatCore 装配（无 reader 能力）。
 * 存储：standalone note + 专用 collection「PaperWorm 独立会话」（随 Zotero 免费同步）。
 *
 * 渲染要点（v1.0 S5 平台结论，详见 docs/DEVELOPMENT.md）：
 * XUL <iframe> 已被移除、XUL <browser> 在 Fission 下为 remote（contentDocument 不可用）；
 * 正确做法是 createHTMLDocument() 构建后 adoptNode() 移入 XUL 容器——
 * 事件监听器/定时器/MutationObserver 随节点保留，ChatCore 行为与 reader 面板一致。
 */

import { config } from "../../../package.json";
import { mountChatPanel } from "../chat/core";
import type { ChatHost } from "../chat/types";

const TAB_TITLE = "PaperWorm 会话";

/** Zotero_Tabs 挂在主窗口全局，插件 sandbox 的 globalThis 上没有 */
function getZoteroTabs(): any {
  try {
    return (Zotero.getMainWindow() as any)?.Zotero_Tabs ?? null;
  } catch {
    return null;
  }
}

let tabID: string | null = null;

/** 注入主工具栏常驻按钮（不依赖任何条目选中状态） */
export function registerStandaloneChat(): void {
  const win = Zotero.getMainWindow();
  const doc = win.document;
  if (doc.getElementById(`${config.addonRef}-standalone-btn`)) return;
  const toolbar = doc.getElementById("zotero-items-toolbar");
  if (!toolbar) {
    Zotero.log("PaperWorm: zotero-items-toolbar not found", "warning");
    return;
  }
  const btn = doc.createXULElement("toolbarbutton") as any;
  btn.id = `${config.addonRef}-standalone-btn`;
  btn.setAttribute("class", "zotero-tb-button");
  btn.setAttribute("tabindex", "-1");
  btn.setAttribute("tooltiptext", "PaperWorm 独立会话");
  btn.style.listStyleImage = `url("chrome://${config.addonRef}/content/icons/favicon@0.5x.png")`;
  btn.addEventListener("command", () => openStandaloneTab());
  toolbar.appendChild(btn);
}

/** 插件卸载/禁用时清理按钮与 tab */
export function unregisterStandaloneChat(): void {
  try {
    const win = Zotero.getMainWindow();
    win.document.getElementById(`${config.addonRef}-standalone-btn`)?.remove();
    const tabs = getZoteroTabs();
    if (tabID && tabs?._tabs?.some((t: any) => t.id === tabID)) {
      tabs.close(tabID);
    }
  } catch {
    /* ignore */
  }
  tabID = null;
}

/** 打开（或聚焦已打开的）独立会话 tab */
function openStandaloneTab(): void {
  const tabs = getZoteroTabs();
  if (!tabs) {
    const msg = "Zotero_Tabs 不可用";
    Zotero.log(`PaperWorm standalone: ${msg}`, "error");
    try {
      Zotero.getMainWindow().alert(`PaperWorm 独立会话打开失败：${msg}`);
    } catch {
      /* ignore */
    }
    return;
  }
  if (tabID && tabs._tabs?.some((t: any) => t.id === tabID)) {
    tabs.select(tabID);
    return;
  }
  let id: string;
  let container: any;
  try {
    ({ id, container } = tabs.add({
      type: "paperworm-chat",
      title: TAB_TITLE,
      // data 必须提供：Zotero 9 tabs.js _update() 会直接访问 tab.data.icon
      data: {},
      select: true,
      onClose: () => {
        // 挂载的 HTML 子树随 container 移除而销毁，ChatCore 定时器随之清理
        tabID = null;
      },
    }));
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    Zotero.log(`PaperWorm standalone tab add failed — ${msg}`, "error");
    try {
      Zotero.getMainWindow().alert(`PaperWorm 独立会话创建失败：\n${msg}`);
    } catch {
      /* ignore */
    }
    return;
  }
  tabID = id as string;
  try {
    renderStandaloneUI(container as HTMLElement);
  } catch (e) {
    // 不让失败静默：写入日志并把错误显示在 tab 内，便于用户反馈
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    Zotero.log(`PaperWorm standalone tab failed — ${msg}`, "error");
    try {
      const doc = (container as HTMLElement).ownerDocument as Document;
      (container as HTMLElement).textContent = "";
      const box = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div",
      ) as HTMLElement;
      box.style.cssText =
        "padding:16px;font-size:12px;color:#c0392b;white-space:pre-wrap;";
      box.textContent = `[PaperWorm] 独立会话初始化失败：\n${msg}`;
      (container as HTMLElement).appendChild(box);
    } catch {
      /* ignore */
    }
  }
}

/** tab 内容渲染：createHTMLDocument 构建 → adoptNode 移入 XUL 容器
 *
 * 平台事实：Zotero 7+ 基于 Fission 进程隔离，XUL <browser> 为 remote（跨进程），
 * 插件无法获取其 contentDocument；XUL <iframe> 元素已被移除。
 * 因此改用 createHTMLDocument 构建（默认 HTML 命名空间，doc.createElement 行为
 * 与 reader 面板一致），完成后 adoptNode 移动节点：事件监听器、定时器、
 * MutationObserver 均随节点保留。
 */
function renderStandaloneUI(container: HTMLElement): void {
  const doc = container.ownerDocument as Document;

  const htmlDoc = doc.implementation.createHTMLDocument("PaperWorm");
  const mountEl = htmlDoc.createElement("div");
  mountEl.className = "pw-standalone-wrap";
  mountEl.style.cssText =
    "display:flex;flex-direction:column;width:100%;height:100%;min-height:0;";
  // XUL tab-content 容器布局保险（HTML 子元素需要确定尺寸）
  try {
    (container as any).style.display = "flex";
    (container as any).style.flexDirection = "column";
  } catch {
    /* ignore */
  }

  const host: ChatHost = {
    kind: "standalone",
    scope: { kind: "standalone" },
    capabilities: {
      selectionChip: false,
      screenshot: false,
      mineru: false,
      summarize: false,
    },
    // 独立会话：仅用户系统提示词，无论文上下文
    buildSystemPrompt: async () =>
      (Zotero.Prefs.get(
        `${config.prefsPrefix}.systemPrompt.content`,
        true,
      ) as string) ?? "",
  };

  void mountChatPanel(htmlDoc, host, mountEl)
    .then(() => {
      container.appendChild(doc.adoptNode(mountEl));
    })
    .catch((e) => {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      Zotero.log(`PaperWorm standalone panel init failed — ${msg}`, "error");
      try {
        const box = doc.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "div",
        ) as HTMLElement;
        box.style.cssText =
          "padding:16px;font-size:12px;color:#c0392b;white-space:pre-wrap;";
        box.textContent = `[PaperWorm] 独立会话初始化失败：\n${msg}`;
        container.appendChild(box);
      } catch {
        /* ignore */
      }
    });
}
