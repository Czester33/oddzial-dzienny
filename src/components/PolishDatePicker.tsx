"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MONTH_NAMES,
  WEEKDAY_SHORT_PL,
  getMonthGrid,
  isoFromParts,
  isCalendarRedDay,
  parseMonthKey,
  toDateInputValue,
} from "@/lib/date-utils";

const PANEL_WIDTH = 260;
const PANEL_ESTIMATED_HEIGHT = 320;
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

export function PolishDatePicker({
  value,
  onChange,
  onClose,
  anchorRef,
  defaultMonthKey,
}: {
  value: string;
  onChange: (iso: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  /** When value is empty, open calendar on this month (YYYY-MM). */
  defaultMonthKey?: string;
}) {
  const iso = toDateInputValue(value);
  const initial = iso ? iso.split("-").map(Number) : null;
  const fallback = defaultMonthKey ? parseMonthKey(defaultMonthKey) : null;
  const today = new Date();

  const [viewYear, setViewYear] = useState(
    initial?.[0] ?? fallback?.year ?? today.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(
    initial ? initial[1] - 1 : (fallback?.month ?? today.getMonth())
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight || PANEL_ESTIMATED_HEIGHT;

    let left = rect.left;
    if (left + PANEL_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
      left = window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN;
    }
    left = Math.max(VIEWPORT_MARGIN, left);

    const spaceBelow = window.innerHeight - rect.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - ANCHOR_GAP - VIEWPORT_MARGIN;

    let top: number;
    if (spaceBelow >= panelHeight || spaceBelow >= spaceAbove) {
      top = rect.bottom + ANCHOR_GAP;
      if (top + panelHeight > window.innerHeight - VIEWPORT_MARGIN) {
        top = Math.max(VIEWPORT_MARGIN, window.innerHeight - panelHeight - VIEWPORT_MARGIN);
      }
    } else {
      top = rect.top - panelHeight - ANCHOR_GAP;
      if (top < VIEWPORT_MARGIN) {
        top = VIEWPORT_MARGIN;
      }
    }

    setPosition({ top, left });
  };

  useLayoutEffect(() => {
    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reposition when month changes or on mount
  }, [anchorRef, viewYear, viewMonth]);

  useEffect(() => {
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorRef]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [anchorRef, onClose]);

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

  const cells = getMonthGrid(viewYear, viewMonth);
  const selectedDay =
    iso && iso.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`)
      ? Number(iso.split("-")[2])
      : null;

  const todayIso = isoFromParts(today.getFullYear(), today.getMonth(), today.getDate());

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[100] w-[260px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      style={{ top: position.top, left: position.left }}
      lang="pl"
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="rounded px-2 py-1 text-[19px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Poprzedni miesiąc"
        >
          ‹
        </button>
        <span className="text-[19px] font-semibold text-slate-800 dark:text-slate-100">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded px-2 py-1 text-[19px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Następny miesiąc"
        >
          ›
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[19px] font-medium text-slate-400">
        {WEEKDAY_SHORT_PL.map((day, index) => (
          <div
            key={day}
            className={`py-1 ${index >= 5 ? "text-red-500 dark:text-red-400" : ""}`}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="h-8" />;

          const dayIso = isoFromParts(viewYear, viewMonth, day);
          const isSelected = selectedDay === day;
          const isToday = dayIso === todayIso;
          const isRedDay = isCalendarRedDay(dayIso);

          return (
            <button
              key={dayIso}
              type="button"
              onClick={() => {
                onChange(dayIso);
                onClose();
              }}
              className={`h-8 rounded text-[19px] tabular-nums ${
                isSelected
                  ? "bg-blue-600 font-semibold text-white"
                  : isToday
                    ? "bg-blue-50 font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
                    : isRedDay
                      ? "font-medium text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      : "text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
        <button
          type="button"
          onClick={() => {
            onChange(todayIso);
            onClose();
          }}
          className="text-[19px] text-blue-600 hover:underline dark:text-blue-400"
        >
          Dzisiaj
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-[19px] text-slate-500 hover:underline dark:text-slate-400"
        >
          Zamknij
        </button>
      </div>
    </div>,
    document.body
  );
}
