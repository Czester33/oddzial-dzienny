"use client";

import type { AppData, ArchivedDutyMonth, DutyEntry } from "@/lib/types";
import {
  formatDutyDay,
  getTuesdaysAndThursdays,
  MONTH_NAMES,
  parseMonthKey,
} from "@/lib/date-utils";
import { getPhysioById, physioDisplayName, resolvePhysioColumnHeaderColor, resolvePhysioRowColor } from "@/lib/physio-utils";
import { useTheme } from "@/context/ThemeContext";
import { FitWidthScale, tableRemPx } from "@/components/FitWidthScale";

const MONTH_EMOJIS = [
  "❄️⛄🎿",
  "💝❄️🌨️",
  "🌸🌱🌧️",
  "🌷🐣☀️",
  "🌼🌻🐝",
  "☀️🍓🌿",
  "🌴⛅🏖️",
  "🌊☀️🍉",
  "🍂🍁🍎",
  "🎃🍂🌧️",
  "🌫️☕🧣",
  "🎄❄️⭐",
];

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

function resolveMonthColors(month: number, isDark: boolean) {
  const monthAccent = MONTH_COLORS[month];
  if (isDark) {
    return {
      header: resolvePhysioColumnHeaderColor(
        monthAccent.header,
        monthAccent.zebra,
        "dark"
      ),
      zebra: resolvePhysioRowColor(monthAccent.header, monthAccent.zebra, "dark"),
      rowEven: "#0f172a",
    };
  }
  return {
    header: monthAccent.header,
    zebra: monthAccent.zebra,
    rowEven: "#ffffff",
  };
}

function physioTileBg(color: string, rowColor: string, isDark: boolean): string {
  if (isDark) return resolvePhysioRowColor(color, rowColor, "dark");
  return color;
}

function physioTileText(isDark: boolean): string {
  return isDark ? "#f1f5f9" : "#ffffff";
}

export function ArchivedDutyMonthPanel({
  entry,
  data,
}: {
  entry: ArchivedDutyMonth;
  data: AppData;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { year, month } = parseMonthKey(entry.monthKey);
  const colors = resolveMonthColors(month, isDark);

  const cell = isDark
    ? "border border-slate-600 px-2 py-1.5 text-center text-[19px] text-slate-100"
    : "border border-black px-2 py-1.5 text-center text-[19px] text-black";
  const thMonth = isDark
    ? "physio-name-header border border-slate-600 px-3 py-2.5 text-center text-[22px] font-bold text-slate-100"
    : "physio-name-header border border-black px-3 py-2.5 text-center text-[22px] font-bold text-black";
  const thCol = isDark
    ? "physio-col-header border border-slate-600 px-2 py-1.5 text-center text-[19px] font-bold text-slate-100"
    : "physio-col-header border border-black px-2 py-1.5 text-center text-[19px] font-bold text-black";
  const divider = isDark ? "border border-slate-600 w-3 p-0" : "border border-black w-3 p-0";

  const tueThuDates = getTuesdaysAndThursdays(year, month);
  const duties: DutyEntry[] = tueThuDates.map((date) => {
    const found = entry.entries.find((d) => d.date === date);
    return found ?? { date, physiotherapistId: "" };
  });
  const mid = Math.ceil(duties.length / 2);
  const leftDuties = duties.slice(0, mid);
  const rightDuties = duties.slice(mid);
  const rowCount = Math.max(leftDuties.length, rightDuties.length);

  const renderDayCell = (duty: DutyEntry | undefined, bg: string) => {
    if (!duty) return <td className={cell} style={{ backgroundColor: bg }} />;
    return (
      <td className={`${cell} font-medium`} style={{ backgroundColor: bg }}>
        {formatDutyDay(duty.date)}
      </td>
    );
  };

  const renderPersonCell = (duty: DutyEntry | undefined, bg: string) => {
    if (!duty) return <td className={cell} style={{ backgroundColor: bg }} />;
    const physio = duty.physiotherapistId
      ? getPhysioById(data, duty.physiotherapistId)
      : undefined;
    const tileBg = physio ? physioTileBg(physio.color, physio.rowColor, isDark) : "transparent";
    const tileText = physio
      ? physioTileText(isDark)
      : isDark
        ? "#94a3b8"
        : "#64748b";
    return (
      <td className={`${cell} p-1 text-center`} style={{ backgroundColor: bg }}>
        <span
          className={`inline-block min-w-[8ch] rounded border px-2 py-1 text-center text-[19px] font-semibold leading-tight ${
            physio
              ? "border-black/20 dark:border-white/25"
              : "border-dashed border-slate-300 dark:border-slate-600"
          }`}
          style={{ color: tileText, backgroundColor: tileBg }}
        >
          {physioDisplayName(physio?.name ?? "—")}
        </span>
      </td>
    );
  };

  return (
    <FitWidthScale contentWidthPx={tableRemPx(56)}>
      <table className="w-[56rem] max-w-none border-collapse">
        <thead>
          <tr>
            <th
              colSpan={5}
              className={thMonth}
              style={{ backgroundColor: colors.header }}
            >
              {MONTH_NAMES[month]} {MONTH_EMOJIS[month]}
            </th>
          </tr>
          <tr>
            <th className={thCol} style={{ backgroundColor: colors.header }}>
              Dzień
            </th>
            <th className={thCol} style={{ backgroundColor: colors.header }}>
              Kto zostaje
            </th>
            <th
              className={divider}
              style={{ backgroundColor: colors.header }}
              aria-hidden
            />
            <th className={thCol} style={{ backgroundColor: colors.header }}>
              Dzień
            </th>
            <th className={thCol} style={{ backgroundColor: colors.header }}>
              Kto zostaje
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, i) => {
            const bg = i % 2 === 0 ? colors.rowEven : colors.zebra;
            const left = leftDuties[i];
            const right = rightDuties[i];
            return (
              <tr key={left?.date ?? right?.date ?? `empty-${i}`}>
                {renderDayCell(left, bg)}
                {renderPersonCell(left, bg)}
                <td
                  className={divider}
                  style={{ backgroundColor: colors.header }}
                  aria-hidden
                />
                {renderDayCell(right, bg)}
                {renderPersonCell(right, bg)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </FitWidthScale>
  );
}

export function ArchivedDutyYearPanel({
  yearKey,
  entries,
  data,
}: {
  yearKey: string;
  entries: ArchivedDutyMonth[];
  data: AppData;
}) {
  const yearNum = Number(yearKey);
  const monthsInYear = entries
    .filter((entry) => parseMonthKey(entry.monthKey).year === yearNum)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  if (monthsInYear.length === 0) {
    return (
      <p className="text-center text-[19px] text-slate-500 dark:text-slate-400">
        Brak zarchiwizowanych dyżurów w tym roku.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {monthsInYear.map((entry) => (
        <ArchivedDutyMonthPanel key={entry.monthKey} entry={entry} data={data} />
      ))}
    </div>
  );
}
