"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { TodayCalendar } from "@/components/TodayCalendar";
import { formatDatePL, isoFromParts } from "@/lib/date-utils";

function getTopBelowNav(): number {
  if (typeof document === "undefined") return 16;
  const header = document.querySelector("header.app-header");
  if (!header) return 16;
  const bottom = Math.ceil(header.getBoundingClientRect().bottom) + 8;
  return Math.max(16, bottom);
}

function loadMinimized(storageKey: string): boolean {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { minimized?: boolean };
    return Boolean(parsed.minimized);
  } catch {
    return false;
  }
}

export function FloatingTodayCalendar({
  variant = "slate",
  storageKey = "pacjenci-floating-calendar",
}: {
  variant?: "slate" | "peach";
  storageKey?: string;
}) {
  const [minimized, setMinimized] = useState(false);
  const [ready, setReady] = useState(false);
  const [topOffset, setTopOffset] = useState(getTopBelowNav);

  useEffect(() => {
    setMinimized(loadMinimized(storageKey));
    setReady(true);
  }, [storageKey]);

  useLayoutEffect(() => {
    const updateTop = () => setTopOffset(getTopBelowNav());
    updateTop();

    const header = document.querySelector("header.app-header");
    const observer = header ? new ResizeObserver(updateTop) : null;
    if (header) observer?.observe(header);

    window.addEventListener("resize", updateTop);
    window.addEventListener("scroll", updateTop, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateTop);
      window.removeEventListener("scroll", updateTop);
    };
  }, [minimized]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(storageKey, JSON.stringify({ minimized }));
  }, [minimized, ready, storageKey]);

  const todayIso = isoFromParts(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
  );

  if (!ready) return null;

  return (
    <div
      className="fixed left-4 z-[60] hidden shadow-lg lg:block"
      style={{ top: topOffset }}
    >
      {minimized ? (
        <div className="flex min-w-[220px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <span className="text-[20px] font-bold tabular-nums text-slate-800 dark:text-slate-100">
            {formatDatePL(todayIso)}
          </span>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="ml-auto rounded px-2.5 py-1 text-[18px] font-medium text-blue-600 hover:bg-slate-100 dark:text-blue-400 dark:hover:bg-slate-800"
            title="Rozwiń"
          >
            ▢
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute right-2 top-2 z-10">
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[13px] text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Minimalizuj"
              aria-label="Minimalizuj kalendarz"
            >
              —
            </button>
          </div>
          <TodayCalendar variant={variant} />
        </div>
      )}
    </div>
  );
}
