"use client";

import {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  forwardRef,
  type CSSProperties,
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
  type InlineFormatProperty,
} from "@/lib/text-format";
import { useTheme } from "@/context/ThemeContext";

const VIEWPORT_MARGIN = 12;

function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

function parseFontSizePx(value: string): number | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
  if (!match) return null;
  return clampFontSize(Number(match[1]));
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

const FormatPanel = forwardRef<
  HTMLDivElement,
  {
    compact: boolean;
    panelStyle?: CSSProperties;
    currentSize: number;
    onPreserveSelection: () => void;
    onBold: () => void;
    onSize: (size: number) => void;
    onNudgeSize: (delta: number) => void;
    onColor: (color: string) => void;
  }
>(function FormatPanel(
  { compact, panelStyle, currentSize, onPreserveSelection, onBold, onSize, onNudgeSize, onColor },
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

  return (
    <div
      ref={ref}
      style={panelStyle}
      className={`shrink-0 rounded border border-slate-200 bg-white text-slate-800 shadow-md dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 ${
        compact ? "w-[10rem] p-1" : "w-[11rem] p-1.5"
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
      <button
        type="button"
        onClick={onBold}
        className={`${btnClass} mb-1 w-full font-bold`}
        title="Pogrubienie"
      >
        B
      </button>

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
  fontSize = DEFAULT_FONT_SIZE,
  color,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  compact?: boolean;
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
  const [selectionFontSize, setSelectionFontSize] = useState(fontSize);
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

  const updatePanelPosition = useCallback(() => {
    // Dock on the right edge of the viewport so it never covers the edited field.
    setPanelStyle({
      position: "fixed",
      top: "50%",
      right: VIEWPORT_MARGIN,
      left: "auto",
      transform: "translateY(-50%)",
      zIndex: 9999,
    });
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
    updatePanelPosition();
  }, [focused, updatePanelPosition]);

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
    selectionRangeRef.current = null;
    emit(true);
  };

  const panel =
    focused && typeof document !== "undefined"
      ? createPortal(
          <FormatPanel
            ref={panelRef}
            compact={compact}
            panelStyle={panelStyle}
            currentSize={selectionFontSize}
            onPreserveSelection={preserveSelection}
            onBold={execBold}
            onSize={applySize}
            onNudgeSize={nudgeFontSize}
            onColor={applyColor}
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
          setFocused(true);
          updatePanelPosition();
          updateSelectionState();
        }}
        onBlur={handleBlur}
        onPaste={handlePaste}
        onInput={() => emit()}
        onMouseUp={updateSelectionState}
        onKeyUp={updateSelectionState}
        data-placeholder={placeholder}
        style={{ fontSize: `${fontSize}px`, color: color ?? "var(--foreground)" }}
        className={`formatted-editor min-w-0 outline-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] ${
          multiline ? "min-h-[1.5em] whitespace-pre-wrap break-words" : "min-h-[1.25em] overflow-hidden whitespace-nowrap"
        } ${className}`}
      />

      {panel}
    </div>
  );
}
