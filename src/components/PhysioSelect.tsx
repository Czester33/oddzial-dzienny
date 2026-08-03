"use client";

import { useTheme } from "@/context/ThemeContext";
import { resolvePhysioRowColor } from "@/lib/physio-utils";

export type PhysioSelectOption = {
  value: string;
  label: string;
  /** Shown on the closed control when selected. */
  displayLabel?: string;
  color: string;
  rowColor: string;
};

const DEFAULT_CLASS =
  "w-full cursor-pointer rounded-md border border-black/15 bg-white/90 px-2 py-1.5 text-[19px] outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800/90 dark:focus:border-blue-400";

export function PhysioSelect({
  value,
  onChange,
  options,
  emptyLabel = "— wybierz —",
  className = DEFAULT_CLASS,
}: {
  value: string;
  onChange: (v: string) => void;
  options: PhysioSelectOption[];
  emptyLabel?: string;
  className?: string;
}) {
  const { theme } = useTheme();
  const selected = options.find((o) => o.value === value);
  const bg = selected
    ? resolvePhysioRowColor(selected.color, selected.rowColor, theme)
    : undefined;
  const closedLabel = selected
    ? (selected.displayLabel ?? selected.label.replace(/ \(ukryty\)$/, ""))
    : emptyLabel;

  return (
    <div
      className={`relative ${className}`}
      style={
        selected
          ? {
              backgroundColor: bg,
              color: theme === "dark" ? "#e2e8f0" : "#0f172a",
              fontWeight: 700,
            }
          : undefined
      }
    >
      <span
        className={`pointer-events-none block truncate pr-6 text-center font-bold leading-snug ${
          value ? "" : "text-slate-500 dark:text-slate-400"
        }`}
        aria-hidden="true"
      >
        {closedLabel}
      </span>
      <span
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[12px] opacity-60"
        aria-hidden="true"
      >
        ▼
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={emptyLabel}
      >
        <option value="">{emptyLabel}</option>
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            style={{
              backgroundColor: resolvePhysioRowColor(opt.color, opt.rowColor, theme),
              color: theme === "dark" ? "#e2e8f0" : "#0f172a",
            }}
          >
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
