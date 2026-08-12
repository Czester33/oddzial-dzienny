"use client";

import {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  forwardRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  TEXT_COLORS,
  adaptHtmlColorsForTheme,
  isBoldFontWeight,
  stripInlineStylesInSubtree,
  unwrapBoldTagsInSubtree,
  unwrapUnderlineTagsInSubtree,
  type InlineFormatProperty,
} from "@/lib/text-format";
import { useTheme } from "@/context/ThemeContext";

const VIEWPORT_MARGIN = 12;
/** Match app mobile breakpoint (see Navigation / FitWidthScale). */
const MOBILE_MAX_WIDTH = 768;

function getVisualViewportBox() {
  const vv = window.visualViewport;
  if (!vv) {
    return {
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }
  return {
    top: vv.offsetTop,
    left: vv.offsetLeft,
    width: vv.width,
    height: vv.height,
  };
}

function isMobileViewport(width: number): boolean {
  return width <= MOBILE_MAX_WIDTH;
}

function verticalRangesOverlap(
  aTop: number,
  aBottom: number,
  bTop: number,
  bBottom: number,
  margin: number
): boolean {
  return aTop < bBottom + margin && aBottom + margin > bTop;
}

function getCaretClientRect(el: HTMLElement): DOMRect | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return null;
  const rect = range.getBoundingClientRect();
  if (!Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) return null;
  return rect;
}

/** Pick a mobile panel top that avoids covering the editor and caret when possible. */
function computeIdealMobilePanelTop(
  viewportTop: number,
  viewportBottom: number,
  panelHeight: number,
  editorRect: DOMRect,
  caretRect: DOMRect | null,
  gap: number
): number {
  const minTop = viewportTop + gap;
  const maxTop = viewportBottom - panelHeight - gap;
  if (maxTop <= minTop) return minTop;

  const anchor = caretRect ?? editorRect;
  const candidates = new Set<number>([
    maxTop,
    minTop,
    editorRect.top - panelHeight - gap,
    editorRect.bottom + gap,
  ]);

  if (caretRect) {
    candidates.add(caretRect.top - panelHeight - gap);
    candidates.add(caretRect.bottom + gap);
  }

  let bestTop = maxTop;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const rawTop of candidates) {
    const panelTop = Math.min(maxTop, Math.max(minTop, rawTop));
    const panelBottom = panelTop + panelHeight;

    const overlapsEditor = verticalRangesOverlap(
      panelTop,
      panelBottom,
      editorRect.top,
      editorRect.bottom,
      gap
    );
    const overlapsCaret = caretRect
      ? verticalRangesOverlap(panelTop, panelBottom, caretRect.top, caretRect.bottom, gap)
      : false;

    const anchorCenter = anchor.top + anchor.height / 2;
    const coversAnchor =
      panelTop <= anchorCenter && panelBottom >= anchorCenter;

    const overlapPenalty =
      (overlapsEditor ? 10_000 : 0) +
      (overlapsCaret ? 5_000 : 0) +
      (coversAnchor ? 3_000 : 0);

    const distanceFromAnchor = Math.abs(panelTop + panelHeight / 2 - anchorCenter);
    const bottomBias = (maxTop - panelTop) * 0.35;
    const score = overlapPenalty + distanceFromAnchor - bottomBias;

    if (score < bestScore) {
      bestScore = score;
      bestTop = panelTop;
    }
  }

  return bestTop;
}

type MobilePanelPoint = { top: number; left: number };

function clampMobilePanelPosition(
  pos: MobilePanelPoint,
  panelWidth: number,
  panelHeight: number,
  viewportTop: number,
  viewportLeft: number,
  viewportWidth: number,
  viewportHeight: number,
  gap: number
): MobilePanelPoint {
  const minTop = viewportTop + gap;
  const minLeft = viewportLeft + gap;
  const maxTop = viewportTop + viewportHeight - panelHeight - gap;
  const maxLeft = viewportLeft + viewportWidth - panelWidth - gap;
  return {
    top: Math.min(maxTop, Math.max(minTop, pos.top)),
    left: Math.min(maxLeft, Math.max(minLeft, pos.left)),
  };
}

function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

function parseFontSizePx(value: string): number | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
  if (!match) return null;
  return clampFontSize(Number(match[1]));
}

const MANUAL_NUMBER_LINE = /^(\s*)(\d+)\.\s*(.*)$/;

function getPlainTextBeforeRange(root: HTMLElement, endContainer: Node, endOffset: number): string {
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(endContainer, endOffset);
  const measure = document.createElement("div");
  measure.appendChild(pre.cloneContents());
  return measure.innerText.replace(/\r/g, "");
}

function getCaretTextOffset(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return 0;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return 0;
  return getPlainTextBeforeRange(root, range.startContainer, range.startOffset).length;
}

function getLineAtTextOffset(text: string, offset: number) {
  const before = text.slice(0, offset);
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = text.indexOf("\n", offset);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  return { lineStart, line };
}

function findMaxOlNumberBeforeCaret(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return 0;
  const anchor = sel.anchorNode;
  if (!anchor || !root.contains(anchor)) return 0;

  let max = 0;
  root.querySelectorAll("ol").forEach((ol) => {
    if (!root.contains(ol)) return;
    const items = Array.from(ol.children).filter((c) => c.tagName === "LI");
    items.forEach((li, idx) => {
      if (li === anchor || li.contains(anchor)) return;
      const position = anchor.compareDocumentPosition(li);
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        max = Math.max(max, idx + 1);
      }
    });
  });
  return max;
}

function getDirectChildOfRoot(node: Node | null, root: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el && el.parentElement && el.parentElement !== root) {
    el = el.parentElement;
  }
  if (el && el.parentElement === root) return el;
  return null;
}

function getNodeLineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\r/g, "");
  if (node instanceof HTMLElement) return node.innerText.replace(/\r/g, "");
  return "";
}

function findLastNumberedLineBlock(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const caretNode = sel.anchorNode;
  if (!caretNode || !root.contains(caretNode)) return null;

  const children = Array.from(root.childNodes);
  let caretChildIndex = children.findIndex((child) => child.contains(caretNode) || child === caretNode);
  if (caretChildIndex < 0) caretChildIndex = children.length;

  for (let i = caretChildIndex - 1; i >= 0; i--) {
    const child = children[i];
    const text = getNodeLineText(child).split("\n")[0] ?? "";
    if (/^\s*\d+\.\s/.test(text)) {
      return child instanceof HTMLElement ? child : child.parentElement;
    }
  }
  return null;
}

function syncBlockIndentFromReference(root: HTMLElement, reference: HTMLElement) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const currentBlock = getDirectChildOfRoot(sel.anchorNode, root);
  if (!currentBlock || currentBlock === reference) return;

  const refStyle = window.getComputedStyle(reference);
  currentBlock.style.marginLeft = refStyle.marginLeft;
  currentBlock.style.paddingLeft = refStyle.paddingLeft;
  currentBlock.style.textIndent = refStyle.textIndent;
}

function getCurrentLineIndex(root: HTMLElement, currentLine: string): number {
  const lines = root.innerText.replace(/\r/g, "").split("\n");
  if (!currentLine) return lines.length - 1;

  let lastMatch = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === currentLine) lastMatch = i;
  }
  return lastMatch >= 0 ? lastMatch : lines.length - 1;
}

function findManualNumberingContext(root: HTMLElement): {
  maxNumber: number;
  textIndent: string;
  referenceBlock: HTMLElement | null;
} {
  const fullText = root.innerText.replace(/\r/g, "");
  const lines = fullText.split("\n");
  const lineRange = getLineRangeAtCaret(root);
  const currentLine = lineRange?.toString() ?? "";
  const currentLineIndex = getCurrentLineIndex(root, currentLine);

  let max = 0;
  let textIndent = "";
  for (let i = 0; i < currentLineIndex; i++) {
    const match = lines[i].match(/^(\s*)(\d+)\.\s*/);
    if (match) {
      max = Math.max(max, Number(match[2]));
      textIndent = match[1];
    }
  }

  return {
    maxNumber: Math.max(max, findMaxOlNumberBeforeCaret(root)),
    textIndent,
    referenceBlock: findLastNumberedLineBlock(root),
  };
}

function findMaxManualNumberBeforeCurrentLine(root: HTMLElement): number {
  return findManualNumberingContext(root).maxNumber;
}

function isInOrderedListItem(node: Node, root: HTMLElement): boolean {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
  while (el && el !== root) {
    if (el.tagName === "LI" && el.closest("ol")) return true;
    el = el.parentElement;
  }
  return false;
}

function findListItem(node: Node | null, root: HTMLElement): HTMLLIElement | null {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el && el !== root) {
    if (el.tagName === "LI") return el as HTMLLIElement;
    el = el.parentElement;
  }
  return null;
}

function convertNestedOlToUl(root: HTMLElement) {
  root.querySelectorAll("ol li ol").forEach((nestedOl) => {
    const ul = document.createElement("ul");
    while (nestedOl.firstChild) {
      ul.appendChild(nestedOl.firstChild);
    }
    nestedOl.replaceWith(ul);
  });
}

function getLineRangeAtCaret(root: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return null;
  const anchor = sel.anchorNode;
  if (!anchor || !root.contains(anchor)) return null;
  if (typeof sel.modify !== "function") return null;

  const saved = sel.getRangeAt(0).cloneRange();
  sel.modify("move", "backward", "lineboundary");
  const lineStart = sel.getRangeAt(0).cloneRange();
  sel.modify("move", "forward", "lineboundary");
  const lineEnd = sel.getRangeAt(0).cloneRange();
  lineStart.setEnd(lineEnd.startContainer, lineEnd.startOffset);
  sel.removeAllRanges();
  sel.addRange(saved);
  return lineStart;
}

function getCurrentLineContext(root: HTMLElement): {
  line: string;
  lineStart: number;
  fullText: string;
} | null {
  const fullText = root.innerText.replace(/\r/g, "");
  const lineRange = getLineRangeAtCaret(root);
  let line = lineRange?.toString() ?? "";

  if (!line) {
    const nearOffset = getCaretTextOffset(root);
    const fallback = getLineAtTextOffset(fullText, nearOffset);
    return { line: fallback.line, lineStart: fallback.lineStart, fullText };
  }

  const lines = fullText.split("\n");
  let lineStart = 0;
  let lastMatch = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === line) lastMatch = i;
  }
  if (lastMatch >= 0) {
    lineStart = lastMatch > 0 ? lines.slice(0, lastMatch).join("\n").length + 1 : 0;
  } else {
    const nearOffset = getCaretTextOffset(root);
    const fallback = getLineAtTextOffset(fullText, nearOffset);
    lineStart = fallback.lineStart;
    line = fallback.line;
  }

  return { line, lineStart, fullText };
}

function continueManualNumberFromOne(
  root: HTMLElement,
  currentLineIndent: string,
  charsToDeleteBeforeCaret: number
): boolean {
  const ctx = findManualNumberingContext(root);
  if (ctx.maxNumber < 1) return false;

  deleteCharsBeforeCaret(charsToDeleteBeforeCaret);

  const textIndent = ctx.textIndent || currentLineIndent;
  const prefix = textIndent.length > 0 ? `${textIndent}${ctx.maxNumber + 1}. ` : `${ctx.maxNumber + 1}. `;
  document.execCommand("insertText", false, prefix);

  if (textIndent.length === 0 && ctx.referenceBlock) {
    syncBlockIndentFromReference(root, ctx.referenceBlock);
  }
  return true;
}

function replaceLinePrefixAtCaret(
  root: HTMLElement,
  prefixPattern: RegExp,
  buildPrefix: (match: RegExpMatchArray) => string
): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || typeof sel.modify !== "function") return false;

  const lineRange = getLineRangeAtCaret(root);
  if (!lineRange) return false;

  const line = lineRange.toString();
  const match = line.match(prefixPattern);
  if (!match || match.index !== 0) return false;

  sel.removeAllRanges();
  sel.addRange(lineRange);
  lineRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(lineRange);
  for (let i = 0; i < match[0].length; i++) {
    sel.modify("extend", "forward", "character");
  }
  document.execCommand("insertText", false, buildPrefix(match));
  return true;
}

function nestOlItemAsBulletSublist(root: HTMLElement, li: HTMLLIElement): Range | null {
  const prevLi = li.previousElementSibling;
  if (prevLi && prevLi.tagName === "LI") {
    let subList = prevLi.querySelector(":scope > ul");
    if (!subList) {
      subList = document.createElement("ul");
      prevLi.appendChild(subList);
    }
    subList.appendChild(li);
    const range = document.createRange();
    range.selectNodeContents(li);
    range.collapse(false);
    return range;
  }

  document.execCommand("indent");
  convertNestedOlToUl(root);
  const sel = window.getSelection();
  const nestedLi = findListItem(sel?.anchorNode ?? null, root);
  if (!nestedLi) return null;
  const range = document.createRange();
  range.selectNodeContents(nestedLi);
  range.collapse(false);
  return range;
}

const LIST_SUB_INDENT = "    ";

function deleteCharsBeforeCaret(count: number): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  sel.removeAllRanges();
  sel.addRange(range);
  sel.collapseToEnd();
  for (let i = 0; i < count; i++) {
    sel.modify("extend", "backward", "character");
  }
  if (!sel.isCollapsed) sel.deleteFromDocument();
  return true;
}

function resolveRange(
  el: HTMLElement,
  savedRange?: Range | null
): { sel: Selection; range: Range } | null {
  const sel = window.getSelection();
  if (!sel) return null;

  let range: Range | null = null;
  if (savedRange && el.contains(savedRange.commonAncestorContainer)) {
    sel.removeAllRanges();
    sel.addRange(savedRange);
    range = savedRange;
  } else if (sel.rangeCount) {
    range = sel.getRangeAt(0);
  }

  if (!range || !el.contains(range.commonAncestorContainer)) {
    return null;
  }

  return { sel, range };
}

function getBoldProbeElement(el: HTMLElement, range: Range): Element | null {
  if (range.collapsed) {
    const visibleText = (el.textContent || "").replace(/\u200B/g, "");
    if (!visibleText) return el;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      if ((textNode.textContent || "").replace(/\u200B/g, "").length > 0) {
        return textNode.parentElement;
      }
      textNode = walker.nextNode();
    }
    return el;
  }

  let node: Node | null = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }
  if (node && node.nodeType === Node.ELEMENT_NODE && el.contains(node)) {
    return node as Element;
  }
  return el;
}

function isRangeBold(el: HTMLElement, range: Range): boolean {
  const probe = getBoldProbeElement(el, range);
  if (!probe) return false;
  return isBoldFontWeight(window.getComputedStyle(probe).fontWeight);
}

function isRangeUnderlined(el: HTMLElement, range: Range): boolean {
  const probe = getBoldProbeElement(el, range);
  if (!probe) return false;
  const style = window.getComputedStyle(probe);
  return style.textDecorationLine.includes("underline") || style.textDecoration.includes("underline");
}

function FormatToggleButton({
  active,
  title,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  title: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-8 flex-1 items-center justify-center rounded-md text-[15px] font-medium transition-colors ${className} ${
        active
          ? "bg-[#e6f0ff] text-[#001f3f] dark:bg-blue-950/60 dark:text-slate-100"
          : "bg-slate-100 text-[#4a4a4a] hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

/** Apply style to selection, or at caret so following typed text uses the style. */
function applyInlineFormat(
  el: HTMLElement,
  applyStyle: (span: HTMLSpanElement) => void,
  savedRange?: Range | null,
  normalize: readonly InlineFormatProperty[] = []
): Range | null {
  const resolved = resolveRange(el, savedRange);
  if (!resolved) return null;
  const { sel, range } = resolved;

  const prepareFragment = (fragment: DocumentFragment) => {
    if (normalize.length > 0) {
      stripInlineStylesInSubtree(fragment, normalize);
    }
    if (normalize.includes("fontWeight")) {
      unwrapBoldTagsInSubtree(fragment);
    }
    if (normalize.includes("textDecoration")) {
      unwrapUnderlineTagsInSubtree(fragment);
    }
  };

  if (range.collapsed) {
    // Caret only: open a styled span so the next typed characters inherit the format.
    const span = document.createElement("span");
    applyStyle(span);
    const zwsp = document.createTextNode("\u200B");
    span.appendChild(zwsp);
    range.insertNode(span);

    const newRange = document.createRange();
    newRange.setStart(zwsp, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    return newRange.cloneRange();
  }

  const fragment = range.extractContents();
  prepareFragment(fragment);

  const span = document.createElement("span");
  applyStyle(span);
  span.appendChild(fragment);
  range.insertNode(span);

  const newRange = document.createRange();
  newRange.selectNodeContents(span);
  sel.removeAllRanges();
  sel.addRange(newRange);
  return newRange.cloneRange();
}

type TextAlign = "left" | "center" | "right";

function readSelectionAlign(): TextAlign {
  if (document.queryCommandState("justifyCenter")) return "center";
  if (document.queryCommandState("justifyRight")) return "right";
  return "left";
}

function AlignLinesIcon({ variant }: { variant: TextAlign }) {
  const shortClass =
    variant === "left"
      ? "self-start"
      : variant === "center"
        ? "self-center"
        : "self-end";

  return (
    <div className="flex h-[14px] w-[18px] flex-col justify-between py-[1px]" aria-hidden>
      <span className="block h-[1.5px] w-full rounded-full bg-current" />
      <span className={`block h-[1.5px] w-[65%] rounded-full bg-current ${shortClass}`} />
      <span className="block h-[1.5px] w-full rounded-full bg-current" />
      <span className={`block h-[1.5px] w-[65%] rounded-full bg-current ${shortClass}`} />
      <span className="block h-[1.5px] w-full rounded-full bg-current" />
    </div>
  );
}

function AlignButton({
  variant,
  active,
  title,
  onClick,
}: {
  variant: TextAlign;
  active: boolean;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-8 flex-1 items-center justify-center rounded-md transition-colors ${
        active
          ? "bg-[#e6f0ff] text-[#001f3f] dark:bg-blue-950/60 dark:text-slate-100"
          : "bg-slate-100 text-[#4a4a4a] hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
      }`}
    >
      <AlignLinesIcon variant={variant} />
    </button>
  );
}

const FormatPanel = forwardRef<
  HTMLDivElement,
  {
    compact: boolean;
    extendedFormatting?: boolean;
    panelStyle?: CSSProperties;
    currentSize: number;
    onPreserveSelection: () => void;
    onBold: () => void;
    onUnderline?: () => void;
    boldActive?: boolean;
    underlineActive?: boolean;
    onSize: (size: number) => void;
    onNudgeSize: (delta: number) => void;
    onColor: (color: string) => void;
    onAlignLeft?: () => void;
    onAlignCenter?: () => void;
    onAlignRight?: () => void;
    textAlign?: TextAlign;
    onBulletList?: () => void;
    onNumberedList?: () => void;
    onContinueNumbering?: () => void;
    mobileToolbar?: {
      minimized: boolean;
      onToggleMinimize: () => void;
      onDragHandlePointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    };
  }
>(function FormatPanel(
  {
    compact,
    extendedFormatting = false,
    panelStyle,
    currentSize,
    onPreserveSelection,
    onBold,
    onUnderline,
    boldActive = false,
    underlineActive = false,
    onSize,
    onNudgeSize,
    onColor,
    onAlignLeft,
    onAlignCenter,
    onAlignRight,
    textAlign = "left",
    onBulletList,
    onNumberedList,
    onContinueNumbering,
    mobileToolbar,
  },
  ref
) {
  const [sizeDraft, setSizeDraft] = useState(String(currentSize));
  const btnClass = compact
    ? "rounded px-1 py-0.5 text-[13px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
    : "rounded px-1.5 py-0.5 text-[15px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800";

  useEffect(() => {
    setSizeDraft(String(currentSize));
  }, [currentSize]);

  const commitSize = (raw: string) => {
    const parsed = Number.parseInt(raw.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(parsed)) {
      setSizeDraft(String(currentSize));
      return;
    }
    const next = clampFontSize(parsed);
    setSizeDraft(String(next));
    if (next !== currentSize) onSize(next);
  };

  const handleToolbarPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-panel-drag-handle]")) return;
    if (target.closest("button")) return;
    e.preventDefault();
    onPreserveSelection();
  };

  if (mobileToolbar?.minimized) {
    return (
      <div
        ref={ref}
        style={panelStyle}
        className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-800 shadow-md dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      >
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={mobileToolbar.onToggleMinimize}
          className="text-[14px] font-medium text-slate-700 dark:text-slate-200"
          title="Pokaż panel formatowania"
        >
          Formatowanie ▲
        </button>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={panelStyle}
      className={`shrink-0 rounded border border-slate-200 bg-white text-slate-800 shadow-md dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 ${
        compact ? "w-[10rem] p-1" : extendedFormatting ? "w-[11.5rem] p-1.5" : "w-[11rem] p-1.5"
      }`}
      onMouseDown={(e) => {
        // Keep contentEditable focused and selection alive while using the panel,
        // but allow the size input to take focus for typing.
        const target = e.target as HTMLElement;
        if (target.closest("input")) return;
        e.preventDefault();
        onPreserveSelection();
      }}
      onMouseUp={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("input")) return;
        e.preventDefault();
        onPreserveSelection();
      }}
    >
      {mobileToolbar ? (
        <div
          className="mb-1 flex items-center gap-1 border-b border-slate-100 pb-1 dark:border-slate-700"
          onPointerDown={handleToolbarPointerDown}
        >
          <div
            data-panel-drag-handle
            onPointerDown={mobileToolbar.onDragHandlePointerDown}
            className="flex min-w-0 flex-1 cursor-grab touch-none select-none items-center justify-center gap-1 rounded py-1 text-[10px] font-medium text-slate-400 active:cursor-grabbing"
            title="Przeciągnij panel"
            aria-label="Przeciągnij panel formatowania"
          >
            <span aria-hidden className="text-[14px] leading-none tracking-widest">
              ⠿
            </span>
            <span>Przeciągnij</span>
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={mobileToolbar.onToggleMinimize}
            className="shrink-0 rounded px-1.5 py-0.5 text-[13px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Ukryj panel formatowania"
            aria-label="Ukryj panel formatowania"
          >
            ▼
          </button>
        </div>
      ) : null}
      <div className="mb-1 grid grid-cols-2 gap-1">
        <FormatToggleButton active={boldActive} onClick={onBold} title="Pogrubienie" className="font-bold">
          B
        </FormatToggleButton>
        <FormatToggleButton
          active={underlineActive}
          onClick={onUnderline}
          title="Podkreślenie"
          className="underline"
        >
          U
        </FormatToggleButton>
      </div>

      {extendedFormatting && (
        <div className="mb-1 border-t border-slate-100 pt-1 dark:border-slate-700">
          <p className="mb-0.5 text-center text-[10px] font-medium text-slate-400">Wyrównanie</p>
          <div className="grid grid-cols-3 gap-1">
            <AlignButton
              variant="left"
              active={textAlign === "left"}
              onClick={onAlignLeft}
              title="Do lewej"
            />
            <AlignButton
              variant="center"
              active={textAlign === "center"}
              onClick={onAlignCenter}
              title="Wyśrodkuj"
            />
            <AlignButton
              variant="right"
              active={textAlign === "right"}
              onClick={onAlignRight}
              title="Do prawej"
            />
          </div>
          <div className="mt-1 grid grid-cols-3 gap-0.5">
            <button type="button" onClick={onBulletList} className={btnClass} title="Lista punktowana">
              •
            </button>
            <button type="button" onClick={onNumberedList} className={btnClass} title="Lista numerowana">
              1.
            </button>
            <button
              type="button"
              onClick={onContinueNumbering}
              className={btnClass}
              title="Kontynuuj numerowanie"
            >
              1→
            </button>
          </div>
        </div>
      )}

      <div className="mb-1 border-t border-slate-100 pt-1 dark:border-slate-700">
        <p className="mb-0.5 text-center text-[10px] font-medium text-slate-400">Rozmiar</p>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (currentSize <= MIN_FONT_SIZE) return;
              onNudgeSize(-1);
            }}
            disabled={currentSize <= MIN_FONT_SIZE}
            className={`${btnClass} min-w-[1.75rem] disabled:opacity-40`}
            title="Zmniejsz rozmiar"
            aria-label="Zmniejsz rozmiar czcionki"
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={sizeDraft}
            onFocus={() => onPreserveSelection()}
            onChange={(e) => setSizeDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
            onBlur={() => commitSize(sizeDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitSize(sizeDraft);
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSizeDraft(String(currentSize));
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                onNudgeSize(1);
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                onNudgeSize(-1);
              }
            }}
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1 py-0.5 text-center text-[15px] tabular-nums text-slate-800 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            title="Rozmiar czcionki (px)"
            aria-label="Rozmiar czcionki"
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (currentSize >= MAX_FONT_SIZE) return;
              onNudgeSize(1);
            }}
            disabled={currentSize >= MAX_FONT_SIZE}
            className={`${btnClass} min-w-[1.75rem] disabled:opacity-40`}
            title="Zwiększ rozmiar"
            aria-label="Zwiększ rozmiar czcionki"
          >
            +
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-1 dark:border-slate-700">
        <p className="mb-0.5 text-center text-[10px] font-medium text-slate-400">Kolor</p>
        <div className="grid grid-cols-7 gap-0.5">
          {TEXT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onColor(c.value)}
              className="aspect-square w-full min-w-0 rounded border border-slate-200 hover:ring-1 hover:ring-blue-400 dark:border-slate-600"
              style={{ backgroundColor: c.value }}
              title={c.label}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

export function FormattedEditor({
  value,
  onChange,
  multiline = false,
  placeholder,
  className = "",
  compact = false,
  extendedFormatting = false,
  fontSize = DEFAULT_FONT_SIZE,
  color,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  extendedFormatting?: boolean;
  fontSize?: number;
  color?: string;
}) {
  const { theme } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectionRangeRef = useRef<Range | null>(null);
  const formattingRef = useRef(false);
  const emitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focused, setFocused] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePanelMinimized, setMobilePanelMinimized] = useState(false);
  const mobilePanelPosRef = useRef<MobilePanelPoint | null>(null);
  const mobilePanelPosManualRef = useRef(false);
  const mobilePanelDragRef = useRef<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    panelTop: number;
    panelLeft: number;
  } | null>(null);
  const [selectionFontSize, setSelectionFontSize] = useState(fontSize);
  const [selectionAlign, setSelectionAlign] = useState<TextAlign>("left");
  const [selectionBold, setSelectionBold] = useState(false);
  const [selectionUnderline, setSelectionUnderline] = useState(false);
  const selectionFontSizeRef = useRef(fontSize);
  selectionFontSizeRef.current = selectionFontSize;

  // Display: white↔black swap with theme; keep other colors. While editing, keep DOM as-is.
  const displayHtml = adaptHtmlColorsForTheme(value || "", theme);

  const preserveSelection = useCallback(() => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    selectionRangeRef.current = range.cloneRange();
  }, []);

  const updateSelectionState = useCallback(() => {
    if (formattingRef.current) return;
    const el = ref.current;
    if (!el) {
      selectionRangeRef.current = null;
      return;
    }

    const sel = window.getSelection();
    if (sel?.rangeCount && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const range = sel.getRangeAt(0);
      selectionRangeRef.current = range.cloneRange();
      const probe = getBoldProbeElement(el, range);
      const parsed = probe
        ? parseFontSizePx(window.getComputedStyle(probe).fontSize)
        : null;
      setSelectionFontSize(parsed ?? fontSize);
      setSelectionAlign(readSelectionAlign());
      setSelectionBold(isRangeBold(el, range));
      setSelectionUnderline(isRangeUnderlined(el, range));
    }
    // Keep last caret/selection when focus moves to the format panel
  }, [fontSize]);

  const keepSelection = useCallback((range: Range | null) => {
    if (!range) return;
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    if (!el.contains(range.commonAncestorContainer)) return;
    sel.removeAllRanges();
    sel.addRange(range);
    selectionRangeRef.current = range.cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    keepSelection(selectionRangeRef.current);
    return Boolean(selectionRangeRef.current);
  }, [keepSelection]);

  const updatePanelPosition = useCallback((options?: { recomputeBase?: boolean }) => {
    const el = ref.current;
    const panel = panelRef.current;
    const { top, left, width, height } = getVisualViewportBox();
    const mobile = isMobileViewport(width);
    const minimized = mobile && mobilePanelMinimized;
    const panelHeight = minimized
      ? 44
      : (panel?.offsetHeight ?? (mobile ? 220 : 280));
    const panelWidth = minimized
      ? panel?.offsetWidth ?? 140
      : (panel?.offsetWidth ?? (compact ? 160 : extendedFormatting ? 184 : 176));
    const gap = VIEWPORT_MARGIN;

    if (mobile) {
      const maxWidth = width - gap * 2;
      const resolvedWidth = minimized
        ? undefined
        : Math.min(panelWidth, maxWidth);
      const viewportBottom = top + height;
      const bottomAnchoredTop = viewportBottom - panelHeight - gap;

      if (minimized) {
        setPanelStyle({
          position: "fixed",
          top: bottomAnchoredTop,
          left: left + width / 2,
          width: resolvedWidth,
          right: "auto",
          transform: "translateX(-50%)",
          zIndex: 9999,
        });
        return;
      }

      const widthForClamp = resolvedWidth ?? panelWidth;
      let panelPoint: MobilePanelPoint;

      if (
        mobilePanelPosRef.current &&
        (!options?.recomputeBase || mobilePanelPosManualRef.current)
      ) {
        panelPoint = clampMobilePanelPosition(
          mobilePanelPosRef.current,
          widthForClamp,
          panelHeight,
          top,
          left,
          width,
          height,
          gap
        );
      } else if (el) {
        const editorRect = el.getBoundingClientRect();
        const caretRect = getCaretClientRect(el);
        const idealTop = computeIdealMobilePanelTop(
          top,
          viewportBottom,
          panelHeight,
          editorRect,
          caretRect,
          gap
        );
        panelPoint = clampMobilePanelPosition(
          { top: idealTop, left: left + (width - widthForClamp) / 2 },
          widthForClamp,
          panelHeight,
          top,
          left,
          width,
          height,
          gap
        );
        if (!mobilePanelPosManualRef.current) {
          mobilePanelPosRef.current = panelPoint;
        }
      } else {
        panelPoint = clampMobilePanelPosition(
          { top: bottomAnchoredTop, left: left + (width - widthForClamp) / 2 },
          widthForClamp,
          panelHeight,
          top,
          left,
          width,
          height,
          gap
        );
      }

      mobilePanelPosRef.current = panelPoint;

      setPanelStyle({
        position: "fixed",
        top: panelPoint.top,
        left: panelPoint.left,
        width: resolvedWidth,
        right: "auto",
        transform: "none",
        zIndex: 9999,
        maxHeight: Math.max(120, height - gap * 3),
        overflowY: "auto",
      });
      return;
    }

    // Desktop: dock on the right; keep the field left of the panel when possible.
    let panelTop = top + height / 2;
    if (el) {
      const editorRect = el.getBoundingClientRect();
      const editorCenter = editorRect.top + editorRect.height / 2;
      const minTop = top + gap + panelHeight / 2;
      const maxTop = top + height - gap - panelHeight / 2;
      panelTop = Math.min(maxTop, Math.max(minTop, editorCenter));
    }

    setPanelStyle({
      position: "fixed",
      top: panelTop,
      right: gap,
      left: "auto",
      transform: "translateY(-50%)",
      zIndex: 9999,
      maxHeight: height - gap * 2,
      overflowY: "auto",
    });
  }, [compact, extendedFormatting, mobilePanelMinimized]);

  const applyMobilePanelPoint = useCallback((point: MobilePanelPoint) => {
    const panel = panelRef.current;
    const { top, left, width, height } = getVisualViewportBox();
    const panelHeight = panel?.offsetHeight ?? 220;
    const panelWidth = panel?.offsetWidth ?? 176;
    const clamped = clampMobilePanelPosition(
      point,
      panelWidth,
      panelHeight,
      top,
      left,
      width,
      height,
      VIEWPORT_MARGIN
    );
    mobilePanelPosRef.current = clamped;
    setPanelStyle((prev) => ({
      ...prev,
      top: clamped.top,
      left: clamped.left,
      transform: "none",
    }));
  }, []);

  useLayoutEffect(() => {
    const syncMobile = () => setIsMobile(isMobileViewport(window.innerWidth));
    syncMobile();
    window.addEventListener("resize", syncMobile);
    return () => window.removeEventListener("resize", syncMobile);
  }, []);

  useEffect(() => {
    // Never clobber DOM while the user is editing or applying formats.
    if (focused || formattingRef.current) return;
    const el = ref.current;
    if (!el) return;
    const next = displayHtml;
    if (el.innerHTML !== next) {
      el.innerHTML = next;
    }
  }, [displayHtml, focused]);

  useEffect(() => {
    if (!focused) return;
    const handleSelectionChange = () => updateSelectionState();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [focused, updateSelectionState]);

  useLayoutEffect(() => {
    if (!focused) return;

    const reposition = (recomputeBase = false) => {
      updatePanelPosition({ recomputeBase });
    };

    reposition(true);
    const raf = requestAnimationFrame(() => reposition(true));

    const vv = window.visualViewport;
    const onViewportResize = () => {
      if (mobilePanelPosManualRef.current && mobilePanelPosRef.current) {
        applyMobilePanelPoint(mobilePanelPosRef.current);
        return;
      }
      reposition(true);
    };
    vv?.addEventListener("resize", onViewportResize);

    const onWindowResize = () => {
      const mobile = isMobileViewport(window.innerWidth);
      reposition(mobile);
    };
    window.addEventListener("resize", onWindowResize);

    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", onViewportResize);
      window.removeEventListener("resize", onWindowResize);
    };
  }, [focused, updatePanelPosition, mobilePanelMinimized, applyMobilePanelPoint]);

  const emitNow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML === "<br>" ? "" : el.innerHTML;
    // Persist editor HTML including user-chosen colors/sizes.
    // Avoid storing literal &nbsp; entities that later show up in plain-text UI.
    onChange(html.replace(/&nbsp;/gi, " ").replace(/&#160;/g, " "));
  }, [onChange]);

  const emit = useCallback(
    (immediate = false) => {
      if (emitTimerRef.current) {
        clearTimeout(emitTimerRef.current);
        emitTimerRef.current = null;
      }
      if (immediate) {
        emitNow();
        return;
      }
      // Debounce live typing so we do not flood save/API on every keystroke.
      emitTimerRef.current = setTimeout(() => {
        emitTimerRef.current = null;
        emitNow();
      }, 350);
    },
    [emitNow]
  );

  useEffect(() => {
    return () => {
      if (emitTimerRef.current) clearTimeout(emitTimerRef.current);
    };
  }, []);

  const finishFormatting = useCallback((range?: Range | null) => {
    // Collapse to end so the highlight does not stick and block further clicks.
    if (range) {
      try {
        range.collapse(false);
      } catch {
        /* detached range after DOM sync — ignore */
      }
      keepSelection(range);
    }
    requestAnimationFrame(() => {
      formattingRef.current = false;
      const el = ref.current;
      if (!el) return;
      el.focus();
      if (range) {
        try {
          keepSelection(range);
        } catch {
          /* ignore */
        }
      }
      updateSelectionState();
    });
  }, [keepSelection, updateSelectionState]);

  const execBold = () => {
    const el = ref.current;
    if (!el) return;
    formattingRef.current = true;
    preserveSelection();
    el.focus();
    restoreSelection();

    const resolved = resolveRange(el, selectionRangeRef.current);
    if (!resolved) {
      formattingRef.current = false;
      return;
    }

    const turnOff = isRangeBold(el, resolved.range);
    const nextRange = applyInlineFormat(
      el,
      (span) => {
        span.style.fontWeight = turnOff ? "normal" : "bold";
      },
      selectionRangeRef.current,
      ["fontWeight"]
    );
    if (!nextRange) {
      formattingRef.current = false;
      return;
    }
    emit(true);
    finishFormatting(nextRange);
  };

  const execUnderline = () => {
    const el = ref.current;
    if (!el) return;
    formattingRef.current = true;
    preserveSelection();
    el.focus();
    restoreSelection();

    const resolved = resolveRange(el, selectionRangeRef.current);
    if (!resolved) {
      formattingRef.current = false;
      return;
    }

    const turnOff = isRangeUnderlined(el, resolved.range);
    const nextRange = applyInlineFormat(
      el,
      (span) => {
        span.style.textDecoration = turnOff ? "none" : "underline";
      },
      selectionRangeRef.current,
      ["textDecoration"]
    );
    if (!nextRange) {
      formattingRef.current = false;
      return;
    }
    emit(true);
    finishFormatting(nextRange);
  };

  const applySize = (size: number) => {
    const el = ref.current;
    if (!el) return;
    const nextSize = clampFontSize(size);
    formattingRef.current = true;
    preserveSelection();
    el.focus();

    const sel = window.getSelection();
    let range =
      selectionRangeRef.current && el.contains(selectionRangeRef.current.commonAncestorContainer)
        ? selectionRangeRef.current
        : null;

    if (!range && sel?.rangeCount && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0).cloneRange();
    }

    const hasVisibleText = (el.textContent || "").replace(/\u200B/g, "").length > 0;

    // No selection / caret only: resize the whole field contents (Word-like for short fields).
    if (hasVisibleText && (!range || range.collapsed)) {
      const all = document.createRange();
      all.selectNodeContents(el);
      range = all;
    }

    if (!range) {
      // Empty field: prepare style for the next typed characters.
      const caret = document.createRange();
      caret.selectNodeContents(el);
      caret.collapse(true);
      range = caret;
    }

    selectionRangeRef.current = range.cloneRange();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }

    const nextRange = applyInlineFormat(
      el,
      (span) => {
        span.style.fontSize = `${nextSize}px`;
      },
      selectionRangeRef.current,
      ["fontSize"]
    );
    if (!nextRange) {
      formattingRef.current = false;
      return;
    }
    setSelectionFontSize(nextSize);
    selectionFontSizeRef.current = nextSize;
    emit(true);
    finishFormatting(nextRange);
  };

  const nudgeFontSize = (delta: number) => {
    applySize(selectionFontSizeRef.current + delta);
  };

  const applyColor = (nextColor: string) => {
    const el = ref.current;
    if (!el) return;
    formattingRef.current = true;
    preserveSelection();
    el.focus();
    restoreSelection();
    // Apply the chosen color as-is (user intent). Theme adaptation is display-only when blurred.
    const nextRange = applyInlineFormat(
      el,
      (span) => {
        span.style.color = nextColor;
      },
      selectionRangeRef.current,
      ["color"]
    );
    if (!nextRange) {
      formattingRef.current = false;
      return;
    }
    emit(true);
    finishFormatting(nextRange);
  };

  const execBlockCommand = useCallback(
    (command: string) => {
      const el = ref.current;
      if (!el) return;
      formattingRef.current = true;
      preserveSelection();
      el.focus();
      restoreSelection();
      document.execCommand(command, false);
      emit(true);
      finishFormatting(selectionRangeRef.current);
    },
    [emit, finishFormatting, preserveSelection, restoreSelection]
  );

  const insertManualNumberPrefix = useCallback(
    (prefix: string) => {
      document.execCommand("insertText", false, prefix);
      emit(true);
      updateSelectionState();
    },
    [emit, updateSelectionState]
  );

  const execContinueManualNumbering = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();

    const sel = window.getSelection();
    if (sel?.anchorNode && isInOrderedListItem(sel.anchorNode, el)) {
      execBlockCommand("insertOrderedList");
      return;
    }

    const ctx = getCurrentLineContext(el);
    if (!ctx) return;
    const { line } = ctx;
    const current = line.match(MANUAL_NUMBER_LINE);
    const numCtx = findManualNumberingContext(el);

    formattingRef.current = true;

    if (current) {
      const [, indent, numStr, rest] = current;
      const num = Number(numStr);
      const hasContent = rest.trim().length > 0;
      if (!hasContent && num === 1 && numCtx.maxNumber >= 1) {
        continueManualNumberFromOne(el, indent, 2);
      } else {
        insertManualNumberPrefix(`\n${indent}${num + 1}. `);
      }
    } else {
      const indent = numCtx.textIndent || (line.match(/^(\s*)/)?.[1] ?? "");
      const nextNum = numCtx.maxNumber + 1;
      insertManualNumberPrefix(`${line.length > 0 ? "\n" : ""}${indent}${nextNum}. `);
      if (indent.length === 0 && numCtx.referenceBlock) {
        syncBlockIndentFromReference(el, numCtx.referenceBlock);
      }
    }

    formattingRef.current = false;
  }, [execBlockCommand, insertManualNumberPrefix]);

  const handleManualNumberKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!extendedFormatting || !multiline) return false;
      const el = ref.current;
      if (!el) return false;

      const sel = window.getSelection();
      if (!sel?.rangeCount || !sel.isCollapsed) return false;
      if (isInOrderedListItem(sel.anchorNode ?? el, el)) return false;

      const ctx = getCurrentLineContext(el);
      if (!ctx) return false;
      const { line } = ctx;

      if (e.key === "Enter" && !e.shiftKey) {
        const match = line.match(MANUAL_NUMBER_LINE);
        if (!match || !match[3].trim()) return false;
        e.preventDefault();
        const nextNum = Number(match[2]) + 1;
        insertManualNumberPrefix(`\n${match[1]}${nextNum}. `);
        if (match[1].length === 0) {
          const ref = findLastNumberedLineBlock(el);
          if (ref) {
            requestAnimationFrame(() => syncBlockIndentFromReference(el, ref));
          }
        }
        return true;
      }

      if (e.key === ".") {
        const restart = line.match(/^(\s*)1$/);
        if (!restart) return false;
        e.preventDefault();
        if (continueManualNumberFromOne(el, restart[1], 1)) {
          emit(true);
          updateSelectionState();
          return true;
        }
        document.execCommand("insertText", false, ".");
        emit(true);
        updateSelectionState();
        return true;
      }

      if (e.key === " ") {
        const restart = line.match(/^(\s*)1\.$/);
        if (!restart) return false;
        e.preventDefault();
        if (continueManualNumberFromOne(el, restart[1], 2)) {
          emit(true);
          updateSelectionState();
          return true;
        }
        document.execCommand("insertText", false, " ");
        emit(true);
        updateSelectionState();
        return true;
      }

      return false;
    },
    [extendedFormatting, multiline, insertManualNumberPrefix, emit, updateSelectionState]
  );

  const tryAutoContinueManualNumbering = useCallback(() => {
    const el = ref.current;
    if (!el || !extendedFormatting || !multiline || formattingRef.current) return;

    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return;
    if (isInOrderedListItem(sel.anchorNode ?? el, el)) return;

    const lineRange = getLineRangeAtCaret(el);
    if (!lineRange) return;
    const line = lineRange.toString();
    const restart = line.match(/^(\s*)1\.$/);
    if (!restart) return;
    if (findMaxManualNumberBeforeCurrentLine(el) < 1) return;

    formattingRef.current = true;
    if (continueManualNumberFromOne(el, restart[1], 2)) {
      emit(true);
      requestAnimationFrame(() => {
        formattingRef.current = false;
        updateSelectionState();
      });
    } else {
      formattingRef.current = false;
    }
  }, [extendedFormatting, multiline, emit, updateSelectionState]);

  const handleListTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!extendedFormatting || !multiline || e.key !== "Tab") return false;
      const el = ref.current;
      if (!el) return false;

      if (e.shiftKey) {
        e.preventDefault();
        execBlockCommand("outdent");
        return true;
      }

      const sel = window.getSelection();
      const anchor = sel?.anchorNode;
      if (!anchor) return false;

      const li = findListItem(anchor, el);
      const parentList = li?.parentElement;

      if (parentList?.tagName === "OL") {
        e.preventDefault();
        formattingRef.current = true;
        preserveSelection();
        el.focus();
        restoreSelection();
        const nextRange = li ? nestOlItemAsBulletSublist(el, li) : null;
        emit(true);
        finishFormatting(nextRange);
        return true;
      }

      if (parentList?.tagName === "UL") {
        e.preventDefault();
        execBlockCommand("indent");
        return true;
      }

      if (
        replaceLinePrefixAtCaret(el, /^(\s*\d+\.\s*)/, (match) => {
          const indent = match[1].match(/^(\s*)/)?.[1] ?? "";
          return `${indent}${LIST_SUB_INDENT}• `;
        })
      ) {
        e.preventDefault();
        formattingRef.current = true;
        emit(true);
        finishFormatting(selectionRangeRef.current);
        return true;
      }

      if (
        replaceLinePrefixAtCaret(el, /^(\s*•\s*)/, (match) => {
          const indent = match[1].match(/^(\s*)/)?.[1] ?? "";
          return `${indent}${LIST_SUB_INDENT}• `;
        })
      ) {
        e.preventDefault();
        formattingRef.current = true;
        emit(true);
        finishFormatting(selectionRangeRef.current);
        return true;
      }

      e.preventDefault();
      execBlockCommand("indent");
      return true;
    },
    [
      extendedFormatting,
      multiline,
      execBlockCommand,
      emit,
      finishFormatting,
      preserveSelection,
      restoreSelection,
    ]
  );

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.clipboardData.getData("text/plain");
    if (!raw) return;

    // Paste as plain text so it inherits the field's font size / color
    const plain = multiline
      ? raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
      : raw.replace(/[\r\n]+/g, " ").replace(/[ \t]+/g, " ");

    document.execCommand("insertText", false, plain);
    emit(true);
    updateSelectionState();
  };

  const handleBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && (wrapperRef.current?.contains(next) || panelRef.current?.contains(next))) return;
    setFocused(false);
    setMobilePanelMinimized(false);
    mobilePanelPosRef.current = null;
    mobilePanelPosManualRef.current = false;
    mobilePanelDragRef.current = null;
    selectionRangeRef.current = null;
    emit(true);
  };

  const handleDragHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      preserveSelection();

      const panel = panelRef.current;
      const handle = e.currentTarget;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      mobilePanelDragRef.current = {
        pointerId: e.pointerId,
        pointerX: e.clientX,
        pointerY: e.clientY,
        panelTop: rect.top,
        panelLeft: rect.left,
      };
      handle.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const drag = mobilePanelDragRef.current;
        if (!drag || ev.pointerId !== drag.pointerId) return;
        ev.preventDefault();
        applyMobilePanelPoint({
          top: drag.panelTop + (ev.clientY - drag.pointerY),
          left: drag.panelLeft + (ev.clientX - drag.pointerX),
        });
      };

      const onEnd = (ev: PointerEvent) => {
        const drag = mobilePanelDragRef.current;
        if (!drag || ev.pointerId !== drag.pointerId) return;
        mobilePanelDragRef.current = null;
        mobilePanelPosManualRef.current = true;
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onEnd);
        handle.removeEventListener("pointercancel", onEnd);
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onEnd);
      handle.addEventListener("pointercancel", onEnd);
    },
    [applyMobilePanelPoint, preserveSelection]
  );

  const toggleMobilePanelMinimized = useCallback(() => {
    setMobilePanelMinimized((current) => !current);
  }, []);

  const panel =
    focused && typeof document !== "undefined"
      ? createPortal(
          <FormatPanel
            ref={panelRef}
            compact={compact}
            extendedFormatting={extendedFormatting}
            panelStyle={panelStyle}
            currentSize={selectionFontSize}
            onPreserveSelection={preserveSelection}
            onBold={execBold}
            onUnderline={execUnderline}
            boldActive={selectionBold}
            underlineActive={selectionUnderline}
            onSize={applySize}
            onNudgeSize={nudgeFontSize}
            onColor={applyColor}
            onAlignLeft={() => execBlockCommand("justifyLeft")}
            onAlignCenter={() => execBlockCommand("justifyCenter")}
            onAlignRight={() => execBlockCommand("justifyRight")}
            textAlign={selectionAlign}
            onBulletList={() => execBlockCommand("insertUnorderedList")}
            onNumberedList={() => execBlockCommand("insertOrderedList")}
            onContinueNumbering={execContinueManualNumbering}
            mobileToolbar={
              isMobile
                ? {
                    minimized: mobilePanelMinimized,
                    onToggleMinimize: toggleMobilePanelMinimized,
                    onDragHandlePointerDown: handleDragHandlePointerDown,
                  }
                : undefined
            }
          />,
          document.body
        )
      : null;

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={multiline}
        onFocus={() => {
          mobilePanelPosRef.current = null;
          mobilePanelPosManualRef.current = false;
          setFocused(true);
          updateSelectionState();
          requestAnimationFrame(() => {
            updatePanelPosition({ recomputeBase: true });
          });
        }}
        onBlur={handleBlur}
        onPaste={handlePaste}
        onInput={() => {
          tryAutoContinueManualNumbering();
          // Compact patient cells: persist immediately so background sync cannot wipe typing.
          emit(compact);
        }}
        onKeyDown={(e) => {
          if (handleManualNumberKeyDown(e)) return;
          if (handleListTabKeyDown(e)) return;
        }}
        onMouseUp={() => {
          updateSelectionState();
        }}
        onKeyUp={() => {
          tryAutoContinueManualNumbering();
          updateSelectionState();
        }}
        data-placeholder={placeholder}
        style={{ fontSize: `${fontSize}px`, color: color ?? "var(--foreground)" }}
        className={`formatted-editor min-w-0 outline-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] ${
          multiline
            ? `min-h-[1.5em] break-words ${extendedFormatting ? "whitespace-normal" : "whitespace-pre-wrap"}`
            : "min-h-[1.25em] overflow-hidden whitespace-nowrap"
        } ${className}`}
      />

      {panel}
    </div>
  );
}
