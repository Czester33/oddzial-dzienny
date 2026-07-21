"use client";

import { useEffect, useState } from "react";
import {
  MONTH_NAMES,
  WEEKDAY_SHORT_PL,
  formatDateLongPL,
  formatDatePL,
  getMonthGrid,
  isoFromParts,
  isCalendarRedDay,
} from "@/lib/date-utils";

function getTodayParts(now = new Date()) {
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: now.getDate(),
    iso: isoFromParts(now.getFullYear(), now.getMonth(), now.getDate()),
  };
}

export function TodayCalendar({
  variant = "slate",
}: {
  variant?: "slate" | "peach";
}) {
  const [today, setToday] = useState(() => getTodayParts());
  const [viewYear, setViewYear] = useState(() => getTodayParts().year);
  const [viewMonth, setViewMonth] = useState(() => getTodayParts().month);

  useEffect(() => {
    const tick = () => {
      const next = getTodayParts();
      setToday((prev) => (prev.iso === next.iso ? prev : next));
    };
    const interval = setInterval(tick, 60_000);
    return () => clearInterval(interval);
  }, []);

  const cells = getMonthGrid(viewYear, viewMonth);
  const dayName = formatDateLongPL(today.iso).split(",")[0]?.trim() ?? "";
  const viewingCurrentMonth = viewYear === today.year && viewMonth === today.month;
  const isPeach = variant === "peach";

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setViewYear(today.year);
    setViewMonth(today.month);
  };

  const navBtnClass = isPeach
    ? "rounded px-1.5 py-0.5 text-[18px] leading-none text-slate-700 hover:bg-[#f4b183]/40 dark:text-amber-100 dark:hover:bg-[#7a4a2e]/50"
    : "rounded px-1.5 py-0.5 text-[18px] leading-none text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-700";

  return (
    <aside
      className={`w-[300px] shrink-0 rounded-lg border p-3 shadow-sm ${
        isPeach
          ? "border-black bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-amber-50"
          : "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      }`}
    >
      <h3 className="mb-0.5 text-center text-[20px] font-bold leading-snug text-slate-800 dark:text-slate-100">
        Dzisiaj
      </h3>
      <p className="mb-2 text-center text-[17px] font-bold text-slate-700 dark:text-slate-300">{dayName}</p>

      <div
        className={`rounded border p-3 ${
          isPeach
            ? "border-[#f4b183]/60 bg-[#fde9d9]/40 dark:border-[#7a4a2e]/70 dark:bg-[#3d2a1f]/50"
            : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80"
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-1">
          <button type="button" onClick={prevMonth} className={navBtnClass} aria-label="Poprzedni miesiąc">
            ‹
          </button>
          <div className="min-w-0 text-center">
            <div className="text-[17px] font-bold text-slate-800 dark:text-slate-100">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </div>
            {!viewingCurrentMonth && (
              <button
                type="button"
                onClick={goToToday}
                className="mt-0.5 text-[13px] font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Wróć do dziś
              </button>
            )}
          </div>
          <button type="button" onClick={nextMonth} className={navBtnClass} aria-label="Następny miesiąc">
            ›
          </button>
        </div>

        <div className="mb-0.5 grid grid-cols-7 gap-0.5 text-center text-[12px] font-bold text-slate-600 dark:text-slate-400">
          {WEEKDAY_SHORT_PL.map((label, index) => (
            <div key={label} className={`py-0.5 ${index >= 5 ? "text-red-500 dark:text-red-400" : ""}`}>
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cellDay, i) => {
            if (cellDay === null) return <div key={`empty-${i}`} className="h-7" />;

            const cellIso = isoFromParts(viewYear, viewMonth, cellDay);
            const isToday = viewingCurrentMonth && cellDay === today.day;
            const isRedDay = isCalendarRedDay(cellIso);

            return (
              <div
                key={cellIso}
                className={`flex h-7 items-center justify-center rounded text-[16px] font-bold tabular-nums ${
                  isToday
                    ? isPeach
                      ? "bg-[#f4b183] text-slate-900 ring-2 ring-[#e08a4a] dark:bg-[#7a4a2e] dark:text-amber-50 dark:ring-[#a66a40]"
                      : "bg-blue-600 text-white ring-2 ring-blue-400/50"
                    : isRedDay
                      ? "text-red-500 dark:text-red-400"
                      : "text-slate-800 dark:text-slate-200"
                }`}
              >
                {cellDay}
              </div>
            );
          })}
        </div>

        <div
          className={`mt-2 border-t pt-2 text-center text-[22px] font-bold tabular-nums text-slate-900 dark:text-slate-100 ${
            isPeach
              ? "border-[#f4b183]/50 dark:border-[#7a4a2e]/50"
              : "border-slate-200 dark:border-slate-700"
          }`}
        >
          {formatDatePL(today.iso)}
        </div>
      </div>
    </aside>
  );
}
