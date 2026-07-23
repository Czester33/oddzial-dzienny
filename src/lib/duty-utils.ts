import type { AppData, ArchivedDutyMonth, DutyEntry } from "./types";
import {
  getFacilityClosingMinutesForDate,
  getFacilityClosingTimeForDate,
  getLastWorkingDayOfMonth,
  parseMonthKey,
  todayIsoDate,
  toDateInputValue,
} from "./date-utils";
import { stripHtml } from "./text-format";

export const DUTY_NOTE_START_MINUTES = 7 * 60;

const DUTY_NOTE_RE = /\s*(?:13:25-\d{2}:\d{2}|13:25|dyżur\s+\d{2}\.\d{2})\s*/gi;

function normalizeDutyEntry(entry: DutyEntry): DutyEntry {
  return {
    date: entry.date,
    physiotherapistId: entry.physiotherapistId ?? "",
  };
}

function dutyMonthHasData(entries: DutyEntry[]): boolean {
  return entries.some((e) => Boolean(e.physiotherapistId));
}

/**
 * Archive on/after the last working day of that month.
 * Empty / unassigned months are skipped.
 */
export function shouldAutoArchiveDutyMonth(
  monthKeyValue: string,
  entries: DutyEntry[],
  todayIso: string = todayIsoDate()
): boolean {
  if (!dutyMonthHasData(entries)) return false;
  const { year, month } = parseMonthKey(monthKeyValue);
  const lastWorkingDay = getLastWorkingDayOfMonth(year, month);
  return todayIso >= lastWorkingDay;
}

export function archiveDutyMonth(
  data: AppData,
  monthKeyValue: string,
  archivedAt: string = new Date().toISOString()
): AppData {
  const entries = data.duties[monthKeyValue] ?? [];
  if (!dutyMonthHasData(entries)) return data;

  const entry: ArchivedDutyMonth = {
    monthKey: monthKeyValue,
    archivedAt,
    entries: entries.map(normalizeDutyEntry),
  };

  const existing = data.dutyArchive ?? [];
  const withoutDup = existing.filter((m) => m.monthKey !== monthKeyValue);
  const nextDuties = { ...data.duties };
  delete nextDuties[monthKeyValue];

  return {
    ...data,
    duties: nextDuties,
    dutyArchive: [...withoutDup, entry].sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    ),
    autoArchiveSkip: withDutyAutoArchiveSkip(data, monthKeyValue, false),
  };
}

function withDutyAutoArchiveSkip(
  data: AppData,
  monthKeyValue: string,
  skip: boolean
): AppData["autoArchiveSkip"] {
  const current = data.autoArchiveSkip ?? {};
  const set = new Set(current.duties ?? []);
  if (skip) set.add(monthKeyValue);
  else set.delete(monthKeyValue);
  return {
    ...current,
    duties: [...set].sort(),
  };
}

/** Move an archived duty month back into active duties. */
export function restoreDutyMonthFromArchive(
  data: AppData,
  monthKeyValue: string
): AppData {
  const entry = (data.dutyArchive ?? []).find((m) => m.monthKey === monthKeyValue);
  if (!entry) return data;

  return {
    ...data,
    duties: {
      ...data.duties,
      [monthKeyValue]: entry.entries.map(normalizeDutyEntry),
    },
    dutyArchive: (data.dutyArchive ?? []).filter((m) => m.monthKey !== monthKeyValue),
    autoArchiveSkip: withDutyAutoArchiveSkip(data, monthKeyValue, true),
  };
}

export function applyAutoArchiveDuties(
  data: AppData,
  now = new Date()
): AppData {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const skip = new Set(data.autoArchiveSkip?.duties ?? []);

  let next = data;
  let changed = false;

  for (const [key, entries] of Object.entries(data.duties ?? {})) {
    if (skip.has(key)) continue;
    if (!shouldAutoArchiveDutyMonth(key, entries, today)) continue;
    if ((next.dutyArchive ?? []).some((m) => m.monthKey === key)) {
      const cleared = { ...next.duties };
      delete cleared[key];
      next = { ...next, duties: cleared };
      changed = true;
      continue;
    }
    next = archiveDutyMonth(next, key, now.toISOString());
    changed = true;
  }

  return changed ? next : data;
}

export function hasAutoArchiveDutyChanges(before: AppData, after: AppData): boolean {
  return (
    JSON.stringify(before.duties) !== JSON.stringify(after.duties) ||
    JSON.stringify(before.dutyArchive ?? []) !== JSON.stringify(after.dutyArchive ?? [])
  );
}

function stripDutyNote(text: string): string {
  return stripHtml(text.replace(DUTY_NOTE_RE, " ").replace(/\s+/g, " ")).trim();
}

function buildDutyNoteText(dateIso: string): string {
  return `13:25-${getFacilityClosingTimeForDate(dateIso)}`;
}

function isDutyNoteWindow(now: Date, workDayEndMinutes: number): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= DUTY_NOTE_START_MINUTES && minutes <= workDayEndMinutes;
}

function collectDutyDatesByPhysio(data: AppData): Map<string, string[]> {
  const byPhysio = new Map<string, string[]>();

  for (const entries of Object.values(data.duties ?? {})) {
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

function todayIsoDateFromDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findActiveDutyNote(dutyDates: string[], now: Date): string | null {
  const todayIso = todayIsoDateFromDate(now);
  if (!dutyDates.includes(todayIso)) return null;

  const workDayEndMinutes = getFacilityClosingMinutesForDate(todayIso);
  if (!isDutyNoteWindow(now, workDayEndMinutes)) return null;

  return buildDutyNoteText(todayIso);
}

/** Live duty badge text for a physiotherapist (not stored in headerNote). */
export function getActiveDutyNoteForPhysio(
  data: AppData,
  physiotherapistId: string,
  now = new Date()
): string | null {
  const dutyDates = collectDutyDatesByPhysio(data).get(physiotherapistId) ?? [];
  return findActiveDutyNote(dutyDates, now);
}

/** Remove auto duty times from stored header notes (vacation / manual text stays). */
export function stripPersistedDutyNotes(text: string): string {
  return stripDutyNote(text);
}

/**
 * Clean persisted duty times from physio headers.
 * Duty badges are computed live in the UI so sync cannot make them flicker.
 */
export function applyDutyNotes(data: AppData, _now = new Date()): AppData {
  let nextPhysios = data.physiotherapists;
  let changed = false;

  for (let i = 0; i < data.physiotherapists.length; i++) {
    const physio = data.physiotherapists[i];
    const current = physio.headerNote ?? "";
    const cleaned = stripDutyNote(current);
    if (cleaned === current) continue;
    if (!changed) {
      nextPhysios = [...data.physiotherapists];
      changed = true;
    }
    nextPhysios[i] = { ...physio, headerNote: cleaned || "" };
  }

  if (!changed) return data;
  return { ...data, physiotherapists: nextPhysios };
}

export function hasDutyNoteChanges(before: AppData, after: AppData): boolean {
  if (before.physiotherapists.length !== after.physiotherapists.length) return true;
  for (let i = 0; i < before.physiotherapists.length; i++) {
    if ((before.physiotherapists[i].headerNote ?? "") !== (after.physiotherapists[i].headerNote ?? "")) {
      return true;
    }
  }
  return false;
}
