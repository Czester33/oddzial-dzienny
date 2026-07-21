"use client";

import { useMemo } from "react";
import type { AppData, ArchivedVacationYear, Physiotherapist, VacationEntry } from "@/lib/types";
import {
  MONTH_NAMES,
  WEEKDAY_NAMES_PL,
  formatDatePL,
  getPolishPublicHolidayName,
  getWeekdayOnlyMonthGrid,
  isClinicClosedDay,
  isPolishPublicHoliday,
} from "@/lib/date-utils";
import {
  resolvePhysioColumnHeaderColor,
  resolvePhysioRowColor,
} from "@/lib/physio-utils";
import { vacationStaff } from "@/lib/vacation-utils";
import { useTheme } from "@/context/ThemeContext";

const MONTH_COLORS = [
  { header: "#9ec5e8", zebra: "#e8f3fb" },
  { header: "#e8a0b5", zebra: "#fce8ef" },
  { header: "#a8d5a2", zebra: "#eaf6e8" },
  { header: "#c5d98a", zebra: "#f3f8e4" },
  { header: "#7ec87e", zebra: "#e6f5e6" },
  { header: "#f0c85a", zebra: "#fbf3d4" },
  { header: "#ed9b4a", zebra: "#fff0e0" },
  { header: "#5bb8c9", zebra: "#e0f4f7" },
  { header: "#d4a05a", zebra: "#f7ecda" },
  { header: "#e07a3a", zebra: "#fce8da" },
  { header: "#9a8f82", zebra: "#ece9e5" },
  { header: "#5a9a6a", zebra: "#e4f0e7" },
];

function shortPhysioName(name: string): string {
  return name.split(" ")[0] || name || "—";
}

function entryCertain(entry: VacationEntry): boolean {
  return entry.certainty !== "uncertain";
}

function physioTileBg(color: string, rowColor: string, isDark: boolean): string {
  if (isDark) return resolvePhysioRowColor(color, rowColor, "dark");
  return color;
}

function mixToward(
  hex: string,
  base: [number, number, number],
  towardBase: number
): string {
  const raw = hex.trim().replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (full.length !== 6) return hex;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  const t = Math.min(1, Math.max(0, towardBase));
  const mix = (c: number, baseC: number) => Math.round(c * (1 - t) + baseC * t);
  return `#${[mix(r, base[0]), mix(g, base[1]), mix(b, base[2])]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

function resolveMonthColors(month: number, isDark: boolean) {
  const accent = MONTH_COLORS[month];
  if (isDark) {
    return {
      header: resolvePhysioColumnHeaderColor(accent.header, accent.zebra, "dark"),
      cell: mixToward(accent.zebra, [30, 41, 59], 0.22),
    };
  }
  return {
    header: accent.header,
    cell: mixToward(accent.header, [255, 255, 255], 0.93),
  };
}

function blockedDayLabel(date: string, clinicClosedDays: readonly string[]): string {
  const holiday = getPolishPublicHolidayName(date);
  if (holiday) return holiday;
  if (isClinicClosedDay(date, clinicClosedDays)) return "Placówka nieczynna";
  return "Dzień wolny";
}

function ArchivedVacationMonthTable({
  yearNum,
  month,
  vacations,
  clinicClosedDays,
  physioById,
  isDark,
}: {
  yearNum: number;
  month: number;
  vacations: VacationEntry[];
  clinicClosedDays: readonly string[];
  physioById: Record<string, Physiotherapist>;
  isDark: boolean;
}) {
  const colors = resolveMonthColors(month, isDark);
  const weeks = getWeekdayOnlyMonthGrid(yearNum, month);
  const border = isDark ? "border-slate-600" : "border-black/25";
  const textMuted = isDark ? "text-slate-200" : "text-slate-900";
  const emptyBg = isDark ? "#1e293b" : "#f8fafc";
  const monthEntries = vacations.filter((v) => {
    const [, m] = v.date.split("-").map(Number);
    return m - 1 === month;
  });

  return (
    <div className="mx-auto max-w-5xl overflow-hidden rounded-sm shadow-md ring-1 ring-black/15 dark:ring-slate-600/50">
      <div
        className={`physio-name-header border-b px-3 py-2 text-center text-[21px] font-bold ${
          isDark ? "border-slate-600 text-slate-100" : "border-black/20 text-slate-900"
        }`}
        style={{ backgroundColor: colors.header }}
      >
        {MONTH_NAMES[month]} {yearNum}
        {monthEntries.length === 0 ? (
          <span className="ml-2 text-[16px] font-medium opacity-70">(brak urlopów)</span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed border-collapse text-[18px]">
          <thead>
            <tr>
              {WEEKDAY_NAMES_PL.slice(0, 5).map((label) => (
                <th
                  key={label}
                  className={`physio-col-header border ${border} px-1.5 py-1.5 text-center text-[17px] font-bold ${textMuted}`}
                  style={{ backgroundColor: colors.header }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={`${month}-week-${wi}`}>
                {week.map((date, di) => {
                  if (!date) {
                    return (
                      <td
                        key={`empty-${month}-${wi}-${di}`}
                        className={`border ${border} p-1.5 align-top`}
                        style={{ backgroundColor: emptyBg }}
                      />
                    );
                  }

                  const entries = vacations.filter((v) => v.date === date);
                  const blocked =
                    isPolishPublicHoliday(date) ||
                    isClinicClosedDay(date, clinicClosedDays);

                  return (
                    <td
                      key={date}
                      className={`border ${border} p-1.5 align-top`}
                      style={{ backgroundColor: colors.cell }}
                    >
                      <div
                        className={`mb-1.5 text-center text-[18px] font-bold tabular-nums ${
                          blocked
                            ? "text-red-600 dark:text-red-400"
                            : "text-slate-900 dark:text-slate-900"
                        }`}
                      >
                        {formatDatePL(date)}
                      </div>

                      {blocked ? (
                        <p className="overflow-hidden text-center text-[16px] font-bold leading-tight break-words text-red-600 dark:text-red-400">
                          {blockedDayLabel(date, clinicClosedDays)}
                        </p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {entries.map((entry) => {
                            const physio = physioById[entry.physiotherapistId];
                            const certain = entryCertain(entry);
                            const tileBg = physio
                              ? physioTileBg(physio.color, physio.rowColor, isDark)
                              : isDark
                                ? "#334155"
                                : "#e2e8f0";
                            const tileText = isDark ? "#f1f5f9" : physio ? "#ffffff" : "#0f172a";
                            return (
                              <div
                                key={`${entry.date}-${entry.physiotherapistId}`}
                                className={`flex items-center gap-1 rounded border px-1 py-0.5 text-[16px] ${
                                  certain
                                    ? "border-black/20 dark:border-white/25"
                                    : "border-dashed border-amber-600 dark:border-amber-400"
                                }`}
                                style={{ backgroundColor: tileBg, color: tileText }}
                              >
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/20 dark:ring-white/30"
                                  style={{ backgroundColor: physio?.color ?? "#94a3b8" }}
                                  aria-hidden
                                />
                                <span className="min-w-0 flex-1 truncate font-semibold">
                                  {shortPhysioName(physio?.name ?? "?")}
                                </span>
                                <span
                                  className={`shrink-0 rounded px-1 py-0.5 text-[14px] font-semibold ${
                                    certain
                                      ? "bg-emerald-600 text-white"
                                      : "bg-amber-500 text-white"
                                  }`}
                                >
                                  {certain ? "P" : "N"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ArchivedVacationYearPanel({
  entry,
  data,
}: {
  entry: ArchivedVacationYear;
  data: AppData;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const yearNum = Number(entry.yearKey);
  const clinicClosedDays = data.clinicClosedDays ?? [];
  const physioById = useMemo(
    () => Object.fromEntries(vacationStaff(data).map((p) => [p.id, p])),
    [data]
  );

  return (
    <div className="space-y-6">
      {Array.from({ length: 12 }, (_, month) => (
        <ArchivedVacationMonthTable
          key={month}
          yearNum={yearNum}
          month={month}
          vacations={entry.entries}
          clinicClosedDays={clinicClosedDays}
          physioById={physioById}
          isDark={isDark}
        />
      ))}
    </div>
  );
}
