/**
 * Markdown 渲染器 — 纯 DOM API 实现
 * S2 平移自 readerPanel.ts（行为零变化）。
 * 完全使用 DOM API（createElement / createTextNode / appendChild），
 * 不生成任何 HTML 字符串，彻底绕过 Gecko chrome 上下文对
 * innerHTML / createContextualFragment / DOMParser 的安全限制。
 */

import katex from "katex";

/**
 * 将 markdown 文本渲染进目标元素。
 * 完全使用 DOM API（createElement / createTextNode / appendChild），
 * 不生成任何 HTML 字符串，彻底绕过 Gecko chrome 上下文对
 * innerHTML / createContextualFragment / DOMParser 的安全限制。
 */
export function setMarkdown(el: HTMLElement, text: string): void {
  const doc = el.ownerDocument as Document;
  while (el.firstChild) el.removeChild(el.firstChild);

  const lines = text.split("\n");
  let paraLines: string[] = [];

  function flushPara() {
    const content = paraLines.join("\n").trim();
    paraLines = [];
    if (!content) return;
    const p = doc.createElement("p");
    appendInline(doc, p, content);
    el.appendChild(p);
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 显示数学公式：$$ 单独一行作为围栏开始/结束
    if (line.trim() === "$$") {
      flushPara();
      i++;
      const mathLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "$$")
        mathLines.push(lines[i++]);
      if (lines[i]?.trim() === "$$") i++;
      const wrap = doc.createElement("div");
      wrap.className = "pw-math-display";
      renderMath(doc, wrap, mathLines.join("\n"), true);
      el.appendChild(wrap);
      continue;
    }

    // 显示数学公式：\[ 单独一行作为围栏开始/结束（LaTeX 风格）
    if (line.trim() === "\\[") {
      flushPara();
      i++;
      const mathLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "\\]")
        mathLines.push(lines[i++]);
      if (lines[i]?.trim() === "\\]") i++;
      const wrap = doc.createElement("div");
      wrap.className = "pw-math-display";
      renderMath(doc, wrap, mathLines.join("\n"), true);
      el.appendChild(wrap);
      continue;
    }

    // 显示数学公式：$$formula$$ 同行
    const dmatch = line.match(/^\$\$(.+)\$\$\s*$/);
    if (dmatch) {
      flushPara();
      const wrap = doc.createElement("div");
      wrap.className = "pw-math-display";
      renderMath(doc, wrap, dmatch[1].trim(), true);
      el.appendChild(wrap);
      i++;
      continue;
    }

    // 显示数学公式：\[formula\] 同行（LaTeX 风格）
    const dlmatch = line.match(/^\\\[(.+)\\\]\s*$/);
    if (dlmatch) {
      flushPara();
      const wrap = doc.createElement("div");
      wrap.className = "pw-math-display";
      renderMath(doc, wrap, dlmatch[1].trim(), true);
      el.appendChild(wrap);
      i++;
      continue;
    }

    // 代码块
    if (line.startsWith("```")) {
      flushPara();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```"))
        codeLines.push(lines[i++]);
      if (lines[i]?.startsWith("```")) i++;
      const pre = doc.createElement("pre");
      const code = doc.createElement("code");
      code.textContent = codeLines.join("\n");
      pre.appendChild(code);
      el.appendChild(pre);
      continue;
    }

    // 引用块（连续 > 开头的行收进同一个 <blockquote>）
    if (/^>\s?/.test(line)) {
      flushPara();
      const bq = doc.createElement("blockquote");
      bq.className = "pw-blockquote";
      const bqLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        bqLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      appendInline(doc, bq, bqLines.join("\n"));
      el.appendChild(bq);
      continue;
    }

    // 标题 (# ~ ######)
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      flushPara();
      const h = doc.createElement(`h${Math.min(hm[1].length, 6)}`);
      appendInline(doc, h, hm[2]);
      el.appendChild(h);
      i++;
      continue;
    }

    // 水平线
    if (/^-{3,}$/.test(line.trim())) {
      flushPara();
      el.appendChild(doc.createElement("hr"));
      i++;
      continue;
    }

    // 无序列表（连续行收进同一个 <ul>）
    if (/^[ \t]*[-*] /.test(line)) {
      flushPara();
      const ul = doc.createElement("ul");
      while (i < lines.length && /^[ \t]*[-*] /.test(lines[i])) {
        const li = doc.createElement("li");
        appendInline(doc, li, lines[i].replace(/^[ \t]*[-*]\s+/, ""));
        ul.appendChild(li);
        i++;
      }
      el.appendChild(ul);
      continue;
    }

    // 表格（以 | 开头的连续行，第二行为分隔行）
    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tableLines.push(lines[i++]);
      }
      // 第二行是分隔行（只含 |、-、:、空格）时才认定为表格
      const isSepRow = (s: string) => /^\|[\s|:-]+\|?\s*$/.test(s.trim());
      if (tableLines.length >= 2 && isSepRow(tableLines[1])) {
        flushPara();
        const parseCells = (row: string) =>
          row
            .split("|")
            .slice(1)
            .map((c) => c.trim())
            .filter(
              (_, idx, arr) =>
                !(idx === arr.length - 1 && arr[arr.length - 1] === ""),
            );
        const alignments = parseCells(tableLines[1]).map((cell) => {
          if (cell.startsWith(":") && cell.endsWith(":")) return "center";
          if (cell.endsWith(":")) return "right";
          return "left";
        });
        const table = doc.createElement("table");
        table.className = "pw-table";
        // 表头
        const thead = doc.createElement("thead");
        const hRow = doc.createElement("tr");
        parseCells(tableLines[0]).forEach((cell, idx) => {
          const th = doc.createElement("th");
          th.style.textAlign = alignments[idx] ?? "left";
          appendInline(doc, th, cell);
          hRow.appendChild(th);
        });
        thead.appendChild(hRow);
        table.appendChild(thead);
        // 表体
        if (tableLines.length > 2) {
          const tbody = doc.createElement("tbody");
          for (let r = 2; r < tableLines.length; r++) {
            const tr = doc.createElement("tr");
            parseCells(tableLines[r]).forEach((cell, idx) => {
              const td = doc.createElement("td");
              td.style.textAlign = alignments[idx] ?? "left";
              appendInline(doc, td, cell);
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          }
          table.appendChild(tbody);
        }
        el.appendChild(table);
      } else {
        // 不满足表格格式，退回为普通段落行
        for (const tl of tableLines) paraLines.push(tl);
      }
      continue;
    }

    // 空行 → 刷出段落
    if (line.trim() === "") {
      flushPara();
      i++;
      continue;
    }

    paraLines.push(line);
    i++;
  }
  flushPara();
}

/** 在 el 内追加行内 markdown（粗体 / 斜体 / 行内代码 / 行内公式），单行换行转 <br> */
export function appendInline(doc: Document, el: Element, text: string): void {
  text.split("\n").forEach((line, idx, arr) => {
    // 分隔符：行内数学 $...$ 优先于其他模式（避免 * 在公式里被误匹配）
    const parts = line.split(
      /(\$\$[^$\n]+\$\$|\$[^$\n]+\$|\\\([^\n]+?\\\)|\*\*\*.+?\*\*\*|\*\*.+?\*\*|\*.+?\*|`.+?`)/,
    );
    for (const part of parts) {
      if (!part) continue;
      // 行内显示数学 $$...$$
      if (/^\$\$[^$]/.test(part) && part.endsWith("$$")) {
        const span = doc.createElement("span");
        renderMath(doc, span, part.slice(2, -2), true);
        el.appendChild(span);
        // 行内数学 $...$
      } else if (
        part.startsWith("$") &&
        part.endsWith("$") &&
        part.length > 2 &&
        !part.startsWith("$$")
      ) {
        const span = doc.createElement("span");
        renderMath(doc, span, part.slice(1, -1), false);
        el.appendChild(span);
        // 行内数学 \(...\)（LaTeX 风格）
      } else if (part.startsWith("\\(") && part.endsWith("\\)")) {
        const span = doc.createElement("span");
        renderMath(doc, span, part.slice(2, -2), false);
        el.appendChild(span);
      } else if (/^\*\*\*.+\*\*\*$/.test(part)) {
        const s = doc.createElement("strong");
        const e = doc.createElement("em");
        e.textContent = part.slice(3, -3);
        s.appendChild(e);
        el.appendChild(s);
      } else if (/^\*\*.+\*\*$/.test(part)) {
        const s = doc.createElement("strong");
        s.textContent = part.slice(2, -2);
        el.appendChild(s);
      } else if (/^\*.+\*$/.test(part)) {
        const e = doc.createElement("em");
        e.textContent = part.slice(1, -1);
        el.appendChild(e);
      } else if (/^`.+`$/.test(part)) {
        const c = doc.createElement("code");
        c.textContent = part.slice(1, -1);
        el.appendChild(c);
      } else {
        el.appendChild(doc.createTextNode(part));
      }
    }
    if (idx < arr.length - 1) el.appendChild(doc.createElement("br"));
  });
}

/**
 * 用 KaTeX 渲染数学公式（MathML 输出，Firefox 原生渲染，无需 CSS/字体）。
 * 利用"未挂载元素 innerHTML"技巧：在未 append 到文档前设置 innerHTML
 * 是允许的（与 initPanel 中 wrapper.innerHTML 同原理），
 * 再将节点逐一移入目标元素。
 */
export function renderMath(
  doc: Document,
  el: HTMLElement,
  latex: string,
  display: boolean,
): void {
  try {
    const html = katex.renderToString(latex.trim(), {
      throwOnError: false,
      displayMode: display,
      output: "mathml", // Firefox 原生 MathML，不依赖 KaTeX CSS/字体
    });
    // 未挂载的 tmp 元素可以安全使用 innerHTML
    const tmp = doc.createElement("span");
    tmp.innerHTML = html;
    while (tmp.firstChild) el.appendChild(tmp.firstChild);
  } catch {
    // 兜底：显示原始 LaTeX
    const code = doc.createElement("code");
    code.textContent = display ? `$$${latex}$$` : `$${latex}$`;
    el.appendChild(code);
  }
}
