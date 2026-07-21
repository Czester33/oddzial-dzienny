/** Decode common HTML entities (also when there are no tags). */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

/** Replace NBSP entities/chars in HTML without stripping tags. */
export function replaceNbspInHtml(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/\u00a0/g, " ");
}

/** Strip HTML tags for plain display */
export function stripHtml(html: string): string {
  if (!html) return "";
  const withoutTags = html.includes("<")
    ? html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
    : html;
  return decodeHtmlEntities(withoutTags).trim();
}

export function isHtmlContent(value: string): boolean {
  return /<[^>]+>/.test(value);
}

export const DEFAULT_FONT_SIZE = 19;

export const FONT_SIZES = [13, 15, 17, 19, 21] as const;

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 72;

export const DEFAULT_TEXT_COLOR = "#0f172a";
export const DEFAULT_DARK_TEXT_COLOR = "#e2e8f0";
/** Vivid red for dark backgrounds (Tailwind red-500, readable on slate-900). */
export const DEFAULT_DARK_RED_TEXT_COLOR = "#ef4444";
/** Standard saturated red for light backgrounds (Tailwind red-600). */
export const DEFAULT_LIGHT_RED_TEXT_COLOR = "#dc2626";

export const TEXT_COLORS = [
  { label: "Biały", value: "#e2e8f0" },
  { label: "Czarny", value: "#000000" },
  { label: "Czerwony", value: "#e40303" },
  { label: "Czerwień–pomarańcz", value: "#ff4000" },
  { label: "Pomarańczowy", value: "#ff8c00" },
  { label: "Złoty", value: "#ffbf00" },
  { label: "Żółty", value: "#ffed00" },
  { label: "Limonkowy", value: "#80ff00" },
  { label: "Zielony", value: "#00c853" },
  { label: "Wiosenny zielony", value: "#00ff80" },
  { label: "Cyjan", value: "#00ffff" },
  { label: "Błękitny", value: "#0080ff" },
  { label: "Niebieski", value: "#004dff" },
  { label: "Indygo", value: "#4b0082" },
  { label: "Fioletowy", value: "#8b00ff" },
  { label: "Magenta", value: "#ff00bf" },
] as const;

export type InlineFormatProperty = "fontSize" | "color" | "fontWeight";

export function parseCssColorToRgb(
  value: string
): { r: number; g: number; b: number } | null {
  const trimmed = value.trim().toLowerCase();
  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return {
      r: Number.parseInt(h.slice(0, 2), 16),
      g: Number.parseInt(h.slice(2, 4), 16),
      b: Number.parseInt(h.slice(4, 6), 16),
    };
  }
  const rgb = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }
  return null;
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b)
  );
}

function isNearWhite(rgb: { r: number; g: number; b: number }): boolean {
  return relativeLuminance(rgb) >= 0.8;
}

function isNearBlack(rgb: { r: number; g: number; b: number }): boolean {
  return relativeLuminance(rgb) <= 0.12;
}

function isReddish(rgb: { r: number; g: number; b: number }): boolean {
  return rgb.r >= 160 && rgb.r > rgb.g + 30 && rgb.r > rgb.b + 30;
}

/** Washed-out reds (e.g. red-300/400 tints) look too faint on both themes. */
function isWashedOutRed(rgb: { r: number; g: number; b: number }): boolean {
  return isReddish(rgb) && relativeLuminance(rgb) >= 0.38;
}

function contrastRatioAgainstDarkBg(textRgb: { r: number; g: number; b: number }): number {
  const bg = { r: 15, g: 23, b: 42 }; // slate-900
  const l1 = relativeLuminance(textRgb);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Theme swap for neutral text only, plus red contrast tuning per theme.
 * light theme → white/near-white becomes black; pale reds become saturated red
 * dark theme → black/near-black becomes light; low-contrast reds become brighter
 */
export function readableTextColorForTheme(
  color: string,
  theme: "light" | "dark"
): string {
  const trimmed = color.trim().toLowerCase();
  if (trimmed === "white" || trimmed === "#fff" || trimmed === "#ffffff") {
    return theme === "light" ? DEFAULT_TEXT_COLOR : color;
  }
  if (trimmed === "black" || trimmed === "#000" || trimmed === "#000000") {
    return theme === "dark" ? DEFAULT_DARK_TEXT_COLOR : color;
  }

  const rgb = parseCssColorToRgb(color);
  if (!rgb) return color;

  if (theme === "light" && isNearWhite(rgb)) return DEFAULT_TEXT_COLOR;
  if (theme === "light" && isWashedOutRed(rgb)) {
    return DEFAULT_LIGHT_RED_TEXT_COLOR;
  }
  if (theme === "dark" && isNearBlack(rgb)) return DEFAULT_DARK_TEXT_COLOR;
  if (
    theme === "dark" &&
    isReddish(rgb) &&
    (isWashedOutRed(rgb) || contrastRatioAgainstDarkBg(rgb) < 4.5)
  ) {
    return DEFAULT_DARK_RED_TEXT_COLOR;
  }
  return color;
}

/** Rewrite white/black inline colors so they stay readable on the active theme. */
export function adaptHtmlColorsForTheme(
  html: string,
  theme: "light" | "dark"
): string {
  if (!html || !/color\s*:/i.test(html)) return html;
  return html.replace(/color\s*:\s*([^;"]+)/gi, (_, value: string) => {
    return `color: ${readableTextColorForTheme(value.trim(), theme)}`;
  });
}

export function isBoldFontWeight(weight: string): boolean {
  const numeric = Number.parseInt(weight, 10);
  if (!Number.isNaN(numeric)) return numeric >= 700;
  return weight === "bold" || weight === "bolder";
}

export function stripInlineStylesInSubtree(root: Node, properties: readonly InlineFormatProperty[]) {
  const stripElement = (element: HTMLElement) => {
    for (const prop of properties) {
      if (prop === "fontSize") element.style.fontSize = "";
      if (prop === "color") element.style.color = "";
      if (prop === "fontWeight") element.style.fontWeight = "";
    }
    if (element.style.length === 0) {
      element.removeAttribute("style");
    }
  };

  if (root.nodeType === Node.ELEMENT_NODE) {
    stripElement(root as HTMLElement);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    stripElement(node as HTMLElement);
    node = walker.nextNode();
  }
}

/** Unwrap <b>/<strong> inside a fragment so bold can be turned off. */
export function unwrapBoldTagsInSubtree(root: Node) {
  const boldElements: HTMLElement[] = [];

  const maybeCollect = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === "B" || el.tagName === "STRONG") {
      boldElements.push(el);
    }
  };

  maybeCollect(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    maybeCollect(node);
    node = walker.nextNode();
  }

  // Deepest first so nested bold unwraps cleanly
  boldElements.sort((a, b) => (a.contains(b) ? 1 : b.contains(a) ? -1 : 0));

  for (const el of boldElements) {
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  }
}
