"use client";

import { useEffect, useState } from "react";
import { useData } from "@/context/DataContext";
import { useTheme } from "@/context/ThemeContext";
import type { AppData, DutyEntry } from "@/lib/types";
import {
  PageHeader,
  LoadingState,
  ErrorBanner,
  MonthSelector,
  Btn,
} from "@/components/ui";
import {
  currentMonthKey,
  getMonthOptions,
  getTuesdaysAndThursdays,
  formatDutyDay,
  MONTH_NAMES,
  monthKey as toMonthKey,
  parseMonthKey,
} from "@/lib/date-utils";
import {
  resolvePhysioColumnHeaderColor,
  resolvePhysioRowColor,
} from "@/lib/physio-utils";
import {
  applyAutoArchiveDuties,
  applyDutyNotes,
  hasAutoArchiveDutyChanges,
} from "@/lib/duty-utils";

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

/** Header + zebra accents associated with each month. */
const MONTH_COLORS = [
  { header: "#9ec5e8", zebra: "#e8f3fb" }, // January – frost blue
  { header: "#e8a0b5", zebra: "#fce8ef" }, // February – Valentine pink
  { header: "#a8d5a2", zebra: "#eaf6e8" }, // March – early spring green
  { header: "#c5d98a", zebra: "#f3f8e4" }, // April – soft meadow
  { header: "#7ec87e", zebra: "#e6f5e6" }, // May – fresh green
  { header: "#f0c85a", zebra: "#fbf3d4" }, // June – sun yellow
  { header: "#ed9b4a", zebra: "#fff0e0" }, // July – beach orange
  { header: "#5bb8c9", zebra: "#e0f4f7" }, // August – sea blue
  { header: "#d4a05a", zebra: "#f7ecda" }, // September – harvest amber
  { header: "#e07a3a", zebra: "#fce8da" }, // October – pumpkin
  { header: "#9a8f82", zebra: "#ece9e5" }, // November – fog grey
  { header: "#5a9a6a", zebra: "#e4f0e7" }, // December – fir green
];

function isDutyMonthPast(key: string, todayKey = currentMonthKey()): boolean {
  return key < todayKey;
}

function nextDutyMonthKey(key: string): string {
  const { year, month } = parseMonthKey(key);
  const next = new Date(year, month + 1, 1);
  return toMonthKey(next.getFullYear(), next.getMonth());
}

/** Current or next month that is not in the past. */
function clampDutyMonthKey(key: string): string {
  const today = currentMonthKey();
  let candidate = key < today ? today : key;
  while (isDutyMonthPast(candidate)) {
    candidate = nextDutyMonthKey(candidate);
  }
  return candidate;
}

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

/** Brand color tile for assigned duty physiotherapist. */
function physioTileBg(color: string, rowColor: string, isDark: boolean): string {
  if (isDark) return resolvePhysioRowColor(color, rowColor, "dark");
  return color;
}

function physioTileText(isDark: boolean): string {
  return isDark ? "#f1f5f9" : "#ffffff";
}

function DutyMonthTable({
  monthKey,
  data,
  isDark,
  onUpdateDuty,
}: {
  monthKey: string;
  data: AppData;
  isDark: boolean;
  onUpdateDuty: (monthKey: string, date: string, physiotherapistId: string) => void;
}) {
  const { year, month } = parseMonthKey(monthKey);
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
  const selectClass =
    "absolute inset-0 h-full w-full cursor-pointer opacity-0 outline-none";
  const tileClass =
    "block w-full rounded border px-2 py-1 text-center text-[19px] font-semibold leading-tight";
  const selectText = isDark ? "#f8fafc" : "#0f172a";
  const optionBg = isDark ? "#1e293b" : "#ffffff";
  const dutyTileLabel = data.physiotherapists.reduce(
    (longest, physio) => (physio.name.length > longest.length ? physio.name : longest),
    "—"
  );
  const dutyTileWidth = `${dutyTileLabel.length + 2}ch`;

  const tueThuDates = getTuesdaysAndThursdays(year, month);
  const existing = data.duties[monthKey];
  const currentDuties: DutyEntry[] = tueThuDates.map((date) => {
    const found = existing?.find((d) => d.date === date);
    return found ?? { date, physiotherapistId: "" };
  });
  const mid = Math.ceil(currentDuties.length / 2);
  const leftDuties = currentDuties.slice(0, mid);
  const rightDuties = currentDuties.slice(mid);
  const rowCount = Math.max(leftDuties.length, rightDuties.length);

  const renderPersonCell = (duty: DutyEntry | undefined, bg: string) => {
    if (!duty) {
      return <td className={cell} style={{ backgroundColor: bg }} />;
    }
    const physio = duty.physiotherapistId
      ? data.physiotherapists.find((p) => p.id === duty.physiotherapistId)
      : undefined;
    const tileBg = physio ? physioTileBg(physio.color, physio.rowColor, isDark) : "transparent";
    const tileText = physio
      ? physioTileText(isDark)
      : isDark
        ? "#94a3b8"
        : "#64748b";

    return (
      <td className={`${cell} p-1 text-center`} style={{ backgroundColor: bg }}>
        <label
          className="relative inline-block align-middle"
          style={{ width: dutyTileWidth }}
        >
          <span
            className={`${tileClass} ${
              physio
                ? "border-black/20 dark:border-white/25"
                : "border-dashed border-slate-300 dark:border-slate-600"
            }`}
            style={{
              color: tileText,
              backgroundColor: tileBg,
            }}
            aria-hidden="true"
          >
            {physio?.name ?? "—"}
          </span>
          <select
            value={duty.physiotherapistId}
            onChange={(e) => onUpdateDuty(monthKey, duty.date, e.target.value)}
            className={selectClass}
            aria-label={`Dyżur ${formatDutyDay(duty.date)}`}
          >
            <option value="" style={{ backgroundColor: optionBg, color: selectText }}>
              —
            </option>
            {data.physiotherapists.map((p) => (
              <option
                key={p.id}
                value={p.id}
                style={{
                  backgroundColor: physioTileBg(p.color, p.rowColor, isDark),
                  color: physioTileText(isDark),
                }}
              >
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </td>
    );
  };

  const renderDayCell = (duty: DutyEntry | undefined, bg: string) => {
    if (!duty) {
      return <td className={cell} style={{ backgroundColor: bg }} />;
    }
    return (
      <td className={`${cell} font-medium`} style={{ backgroundColor: bg }}>
        {formatDutyDay(duty.date)}
      </td>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="mx-auto w-full max-w-4xl border-collapse">
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
    </div>
  );
}

export default function DyzuryPage() {
  const { data, loading, error, save } = useData();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const todayKey = currentMonthKey();
  const [monthKey, setMonthKey] = useState(() => clampDutyMonthKey(currentMonthKey()));

  useEffect(() => {
    if (loading || !data) return;
    const next = applyAutoArchiveDuties(data);
    if (hasAutoArchiveDutyChanges(data, next)) {
      save(next);
    }
  }, [loading, data, save]);

  const visibleMonthKey = clampDutyMonthKey(monthKey);
  const upcomingMonthKey = nextDutyMonthKey(visibleMonthKey);

  const monthOptions = (() => {
    const opts = new Set(
      getMonthOptions(24, 0).filter((key) => !isDutyMonthPast(key, todayKey))
    );
    if (!isDutyMonthPast(visibleMonthKey, todayKey)) {
      opts.add(visibleMonthKey);
    }
    return Array.from(opts).sort();
  })();

  const shiftMonth = (delta: number) => {
    const idx = monthOptions.indexOf(visibleMonthKey);
    const next = monthOptions[idx + delta];
    if (next) setMonthKey(next);
  };

  if (loading || !data) return <LoadingState />;

  const updateDuty = (targetMonthKey: string, date: string, physiotherapistId: string) => {
    if (isDutyMonthPast(targetMonthKey, todayKey)) return;
    const { year, month } = parseMonthKey(targetMonthKey);
    const tueThuDates = getTuesdaysAndThursdays(year, month);
    const existing = data.duties[targetMonthKey];
    const currentDuties = tueThuDates.map((d) => {
      const found = existing?.find((e) => e.date === d);
      return found ?? { date: d, physiotherapistId: "" };
    });
    const updated = currentDuties.map((d) =>
      d.date === date ? { ...d, physiotherapistId } : d
    );
    save(
      applyDutyNotes({
        ...data,
        duties: { ...data.duties, [targetMonthKey]: updated },
      })
    );
  };

  const canGoPrev = monthOptions.some((key) => key < visibleMonthKey);
  const tablesToShow = [visibleMonthKey, upcomingMonthKey].filter(
    (key) => !isDutyMonthPast(key, todayKey)
  );

  return (
    <div>
      <PageHeader title="Dyżury wt/czw">
        <Btn variant="secondary" onClick={() => shiftMonth(-1)} disabled={!canGoPrev}>
          ‹
        </Btn>
        <MonthSelector
          value={visibleMonthKey}
          onChange={(key) => setMonthKey(clampDutyMonthKey(key))}
          options={monthOptions}
        />
        <Btn variant="secondary" onClick={() => shiftMonth(1)}>
          ›
        </Btn>
      </PageHeader>
      {error && <ErrorBanner message={error} />}

      <div className="space-y-8">
        {tablesToShow.map((key) => (
          <DutyMonthTable
            key={key}
            monthKey={key}
            data={data}
            isDark={isDark}
            onUpdateDuty={updateDuty}
          />
        ))}
      </div>
    </div>
  );
}
