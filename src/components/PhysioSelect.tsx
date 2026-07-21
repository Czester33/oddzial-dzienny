"use client";

import { useTheme } from "@/context/ThemeContext";
import { resolvePhysioRowColor } from "@/lib/physio-utils";

export type PhysioSelectOption = {
  value: string;
  label: string;
  color: string;
  rowColor: string;
};

export function PhysioSelect({
  value,
  onChange,
  options,
  emptyLabel = "— wybierz —",
  className = "w-full cursor-pointer rounded-md border border-black/15 bg-white/90 px-2 py-1.5 text-[19px] outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800/90 dark:focus:border-blue-400",
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

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
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
  );
}
