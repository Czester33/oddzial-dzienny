const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "tel",
  "url",
  "email",
  "password",
  "number",
]);

export type ArrowNavKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export function isArrowNavKey(key: string): key is ArrowNavKey {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight"
  );
}

function isVisible(el: HTMLElement): boolean {
  if (el.closest("[hidden], [aria-hidden='true']")) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  return el.getClientRects().length > 0;
}

export function isTextFieldElement(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.closest("[data-no-arrow-nav]")) return false;

  if (el.isContentEditable) {
    return el.getAttribute("contenteditable") !== "false" && isVisible(el);
  }

  if (el instanceof HTMLTextAreaElement) {
    return !el.disabled && !el.readOnly && isVisible(el);
  }

  if (el instanceof HTMLInputElement) {
    const type = (el.type || "text").toLowerCase();
    return TEXT_INPUT_TYPES.has(type) && !el.disabled && !el.readOnly && isVisible(el);
  }

  return false;
}

export function collectTextFields(root: ParentNode = document): HTMLElement[] {
  const nodes = root.querySelectorAll("input, textarea, [contenteditable='true']");
  return Array.from(nodes).filter((el): el is HTMLElement => isTextFieldElement(el));
}

function hasTextSelection(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.selectionStart !== el.selectionEnd;
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  if (!el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return false;
  return !sel.isCollapsed;
}

function caretOffsetInInput(el: HTMLInputElement | HTMLTextAreaElement): number {
  return el.selectionStart ?? 0;
}

function isCaretAtStart(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return caretOffsetInInput(el) === 0;
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return true;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().replace(/\u200B/g, "").length === 0;
}

function isCaretAtEnd(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return caretOffsetInInput(el) === el.value.length;
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return true;
  const post = range.cloneRange();
  post.selectNodeContents(el);
  post.setStart(range.endContainer, range.endOffset);
  return post.toString().replace(/\u200B/g, "").length === 0;
}

function isMultilineField(el: HTMLElement): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return false;
  if (el.isContentEditable) {
    return el.getAttribute("aria-multiline") === "true";
  }
  return false;
}

function getCaretRect(el: HTMLElement): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  if (!el.contains(range.startContainer)) return null;
  range.collapse(true);
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[0];

  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  range.insertNode(marker);
  const rect = marker.getBoundingClientRect();
  marker.parentNode?.removeChild(marker);
  sel.removeAllRanges();
  sel.addRange(range);
  return rect.width || rect.height ? rect : null;
}

function isCaretOnFirstLine(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) return true;
  if (el instanceof HTMLTextAreaElement) {
    const pos = caretOffsetInInput(el);
    return el.value.lastIndexOf("\n", Math.max(0, pos - 1)) === -1;
  }
  const caret = getCaretRect(el);
  if (!caret) return true;
  const probe = document.createRange();
  probe.selectNodeContents(el);
  const first = probe.getClientRects()[0];
  if (!first) return true;
  return Math.abs(caret.top - first.top) < 6;
}

function isCaretOnLastLine(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) return true;
  if (el instanceof HTMLTextAreaElement) {
    const pos = caretOffsetInInput(el);
    return el.value.indexOf("\n", pos) === -1;
  }
  const caret = getCaretRect(el);
  if (!caret) return true;
  const probe = document.createRange();
  probe.selectNodeContents(el);
  const rects = probe.getClientRects();
  const last = rects[rects.length - 1];
  if (!last) return true;
  return Math.abs(caret.top - last.top) < 6;
}

/** Whether arrow should leave the current field (caret at edge / line). */
export function shouldLeaveTextField(el: HTMLElement, key: ArrowNavKey): boolean {
  if (hasTextSelection(el)) return false;

  if (key === "ArrowLeft") return isCaretAtStart(el);
  if (key === "ArrowRight") return isCaretAtEnd(el);

  if (!isMultilineField(el)) return true;

  if (key === "ArrowUp") return isCaretOnFirstLine(el);
  return isCaretOnLastLine(el);
}

function overlapsHorizontally(a: DOMRect, b: DOMRect): boolean {
  return Math.min(a.right, b.right) > Math.max(a.left, b.left);
}

function overlapsVertically(a: DOMRect, b: DOMRect): boolean {
  return Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
}

function center(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function findNeighborTextField(
  current: HTMLElement,
  key: ArrowNavKey
): HTMLElement | null {
  const fields = collectTextFields().filter((el) => el !== current);
  if (fields.length === 0) return null;

  const cur = current.getBoundingClientRect();
  const c = center(cur);

  if (key === "ArrowUp" || key === "ArrowDown") {
    const goingDown = key === "ArrowDown";
    const column = fields.filter((el) => overlapsHorizontally(cur, el.getBoundingClientRect()));
    const pool = column.length > 0 ? column : fields;

    let best: HTMLElement | null = null;
    let bestDy = Infinity;
    let bestDx = Infinity;

    for (const el of pool) {
      const r = el.getBoundingClientRect();
      const p = center(r);
      const dy = goingDown ? p.y - c.y : c.y - p.y;
      if (dy <= 2) continue;
      const dx = Math.abs(p.x - c.x);
      if (dy < bestDy - 0.5 || (Math.abs(dy - bestDy) < 0.5 && dx < bestDx)) {
        best = el;
        bestDy = dy;
        bestDx = dx;
      }
    }
    return best;
  }

  const goingRight = key === "ArrowRight";
  const row = fields.filter((el) => overlapsVertically(cur, el.getBoundingClientRect()));
  const pool = row.length > 0 ? row : fields;

  let best: HTMLElement | null = null;
  let bestDx = Infinity;
  let bestDy = Infinity;

  for (const el of pool) {
    const r = el.getBoundingClientRect();
    const p = center(r);
    const dx = goingRight ? p.x - c.x : c.x - p.x;
    if (dx <= 2) continue;
    const dy = Math.abs(p.y - c.y);
    if (dx < bestDx - 0.5 || (Math.abs(dx - bestDx) < 0.5 && dy < bestDy)) {
      best = el;
      bestDx = dx;
      bestDy = dy;
    }
  }
  return best;
}

function placeCaret(el: HTMLElement, where: "start" | "end") {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    const pos = where === "start" ? 0 : el.value.length;
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      // some input types may reject selection
    }
    return;
  }

  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(where === "start");
  sel.removeAllRanges();
  sel.addRange(range);
}

export function focusTextField(el: HTMLElement, fromKey: ArrowNavKey) {
  const where: "start" | "end" =
    fromKey === "ArrowLeft" || fromKey === "ArrowUp" ? "end" : "start";
  placeCaret(el, where);
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}
