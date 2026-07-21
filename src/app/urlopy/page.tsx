"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useData } from "@/context/DataContext";
import { useTheme } from "@/context/ThemeContext";
import type { AppData, Physiotherapist, VacationEntry } from "@/lib/types";
import {
  PageHeader,
  LoadingState,
  ErrorBanner,
  Card,
  YearSelector,
  Btn,
} from "@/components/ui";
import { DatePickerCell } from "@/components/DatePickerCell";
import {
  MONTH_NAMES,
  WEEKDAY_NAMES_PL,
  currentYearKey,
  formatDatePL,
  getWeekdayOnlyMonthGrid,
  getWorkingDaysInRange,
  getPolishPublicHolidayName,
  isClinicClosedDay,
  isPolishPublicHoliday,
  isWorkingDay,
  toDateInputValue,
} from "@/lib/date-utils";
import {
  resolvePhysioColumnHeaderColor,
  resolvePhysioRowColor,
} from "@/lib/physio-utils";
import {
  applyAutoArchiveVacations,
  applyVacationNotes,
  hasAutoArchiveVacationChanges,
  hasVacationNoteChanges,
  vacationStaff,
} from "@/lib/vacation-utils";
import { FitWidthScale } from "@/components/FitWidthScale";
import { applyDutyNotes, hasDutyNoteChanges } from "@/lib/duty-utils";

type Certainty = "certain" | "uncertain";

/** Header + zebra accents — same palette as dyżury / przyjęcia months. */
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

function entryCertainty(entry: VacationEntry): Certainty {
  return entry.certainty === "uncertain" ? "uncertain" : "certain";
}

/** Saturated brand color for vacation physio tiles in light mode. */
function physioTileBg(color: string, rowColor: string, isDark: boolean): string {
  if (isDark) return resolvePhysioRowColor(color, rowColor, "dark");
  return color;
}

function physioTileText(isDark: boolean): string {
  return isDark ? "#f1f5f9" : "#ffffff";
}

/** Public holiday or clinic closed day (shown red, no vacation edits). */
function isBlockedVacationDay(
  date: string,
  clinicClosedDays: readonly string[] = []
): boolean {
  return isPolishPublicHoliday(date) || isClinicClosedDay(date, clinicClosedDays);
}

function blockedDayLabel(date: string, clinicClosedDays: readonly string[]): string {
  const holiday = getPolishPublicHolidayName(date);
  if (holiday) return holiday;
  if (isClinicClosedDay(date, clinicClosedDays)) return "Placówka nieczynna";
  return "Dzień wolny";
}

function resolveMonthColors(month: number, isDark: boolean) {
  const accent = MONTH_COLORS[month];
  if (isDark) {
    return {
      header: resolvePhysioColumnHeaderColor(accent.header, accent.zebra, "dark"),
      // Keep cells pale: mostly light zebra, tiny shift toward slate
      cell: mixToward(accent.zebra, [30, 41, 59], 0.22),
      rowEven: "#0f172a",
    };
  }
  return {
    header: accent.header,
    // Near-white with only a hint of month color
    cell: mixToward(accent.header, [255, 255, 255], 0.93),
    rowEven: "#ffffff",
  };
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

/** Current+upcoming months first; past months separately (for collapsible section). */
function splitMonthIndexes(yearNum: number): {
  upcoming: number[];
  past: number[];
} {
  const now = new Date();
  const currentYear = now.getFullYear();
  if (yearNum > currentYear) {
    return {
      upcoming: Array.from({ length: 12 }, (_, i) => i),
      past: [],
    };
  }
  if (yearNum < currentYear) {
    return {
      upcoming: [],
      past: Array.from({ length: 12 }, (_, i) => i),
    };
  }
  const cur = now.getMonth();
  const upcoming: number[] = [];
  for (let m = cur; m < 12; m++) upcoming.push(m);
  const past: number[] = [];
  for (let m = 0; m < cur; m++) past.push(m);
  return { upcoming, past };
}

function VacationAddMenu({
  options,
  isDark,
  onAdd,
}: {
  options: Physiotherapist[];
  isDark: boolean;
  onAdd: (physiotherapistId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = () => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 140);
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuWidth - 8);
    }
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openUp = spaceBelow < 180 && rect.top > spaceBelow;
    setMenuStyle({
      position: "fixed",
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      left,
      width: menuWidth,
      zIndex: 10000,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", updateMenuPosition, true);
    window.addEventListener("resize", updateMenuPosition);
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("scroll", updateMenuPosition, true);
      window.removeEventListener("resize", updateMenuPosition);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (options.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded border border-slate-300/80 bg-transparent py-0.5 text-center text-[16px] font-medium leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:border-slate-600/80 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        title="Dodaj urlop"
        aria-label="Dodaj urlop"
      >
        +
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className="flex max-h-[min(240px,50vh)] flex-col gap-1 overflow-y-auto rounded border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
          >
            {options.map((p) => {
              const tileBg = physioTileBg(p.color, p.rowColor, isDark);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onAdd(p.id);
                    setOpen(false);
                  }}
                  className="rounded border px-1.5 py-0.5 text-left text-[16px] font-semibold opacity-95 hover:opacity-100 hover:brightness-95 dark:hover:brightness-110"
                  style={{
                    backgroundColor: tileBg,
                    color: physioTileText(isDark),
                    borderColor: p.color,
                  }}
                >
                  {shortPhysioName(p.name)}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

function VacationMonthTable({
  yearNum,
  month,
  data,
  vacations,
  clinicClosedDays,
  physioById,
  isDark,
  onAdd,
  onRemove,
  onToggleCertainty,
}: {
  yearNum: number;
  month: number;
  data: AppData;
  vacations: VacationEntry[];
  clinicClosedDays: readonly string[];
  physioById: Record<string, Physiotherapist>;
  isDark: boolean;
  onAdd: (date: string, physiotherapistId: string) => void;
  onRemove: (date: string, physiotherapistId: string) => void;
  onToggleCertainty: (date: string, physiotherapistId: string) => void;
}) {
  const colors = resolveMonthColors(month, isDark);
  const weeks = getWeekdayOnlyMonthGrid(yearNum, month);
  const border = isDark ? "border-slate-600" : "border-black/25";
  const textMuted = isDark ? "text-slate-200" : "text-slate-900";
  const cellBg = colors.cell;
  const emptyBg = isDark ? "#1e293b" : "#f8fafc";

  return (
    <FitWidthScale>
      <div className="w-[64rem] max-w-none overflow-hidden rounded-sm shadow-md ring-1 ring-black/15 dark:ring-slate-600/50">
      <div
        className={`physio-name-header border-b px-3 py-2 text-center text-[21px] font-bold ${
          isDark ? "border-slate-600 text-slate-100" : "border-black/20 text-slate-900"
        }`}
        style={{ backgroundColor: colors.header }}
      >
        {MONTH_NAMES[month]} {yearNum}
      </div>

      <div>
        <table className="w-full table-fixed border-collapse text-[18px]">
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
                  const blocked = isBlockedVacationDay(date, clinicClosedDays);
                  const takenIds = new Set(entries.map((e) => e.physiotherapistId));
                  const available = vacationStaff(data).filter((p) => !takenIds.has(p.id));

                  return (
                    <td
                      key={date}
                      className={`border ${border} p-1.5 align-top`}
                      style={{ backgroundColor: cellBg }}
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
                        <>
                          <div className="mb-1.5 flex flex-col gap-1">
                            {entries.map((entry) => {
                              const physio = physioById[entry.physiotherapistId];
                              const certain = entryCertainty(entry) === "certain";
                              const tileBg = physio
                                ? physioTileBg(physio.color, physio.rowColor, isDark)
                                : isDark
                                  ? "#334155"
                                  : "#e2e8f0";
                              const tileText = physio
                                ? physioTileText(isDark)
                                : isDark
                                  ? "#f1f5f9"
                                  : "#0f172a";
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
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onToggleCertainty(date, entry.physiotherapistId)
                                    }
                                    className={`shrink-0 rounded px-1 py-0.5 text-[14px] font-semibold ${
                                      certain
                                        ? "bg-emerald-600 text-white"
                                        : "bg-amber-500 text-white"
                                    }`}
                                    title={
                                      certain
                                        ? "Urlop pewny — kliknij, by oznaczyć jako niepewny"
                                        : "Urlop niepewny — kliknij, by oznaczyć jako pewny"
                                    }
                                  >
                                    {certain ? "P" : "N"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onRemove(date, entry.physiotherapistId)}
                                    className="shrink-0 px-0.5 font-bold text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-200"
                                    title="Usuń"
                                    aria-label="Usuń urlop"
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>

                          {available.length > 0 && (
                            <VacationAddMenu
                              options={available}
                              isDark={isDark}
                              onAdd={(id) => onAdd(date, id)}
                            />
                          )}
                        </>
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
    </FitWidthScale>
  );
}

export default function UrlopyPage() {
  const { data, loading, error, save } = useData();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [year, setYear] = useState(currentYearKey());

  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangePhysioIds, setRangePhysioIds] = useState<string[]>([]);
  const [rangeCertainty, setRangeCertainty] = useState<Certainty>("certain");
  const [closedPanelOpen, setClosedPanelOpen] = useState(false);
  const [closedDraft, setClosedDraft] = useState("");

  const [pastMonthsOpen, setPastMonthsOpen] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const physioById = useMemo(() => {
    if (!data) return {} as Record<string, Physiotherapist>;
    return Object.fromEntries(vacationStaff(data).map((p) => [p.id, p]));
  }, [data]);

  useEffect(() => {
    if (loading) return;
    const sync = () => {
      const current = dataRef.current;
      if (!current) return;
      let next = applyAutoArchiveVacations(current);
      next = applyVacationNotes(next);
      next = applyDutyNotes(next);
      if (
        hasAutoArchiveVacationChanges(current, next) ||
        hasVacationNoteChanges(current, next) ||
        hasDutyNoteChanges(current, next)
      ) {
        save(next);
      }
    };
    sync();
  }, [loading, save]);

  useEffect(() => {
    setPastMonthsOpen(false);
  }, [year]);

  if (loading || !data) return <LoadingState />;

  const yearNum = Number(year);
  const vacations = data.vacations[year] ?? [];
  const yearArchived = (data.vacationArchive ?? []).some((y) => y.yearKey === year);
  const clinicClosedDays = data.clinicClosedDays ?? [];
  const { upcoming: upcomingMonths, past: pastMonths } = splitMonthIndexes(yearNum);

  const saveVacations = (updated: VacationEntry[]) => {
    save({
      ...data,
      vacations: { ...data.vacations, [year]: updated },
    });
  };

  const upsertEntry = (date: string, physiotherapistId: string, certainty: Certainty) => {
    if (!physiotherapistId || !isWorkingDay(date, clinicClosedDays)) return;
    const without = vacations.filter(
      (v) => !(v.date === date && v.physiotherapistId === physiotherapistId)
    );
    saveVacations([...without, { date, physiotherapistId, certainty }]);
  };

  const removeEntry = (date: string, physiotherapistId: string) => {
    saveVacations(
      vacations.filter((v) => !(v.date === date && v.physiotherapistId === physiotherapistId))
    );
  };

  const toggleCertainty = (date: string, physiotherapistId: string) => {
    if (!isWorkingDay(date, clinicClosedDays)) return;
    const entry = vacations.find(
      (v) => v.date === date && v.physiotherapistId === physiotherapistId
    );
    if (!entry) return;
    const next: Certainty = entryCertainty(entry) === "certain" ? "uncertain" : "certain";
    upsertEntry(date, physiotherapistId, next);
  };

  const addDayPhysio = (date: string, physiotherapistId: string) => {
    if (!physiotherapistId || !isWorkingDay(date, clinicClosedDays)) return;
    if (vacations.some((v) => v.date === date && v.physiotherapistId === physiotherapistId)) {
      return;
    }
    upsertEntry(date, physiotherapistId, "certain");
  };

  const toggleRangePhysio = (id: string) => {
    setRangePhysioIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const applyRange = () => {
    const from = toDateInputValue(rangeFrom);
    const to = toDateInputValue(rangeTo || rangeFrom);
    if (!from || rangePhysioIds.length === 0) return;

    const days = getWorkingDaysInRange(from, to || from, clinicClosedDays);
    if (days.length === 0) return;

    const nextVacations = { ...data.vacations };
    const byYear = new Map<string, string[]>();
    for (const date of days) {
      const y = date.slice(0, 4);
      const list = byYear.get(y) ?? [];
      list.push(date);
      byYear.set(y, list);
    }

    for (const [y, yearDays] of byYear) {
      const existing = nextVacations[y] ?? [];
      const byKey = new Map(
        existing.map((v) => [`${v.date}|${v.physiotherapistId}`, v] as const)
      );
      for (const date of yearDays) {
        for (const physiotherapistId of rangePhysioIds) {
          byKey.set(`${date}|${physiotherapistId}`, {
            date,
            physiotherapistId,
            certainty: rangeCertainty,
          });
        }
      }
      nextVacations[y] = Array.from(byKey.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
    }

    save({ ...data, vacations: nextVacations });
    setRangeFrom("");
    setRangeTo("");
    setRangePhysioIds([]);
    setRangeCertainty("certain");
  };

  const addClinicClosedDay = () => {
    const iso = toDateInputValue(closedDraft);
    if (!iso) return;
    if (isPolishPublicHoliday(iso)) return;
    if (clinicClosedDays.includes(iso)) {
      setClosedDraft("");
      return;
    }

    const nextClosed = [...clinicClosedDays, iso].sort();
    const nextVacations = Object.fromEntries(
      Object.entries(data.vacations).map(([y, entries]) => [
        y,
        entries.filter((v) => v.date !== iso),
      ])
    );

    save({
      ...data,
      clinicClosedDays: nextClosed,
      vacations: nextVacations,
    });
    setClosedDraft("");
  };

  const removeClinicClosedDay = (iso: string) => {
    save({
      ...data,
      clinicClosedDays: clinicClosedDays.filter((d) => d !== iso),
    });
  };

  const canApplyRange =
    Boolean(toDateInputValue(rangeFrom)) && rangePhysioIds.length > 0;

  const closedDaysSorted = [...clinicClosedDays].sort();

  return (
    <div>
      <PageHeader title="Urlopy pracowników">
        <YearSelector value={year} onChange={setYear} />
      </PageHeader>
      {error && <ErrorBanner message={error} />}

      {yearArchived ? (
        <div className="mb-6 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-[19px] text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          Rok {year} jest w archiwum. Podgląd wszystkich miesięcy: zakładka Archiwum → Urlopy{" "}
          {year}.
        </div>
      ) : null}

      <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-[19px] text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
        <strong>Legenda:</strong>{" "}
        <span className="text-emerald-700 dark:text-emerald-400">P = urlop pewny</span>
        {" · "}
        <span className="text-amber-700 dark:text-amber-400">N = urlop niepewny</span>
      </div>

      {!yearArchived ? (
      <Card className="mx-auto mb-6 max-w-5xl overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">
            Dodaj urlop (dzień lub okres)
          </h3>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="shrink-0">
              <span className="mb-1 block text-[17px] font-medium text-slate-700 dark:text-slate-300">
                Od
              </span>
              <div className="w-[9.5rem] rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800">
                <DatePickerCell
                  value={rangeFrom}
                  onChange={setRangeFrom}
                  title="Data od"
                  textClassName="text-[19px]"
                />
              </div>
            </div>
            <div className="shrink-0">
              <span className="mb-1 block text-[17px] font-medium text-slate-700 dark:text-slate-300">
                Do
              </span>
              <div className="w-[9.5rem] rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800">
                <DatePickerCell
                  value={rangeTo}
                  onChange={setRangeTo}
                  title="Data do"
                  textClassName="text-[19px]"
                  defaultMonthKey={
                    toDateInputValue(rangeFrom)?.slice(0, 7) || undefined
                  }
                />
              </div>
            </div>
            <div className="shrink-0">
              <span className="mb-1 block text-[17px] font-medium text-slate-700 dark:text-slate-300">
                Status
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setRangeCertainty("certain")}
                  className={`rounded-md px-2.5 py-1.5 text-[17px] font-medium ${
                    rangeCertainty === "certain"
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  Pewny
                </button>
                <button
                  type="button"
                  onClick={() => setRangeCertainty("uncertain")}
                  className={`rounded-md px-2.5 py-1.5 text-[17px] font-medium ${
                    rangeCertainty === "uncertain"
                      ? "bg-amber-500 text-white"
                      : "border border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  Niepewny
                </button>
              </div>
            </div>
            <div className="flex min-w-[min(100%,20rem)] flex-1 flex-wrap items-center gap-2">
              <span className="shrink-0 text-[17px] font-medium text-slate-700 dark:text-slate-300">
                Osoby
              </span>
              {vacationStaff(data).map((p) => {
                const selected = rangePhysioIds.includes(p.id);
                const tileBg = physioTileBg(p.color, p.rowColor, isDark);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleRangePhysio(p.id)}
                    className={`rounded-md border px-2.5 py-1 text-[17px] font-semibold transition-shadow ${
                      selected
                        ? "ring-2 ring-offset-1 ring-slate-800 dark:ring-white dark:ring-offset-slate-900"
                        : "opacity-80 hover:opacity-100"
                    }`}
                    style={{
                      backgroundColor: tileBg,
                      color: physioTileText(isDark),
                      borderColor: p.color,
                    }}
                  >
                    {shortPhysioName(p.name)}
                  </button>
                );
              })}
            </div>
            <Btn onClick={applyRange} disabled={!canApplyRange} className="shrink-0">
              Dodaj do kalendarza
            </Btn>
          </div>
        </div>
      </Card>
      ) : null}

      {!yearArchived ? (
      <div className="space-y-6">
        {upcomingMonths.map((month) => (
          <VacationMonthTable
            key={`${yearNum}-${month}`}
            yearNum={yearNum}
            month={month}
            data={data}
            vacations={vacations}
            clinicClosedDays={clinicClosedDays}
            physioById={physioById}
            isDark={isDark}
            onAdd={addDayPhysio}
            onRemove={removeEntry}
            onToggleCertainty={toggleCertainty}
          />
        ))}

        {pastMonths.length > 0 ? (
          <div className="mt-2 border-t-2 border-dashed border-slate-300 pt-6 dark:border-slate-600">
            <button
              type="button"
              onClick={() => setPastMonthsOpen((v) => !v)}
              className="mb-4 flex w-full items-center justify-between gap-3 rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-left text-[19px] font-semibold text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-expanded={pastMonthsOpen}
            >
              <span>
                Przeszłe miesiące
                <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                  ({pastMonths.map((m) => MONTH_NAMES[m]).join(", ")})
                </span>
              </span>
              <span className="shrink-0 text-slate-500 dark:text-slate-400" aria-hidden>
                {pastMonthsOpen ? "▾" : "▸"}
              </span>
            </button>

            {pastMonthsOpen ? (
              <div className="space-y-6 opacity-90">
                {pastMonths.map((month) => (
                  <VacationMonthTable
                    key={`${yearNum}-past-${month}`}
                    yearNum={yearNum}
                    month={month}
                    data={data}
                    vacations={vacations}
                    clinicClosedDays={clinicClosedDays}
                    physioById={physioById}
                    isDark={isDark}
                    onAdd={addDayPhysio}
                    onRemove={removeEntry}
                    onToggleCertainty={toggleCertainty}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      ) : null}

      <div className="mt-10 flex justify-center pb-2">
        <button
          type="button"
          onClick={() => setClosedPanelOpen(true)}
          className="text-[13px] text-slate-400/70 underline-offset-2 hover:text-slate-500 hover:underline dark:text-slate-600 dark:hover:text-slate-500"
        >
          Dni nieczynne placówki
        </button>
      </div>

      {closedPanelOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/25"
            aria-label="Zamknij panel"
            onClick={() => setClosedPanelOpen(false)}
          />
          <aside
            className="fixed right-0 top-0 z-50 flex h-full w-[min(100vw,22rem)] flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
            role="dialog"
            aria-label="Dni nieczynne placówki"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h3 className="text-[19px] font-semibold text-slate-800 dark:text-slate-100">
                Placówka nieczynna
              </h3>
              <button
                type="button"
                onClick={() => setClosedPanelOpen(false)}
                className="rounded-md px-2 py-1 text-[19px] text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Zamknij"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <p className="text-[16px] text-slate-500 dark:text-slate-400">
                Dodany dzień blokuje ustawianie urlopu. 14 sierpnia jest zawsze nieczynny.
              </p>

              <div>
                <span className="mb-1 block text-[19px] font-medium text-slate-700 dark:text-slate-300">
                  Nowa data
                </span>
                <div className="mb-2 rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800">
                  <DatePickerCell
                    value={closedDraft}
                    onChange={setClosedDraft}
                    title="Dzień nieczynny"
                    textClassName="text-[19px]"
                  />
                </div>
                <Btn
                  onClick={addClinicClosedDay}
                  disabled={
                    !toDateInputValue(closedDraft) ||
                    isPolishPublicHoliday(toDateInputValue(closedDraft))
                  }
                  className="w-full"
                >
                  Dodaj dzień nieczynny
                </Btn>
              </div>

              <div>
                <h4 className="mb-2 text-[19px] font-medium text-slate-700 dark:text-slate-300">
                  Lista
                </h4>
                {closedDaysSorted.length === 0 ? (
                  <p className="text-[16px] text-slate-400">Brak dodatkowych dni</p>
                ) : (
                  <ul className="space-y-2">
                    {closedDaysSorted.map((iso) => (
                      <li
                        key={iso}
                        className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-950/40"
                      >
                        <span className="font-medium text-red-700 dark:text-red-300">
                          {formatDatePL(iso)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeClinicClosedDay(iso)}
                          className="text-red-600 hover:underline dark:text-red-400"
                        >
                          Usuń
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
