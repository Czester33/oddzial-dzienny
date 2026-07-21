import type { AppData, ArchivedVacationYear, Physiotherapist, VacationEntry } from "./types";
import { getLastWorkingDayOfMonth, isoFromParts, isWorkingDay, todayIsoDate, toDateInputValue } from "./date-utils";

/** Fixed vacation person for massage therapist (not in physiotherapists list). */
export const VACATION_KRZYSZTOF_ID = "vacation-krzysztof";

export const VACATION_KRZYSZTOF: Physiotherapist = {
  id: VACATION_KRZYSZTOF_ID,
  name: "Krzysztof",
  color: "#5D4037",
  rowColor: "#BCAAA4",
};

/** Physiotherapists + Krzysztof (masaże) for vacation pickers. */
export function vacationStaff(data: AppData): Physiotherapist[] {
  return [...data.physiotherapists, VACATION_KRZYSZTOF];
}

export function resolveVacationPerson(
  data: AppData,
  id: string
): Physiotherapist | undefined {
  if (id === VACATION_KRZYSZTOF_ID) return VACATION_KRZYSZTOF;
  return data.physiotherapists.find((p) => p.id === id);
}

function normalizeVacationEntry(entry: VacationEntry): VacationEntry {
  return {
    date: entry.date,
    physiotherapistId: entry.physiotherapistId,
    certainty: entry.certainty === "uncertain" ? "uncertain" : "certain",
  };
}

/**
 * Archive on/after the last working day of December for that year.
 * Empty years are skipped.
 */
export function shouldAutoArchiveVacationYear(
  yearKey: string,
  entries: VacationEntry[],
  todayIso: string = todayIsoDate()
): boolean {
  if (!entries.length) return false;
  const year = Number(yearKey);
  if (!Number.isFinite(year)) return false;
  const lastWorkingDay = getLastWorkingDayOfMonth(year, 11);
  return todayIso >= lastWorkingDay;
}

export function archiveVacationYear(
  data: AppData,
  yearKey: string,
  archivedAt: string = new Date().toISOString()
): AppData {
  const entries = data.vacations[yearKey] ?? [];
  if (entries.length === 0) return data;

  const entry: ArchivedVacationYear = {
    yearKey,
    archivedAt,
    entries: entries.map(normalizeVacationEntry),
  };

  const existing = data.vacationArchive ?? [];
  const withoutDup = existing.filter((y) => y.yearKey !== yearKey);
  const nextVacations = { ...data.vacations };
  delete nextVacations[yearKey];

  return {
    ...data,
    vacations: nextVacations,
    vacationArchive: [...withoutDup, entry].sort((a, b) =>
      b.yearKey.localeCompare(a.yearKey)
    ),
  };
}

export function applyAutoArchiveVacations(
  data: AppData,
  now = new Date()
): AppData {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  let next = data;
  let changed = false;

  for (const [key, entries] of Object.entries(data.vacations ?? {})) {
    if (!shouldAutoArchiveVacationYear(key, entries, today)) continue;
    // Skip if already archived (defensive)
    if ((next.vacationArchive ?? []).some((y) => y.yearKey === key)) {
      const cleared = { ...next.vacations };
      delete cleared[key];
      next = { ...next, vacations: cleared };
      changed = true;
      continue;
    }
    next = archiveVacationYear(next, key, now.toISOString());
    changed = true;
  }

  return changed ? next : data;
}

export function hasAutoArchiveVacationChanges(before: AppData, after: AppData): boolean {
  return (
    JSON.stringify(before.vacations) !== JSON.stringify(after.vacations) ||
    JSON.stringify(before.vacationArchive ?? []) !==
      JSON.stringify(after.vacationArchive ?? [])
  );
}

const VACATION_NOTE_RE = /\s*urlop\s+\d{2}\.\d{2}(?:\.\d{2,4})?(?:-\d{2}\.\d{2}(?:\.\d{2,4})?)?\s*/gi;
const KRZYSZTOF_VACATION_PLAIN_RE = /\d{2}\.\d{2}(?:-\d{2}\.\d{2})?-Urlop Krzysztofa/gi;
const KRZYSZTOF_VACATION_HTML_RE =
  /<span[^>]*>\s*\d{2}\.\d{2}(?:-\d{2}\.\d{2})?-Urlop Krzysztofa\s*<\/span>/gi;

function addDaysIso(iso: string, offset: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return isoFromParts(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatVacationDay(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}.${month}`;
}

function formatVacationRange(start: string, end: string): string {
  const from = formatVacationDay(start);
  const to = formatVacationDay(end);
  return from === to ? from : `${from}-${to}`;
}

function stripVacationNote(text: string): string {
  return text.replace(VACATION_NOTE_RE, " ").replace(/\s+/g, " ").trim();
}

function buildVacationNoteText(start: string, end: string): string {
  return `urlop ${formatVacationRange(start, end)}`;
}

function mergeVacationNote(existing: string, vacationNote: string | null): string {
  const base = stripVacationNote(existing);
  if (!vacationNote) return base;
  return base ? `${base} ${vacationNote}` : vacationNote;
}

function stripKrzysztofVacationNote(text: string): string {
  let prev = "";
  let cur = text;
  while (cur !== prev) {
    prev = cur;
    cur = cur
      .replace(KRZYSZTOF_VACATION_HTML_RE, " ")
      .replace(KRZYSZTOF_VACATION_PLAIN_RE, " ")
      .replace(VACATION_NOTE_RE, " ");
  }
  return cur.replace(/\s+/g, " ").trim();
}

/** Krzysztof massage note appears 14 days before vacation start. */
const KRZYSZTOF_VACATION_NOTICE_DAYS = 14;
/** Physio header note appears 2 working days before vacation start. */
const PHYSIO_VACATION_NOTICE_WORKING_DAYS = 2;

function subtractWorkingDays(
  iso: string,
  count: number,
  extraClosedDates: readonly string[] = []
): string {
  let current = iso;
  let remaining = count;
  while (remaining > 0) {
    current = addDaysIso(current, -1);
    if (isWorkingDay(current, extraClosedDates)) {
      remaining -= 1;
    }
  }
  return current;
}

function buildKrzysztofVacationNoteHtml(start: string, end: string): string {
  const label = `${formatVacationRange(start, end)}-Urlop Krzysztofa`;
  return `<span style="font-weight: bold; color: #dc2626;">${label}</span>`;
}

function findActiveKrzysztofVacationNote(
  dates: string[],
  todayIso: string
): string | null {
  for (const { start, end } of groupVacationRanges(dates)) {
    const notifyFrom = addDaysIso(start, -KRZYSZTOF_VACATION_NOTICE_DAYS);
    if (todayIso >= notifyFrom && todayIso <= end) {
      return buildKrzysztofVacationNoteHtml(start, end);
    }
  }
  return null;
}

function mergeKrzysztofVacationNote(existing: string, vacationHtml: string | null): string {
  const base = stripKrzysztofVacationNote(existing);
  if (!vacationHtml) return base;
  return base ? `${vacationHtml} ${base}` : vacationHtml;
}

function daysBetweenIso(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`).getTime();
  const db = new Date(`${b}T12:00:00`).getTime();
  return Math.round((db - da) / 86_400_000);
}

/** Merge marked vacation days into ranges (weekends may gap up to 3 days). */
function groupVacationRanges(dates: string[]): { start: string; end: string }[] {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length === 0) return [];

  const ranges: { start: string; end: string }[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const date = sorted[i];
    if (daysBetweenIso(end, date) <= 3) {
      end = date;
    } else {
      ranges.push({ start, end });
      start = date;
      end = date;
    }
  }
  ranges.push({ start, end });
  return ranges;
}

function collectMarkedVacationDates(data: AppData): Map<string, string[]> {
  const byPhysio = new Map<string, string[]>();

  for (const entries of Object.values(data.vacations ?? {})) {
    for (const entry of entries) {
      const iso = toDateInputValue(entry.date);
      if (!iso || !entry.physiotherapistId) continue;
      const list = byPhysio.get(entry.physiotherapistId) ?? [];
      list.push(iso);
      byPhysio.set(entry.physiotherapistId, list);
    }
  }

  return byPhysio;
}

/** Active range: from 2 working days before start through last vacation day. */
function findActiveVacationNote(
  dates: string[],
  todayIso: string,
  extraClosedDates: readonly string[] = []
): string | null {
  for (const { start, end } of groupVacationRanges(dates)) {
    const notifyFrom = subtractWorkingDays(
      start,
      PHYSIO_VACATION_NOTICE_WORKING_DAYS,
      extraClosedDates
    );
    if (todayIso >= notifyFrom && todayIso <= end) {
      return buildVacationNoteText(start, end);
    }
  }
  return null;
}

/**
 * Sync vacation period into physio header notes (and massage header for Krzysztof).
 * Physios: from 2 working days before vacation through last vacation day.
 * Krzysztof (massage): from 14 days before vacation through last vacation day.
 */
export function applyVacationNotes(
  data: AppData,
  todayIso: string = todayIsoDate()
): AppData {
  const byPhysio = collectMarkedVacationDates(data);
  const clinicClosedDays = data.clinicClosedDays ?? [];

  let nextPhysios = data.physiotherapists;
  let physiosChanged = false;

  for (const physio of data.physiotherapists) {
    const dates = byPhysio.get(physio.id) ?? [];
    const vacationNote = findActiveVacationNote(dates, todayIso, clinicClosedDays);
    const merged = mergeVacationNote(physio.headerNote ?? "", vacationNote);
    if (merged !== (physio.headerNote ?? "")) {
      if (!physiosChanged) {
        nextPhysios = [...data.physiotherapists];
        physiosChanged = true;
      }
      const idx = nextPhysios.findIndex((p) => p.id === physio.id);
      if (idx >= 0) {
        nextPhysios[idx] = { ...nextPhysios[idx], headerNote: merged || undefined };
      }
    }
  }

  const krzysztofDates = byPhysio.get(VACATION_KRZYSZTOF_ID) ?? [];
  const krzysztofNote = findActiveKrzysztofVacationNote(krzysztofDates, todayIso);
  const mergedMassageNote = mergeKrzysztofVacationNote(
    data.massages?.headerNote ?? "",
    krzysztofNote
  );
  const massageChanged = mergedMassageNote !== (data.massages?.headerNote ?? "");

  if (!physiosChanged && !massageChanged) return data;

  return {
    ...data,
    physiotherapists: nextPhysios,
    ...(massageChanged
      ? {
          massages: {
            ...data.massages,
            headerNote: mergedMassageNote,
          },
        }
      : {}),
  };
}

export function hasVacationNoteChanges(before: AppData, after: AppData): boolean {
  if (before.physiotherapists.length !== after.physiotherapists.length) return true;
  for (let i = 0; i < before.physiotherapists.length; i++) {
    if ((before.physiotherapists[i].headerNote ?? "") !== (after.physiotherapists[i].headerNote ?? "")) {
      return true;
    }
  }
  return (before.massages?.headerNote ?? "") !== (after.massages?.headerNote ?? "");
}
