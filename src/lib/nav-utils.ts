export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/pacjenci", label: "Obecni pacjenci" },
  { href: "/fizjoterapeuci", label: "Fizjoterapeuci" },
  { href: "/masaze", label: "Masaże Krzysztof" },
  { href: "/dyzury", label: "Dyżury wt/czw" },
  { href: "/przyjecia", label: "Przyjęcia" },
  { href: "/urlopy", label: "Urlopy" },
  { href: "/archiwum", label: "Archiwum" },
];

export const DEFAULT_NAV_ORDER = NAV_ITEMS.map((item) => item.href);

const NAV_BY_HREF = Object.fromEntries(NAV_ITEMS.map((item) => [item.href, item]));

export function getNavLabel(href: string, labels?: Record<string, string>): string {
  const custom = labels?.[href]?.trim();
  if (custom) return custom;
  return NAV_BY_HREF[href]?.label ?? href;
}

export function normalizeNavLabels(labels?: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [href, label] of Object.entries(labels ?? {})) {
    if (!NAV_BY_HREF[href]) continue;
    const trimmed = label.trim();
    if (!trimmed || trimmed === NAV_BY_HREF[href].label) continue;
    result[href] = trimmed;
  }

  return result;
}

export function normalizeNavOrder(order?: string[]): string[] {
  const valid = new Set(DEFAULT_NAV_ORDER);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const href of order ?? []) {
    if (valid.has(href) && !seen.has(href)) {
      result.push(href);
      seen.add(href);
    }
  }

  for (const href of DEFAULT_NAV_ORDER) {
    if (!seen.has(href)) {
      result.push(href);
    }
  }

  return result;
}

export function getOrderedNavItems(order?: string[], labels?: Record<string, string>): NavItem[] {
  return normalizeNavOrder(order).map((href) => ({
    href,
    label: getNavLabel(href, labels),
  }));
}

export function reorderNavOrder(order: string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= order.length || toIndex >= order.length) {
    return order;
  }

  const next = [...order];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
