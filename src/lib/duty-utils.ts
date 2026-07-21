import type { AppData, ArchivedDutyMonth, DutyEntry } from "./types";
import {
  getFacilityClosingMinutesForDate,
  getFacilityClosingTimeForDate,
  getLastWorkingDayOfMonth,
  parseMonthKey,
  todayIsoDate,
  toDateInputValue,
} from "./date-utils";

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
  };
}

export function applyAutoArchiveDuties(
  data: AppData,
  now = new Date()
): AppData {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  let next = data;
  let changed = false;

  for (const [key, entries] of Object.entries(data.duties ?? {})) {
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
  return text.replace(DUTY_NOTE_RE, " ").replace(/\s+/g, " ").trim();
}

function buildDutyNoteText(dateIso: string): string {
  return `13:25-${getFacilityClosingTimeForDate(dateIso)}`;
}

function mergeDutyNote(existing: string, dutyNote: string | null): string {
  const base = stripDutyNote(existing);
  if (!dutyNote) return base;
  return base ? `${dutyNote} ${base}` : dutyNote;
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

function findActiveDutyNote(dutyDates: string[], now: Date): string | null {
  const todayIso = todayIsoDateFromDate(now);
  if (!dutyDates.includes(todayIso)) return null;

  const workDayEndMinutes = getFacilityClosingMinutesForDate(todayIso);
  if (!isDutyNoteWindow(now, workDayEndMinutes)) return null;

  return buildDutyNoteText(todayIso);
}

function todayIsoDateFromDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Show duty note on physio header from 7:00 through facility closing on their duty day. */
export function applyDutyNotes(data: AppData, now = new Date()): AppData {
  const byPhysio = collectDutyDatesByPhysio(data);

  let nextPhysios = data.physiotherapists;
  let changed = false;

  for (const physio of data.physiotherapists) {
    const dutyDates = byPhysio.get(physio.id) ?? [];
    const dutyNote = findActiveDutyNote(dutyDates, now);
    const merged = mergeDutyNote(physio.headerNote ?? "", dutyNote);
    if (merged !== (physio.headerNote ?? "")) {
      if (!changed) {
        nextPhysios = [...data.physiotherapists];
        changed = true;
      }
      const idx = nextPhysios.findIndex((p) => p.id === physio.id);
      if (idx >= 0) {
        nextPhysios[idx] = { ...nextPhysios[idx], headerNote: merged || undefined };
      }
    }
  }

  if (!changed) return data;

  return {
    ...data,
    physiotherapists: nextPhysios,
  };
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
