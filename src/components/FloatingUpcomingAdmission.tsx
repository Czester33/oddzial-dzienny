"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppData } from "@/lib/types";
import { getUpcomingAdmissionThisWeek } from "@/lib/admission-utils";
import { formatDateLongPL, formatDatePL, todayIsoDate } from "@/lib/date-utils";
import { getPhysioName } from "@/lib/physio-utils";

const STORAGE_KEY = "pacjenci-floating-upcoming-admission";

function loadMinimized(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { minimized?: boolean };
    return Boolean(parsed.minimized);
  } catch {
    return false;
  }
}

function UpcomingAdmissionPanel({ data }: { data: AppData }) {
  const upcoming = useMemo(
    () => getUpcomingAdmissionThisWeek(data, todayIsoDate()),
    [data]
  );

  if (!upcoming) {
    return (
      <div className="flex w-[320px] max-h-[340px] flex-col rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="shrink-0 px-4 py-3">
          <h3 className="text-[18px] font-bold text-slate-800 dark:text-slate-100">
            Przyjęcia w tym tygodniu
          </h3>
          <p className="mt-1 text-[16px] text-slate-500 dark:text-slate-400">
            Brak zaplanowanych przyjęć do końca tygodnia.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-[320px] max-h-[340px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h3 className="text-[18px] font-bold text-slate-800 dark:text-slate-100">
          Przyjęcia w tym tygodniu
        </h3>
        <p className="mt-0.5 text-[15px] text-slate-500 dark:text-slate-400">
          {upcoming.days.length}{" "}
          {upcoming.days.length === 1 ? "dzień" : "dni"} · łącznie {upcoming.total}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {upcoming.days.map((day) => {
            const physioRows = day.physioCounts
              .map((row) => {
                const physio = data.physiotherapists.find((p) => p.id === row.physiotherapistId);
                return {
                  ...row,
                  name: getPhysioName(data, row.physiotherapistId) || "—",
                  color: physio?.color ?? "#64748b",
                };
              })
              .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pl"));

            return (
              <section key={day.date}>
                <p className="text-[16px] font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                  {formatDateLongPL(day.date)}
                </p>
                <p className="text-[14px] text-slate-500 dark:text-slate-400">
                  Łącznie: {day.total}
                </p>

                <div className="mt-2 space-y-2">
                  {physioRows.length === 0 ? (
                    <p className="text-[15px] text-slate-500 dark:text-slate-400">
                      Brak przypisanych pacjentów do fizjoterapeutów.
                    </p>
                  ) : (
                    physioRows.map((row) => (
                      <div
                        key={row.physiotherapistId}
                        className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700"
                      >
                        <span
                          className="truncate rounded px-2 py-0.5 text-[16px] font-semibold text-white"
                          style={{ backgroundColor: row.color }}
                        >
                          {row.name}
                        </span>
                        <span className="shrink-0 text-[18px] font-bold tabular-nums text-slate-800 dark:text-slate-100">
                          {row.count}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function FloatingUpcomingAdmission({ data }: { data: AppData }) {
  const [minimized, setMinimized] = useState(false);
  const [ready, setReady] = useState(false);

  const upcoming = useMemo(
    () => getUpcomingAdmissionThisWeek(data, todayIsoDate()),
    [data]
  );

  useEffect(() => {
    setMinimized(loadMinimized());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ minimized }));
  }, [minimized, ready]);

  const minimizedLabel = upcoming
    ? upcoming.days.length === 1
      ? `Przyjęcie: ${formatDatePL(upcoming.days[0].date)} (${upcoming.total})`
      : `Przyjęcia w tyg.: ${upcoming.days.length} dni (${upcoming.total})`
    : "Brak przyjęcia w tym tygodniu";

  if (!ready) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[60] hidden shadow-lg lg:block">
      {minimized ? (
        <div className="flex max-w-[360px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <span className="truncate text-[17px] font-semibold text-slate-800 dark:text-slate-100">
            {minimizedLabel}
          </span>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="ml-auto shrink-0 rounded px-2.5 py-1 text-[18px] font-medium text-blue-600 hover:bg-slate-100 dark:text-blue-400 dark:hover:bg-slate-800"
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
              aria-label="Minimalizuj panel przyjęć"
            >
              —
            </button>
          </div>
          <UpcomingAdmissionPanel data={data} />
        </div>
      )}
    </div>
  );
}
