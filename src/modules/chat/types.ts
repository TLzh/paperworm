/**
 * ChatHost / SessionScope — v1.0 组件化架构的核心抽象
 * 见 docs/architecture.md「ChatCore 组件化架构」。
 *
 * 装配哲学：reader 专属能力（选区/截图/MinerU/总结）不是被隐藏，
 * 而是从架构上只存在于 ReaderShell 的 host 实现中。
 */

/** 会话作用域：论文会话挂父条目，独立会话无 item（standalone note） */
export type SessionScope =
  | { kind: "paper"; item: Zotero.Item }
  | { kind: "standalone" };

/** 能力开关 —— 装配差异的唯一表达 */
export interface ChatCapabilities {
  /** PDF 选区引用（"选择文本"按钮 + 选区 chip + mouseup 捕获） */
  selectionChip: boolean;
  /** 框选截图按钮（粘贴图片不受此限，始终可用） */
  screenshot: boolean;
  /** ⚡ MinerU 精细提取 */
  mineru: boolean;
  /** 总结全文 */
  summarize: boolean;
}

/**
 * Chat 宿主：由各 Shell（ReaderShell / StandaloneShell）实现并注入 ChatCore。
 * 可选成员仅在对应 capability 开启时才会被调用。
 */
export interface ChatHost {
  kind: "reader" | "standalone";
  scope: SessionScope;
  capabilities: ChatCapabilities;

  /** 系统提示构建（reader=论文上下文+全文；standalone=用户系统提示） */
  buildSystemPrompt(): Promise<string>;

  /** 上下文构建期间的阶段提示（reader="正在提取论文全文…"）；缺省无提示 */
  extractingHint?: string;

  /** 读取当前 PDF 选区（capabilities.selectionChip 时调用） */
  getSelectedText?(): string;

  /** 启动框选截图（capabilities.screenshot 时调用） */
  startScreenshot?(onCapture: (dataUrl: string) => void): void;

  /** Shell 专属动作（mineru / summarize 等 core 未内置的 data-action） */
  handleAction?(
    action: string,
    textarea: HTMLTextAreaElement,
    panel: HTMLElement,
  ): void;

  /** 含元数据占位符的提示词填充（自定义按钮用）；缺省原样填入 */
  fillPrompt?(textarea: HTMLTextAreaElement, template: string): void;
}

/** mountChatPanel 返回的句柄 */
export interface ChatHandle {
  panel: HTMLElement;
  messagesEl: HTMLElement;
}
