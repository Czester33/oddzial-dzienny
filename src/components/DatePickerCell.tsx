"use client";

import { useRef, useState } from "react";
import { formatDischargeShort, toDateInputValue } from "@/lib/date-utils";
import { PolishDatePicker } from "@/components/PolishDatePicker";

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 8.5h15" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 3v3M13.5 3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function DatePickerCell({
  value,
  onChange,
  onRevert,
  title,
  readOnly = false,
  textClassName = "text-[19px]",
  defaultMonthKey,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Restore previous value (e.g. undo manual discharge date edit). */
  onRevert?: () => void;
  title?: string;
  readOnly?: boolean;
  textClassName?: string;
  /** When value is empty, open calendar on this month (YYYY-MM). */
  defaultMonthKey?: string;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const iso = toDateInputValue(value);
  const display = iso ? formatDischargeShort(value) : "";

  if (readOnly) {
    return (
      <div className="relative flex items-center justify-center gap-0.5 px-0.5 py-0.5 select-none">
        <span className={`min-w-0 truncate tabular-nums ${textClassName}`}>
          {display || "—"}
        </span>
        <span className="shrink-0 rounded p-0.5 opacity-70" aria-hidden="true">
          <CalendarIcon />
        </span>
      </div>
    );
  }

  return (
    <div
      ref={anchorRef}
      className="relative flex cursor-pointer items-center justify-center gap-0.5 px-0.5 py-0.5 select-none"
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`shrink-0 cursor-pointer whitespace-nowrap tabular-nums select-none hover:underline ${textClassName}`}
        title={display ? `${title ?? "Data"}: ${display}` : title ?? "Wybierz datę"}
      >
        {display || "—"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 cursor-pointer rounded p-0.5 opacity-70 select-none hover:bg-black/10 hover:opacity-100"
        title="Wybierz datę"
      >
        <CalendarIcon />
      </button>
      {iso && (
        <button
          type="button"
          onClick={() => (onRevert ? onRevert() : onChange(""))}
          className="shrink-0 cursor-pointer rounded px-0.5 text-[15px] leading-none text-red-500 select-none hover:bg-red-950/40"
          title={onRevert ? "Cofnij zmianę daty" : "Usuń datę"}
        >
          ×
        </button>
      )}
      {open && (
        <PolishDatePicker
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          defaultMonthKey={defaultMonthKey}
        />
      )}
    </div>
  );
}
