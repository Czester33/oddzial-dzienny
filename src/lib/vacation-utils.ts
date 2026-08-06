import type { AppData, ArchivedVacationMonth, ArchivedVacationYear, Physiotherapist, VacationEntry } from "./types";
import { isoFromParts, isWorkingDay, parseMonthKey, todayIsoDate, toDateInputValue } from "./date-utils";
import { getPhysioById } from "./physio-utils";
import { isHtmlContent, stripHtml } from "./text-format";

function archiveFromFirstDayOfNextMonth(monthKeyValue: string): string {
  const { year, month } = parseMonthKey(monthKeyValue);
  return isoFromParts(year, month + 1, 1);
}

/** Set true when vacation auto-archive should run (monthly, from 1st of next month). */
export const VACATION_AUTO_ARCHIVE_ENABLED = true;

/** Fixed vacation person for massage therapist (not in physiotherapists list). */
export const VACATION_KRZYSZTOF_ID = "vacation-krzysztof";

export const VACATION_KRZYSZTOF: Physiotherapist = {
  id: VACATION_KRZYSZTOF_ID,
  name: "Krzysztof",
  color: "#5D4037",
  rowColor: "#BCAAA4",
};

/** Physiotherapists + Krzysztof (masaże) for vacation pickers. */
/** All active physiotherapists + Krzysztof (masaże) for vacation pickers — includes hidden. */
export function vacationStaff(data: AppData): Physiotherapist[] {
  return [...data.physiotherapists, VACATION_KRZYSZTOF];
}

/** Active + retired + archived profiles for vacation display. */
export function vacationDisplayStaff(data: AppData): Physiotherapist[] {
  const byId = new Map(vacationStaff(data).map((p) => [p.id, p]));
  for (const physio of [
    ...(data.retiredPhysiotherapists ?? []),
    ...(data.archivePhysiotherapistProfiles ?? []),
  ]) {
    if (!byId.has(physio.id)) byId.set(physio.id, physio);
  }
  return [...byId.values()];
}

export function resolveVacationPerson(
  data: AppData,
  id: string
): Physiotherapist | undefined {
  if (id === VACATION_KRZYSZTOF_ID) return VACATION_KRZYSZTOF;
  return getPhysioById(data, id);
}

function normalizeVacationEntry(entry: VacationEntry): VacationEntry {
  return {
    date: entry.date,
    physiotherapistId: entry.physiotherapistId,
    certainty: entry.certainty === "uncertain" ? "uncertain" : "certain",
  };
}

export function vacationMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function vacationEntriesInMonth(
  entries: VacationEntry[],
  monthKey: string
): VacationEntry[] {
  return entries.filter((entry) => entry.date.slice(0, 7) === monthKey);
}

function collectVacationYearsToArchive(data: AppData, now: Date): string[] {
  const years = new Set(Object.keys(data.vacations ?? {}));
  years.add(String(now.getFullYear()));
  for (const month of data.vacationMonthArchive ?? []) {
    years.add(month.monthKey.slice(0, 4));
  }
  return [...years].sort();
}

/** Archive from the first day of the next calendar month (including empty months). */
export function shouldAutoArchiveVacationMonth(
  monthKeyValue: string,
  todayIso: string = todayIsoDate()
): boolean {
  return todayIso >= archiveFromFirstDayOfNextMonth(monthKeyValue);
}

export function archiveVacationMonth(
  data: AppData,
  yearKey: string,
  monthKeyValue: string,
  archivedAt: string = new Date().toISOString()
): AppData {
  const allEntries = data.vacations[yearKey] ?? [];
  const monthEntries = vacationEntriesInMonth(allEntries, monthKeyValue);

  const archivedKeys = new Set(
    monthEntries.map((entry) => `${entry.date}::${entry.physiotherapistId}`)
  );
  const remaining = allEntries.filter(
    (entry) => !archivedKeys.has(`${entry.date}::${entry.physiotherapistId}`)
  );

  const entry: ArchivedVacationMonth = {
    monthKey: monthKeyValue,
    archivedAt,
    entries: monthEntries.map(normalizeVacationEntry),
  };

  const existing = data.vacationMonthArchive ?? [];
  const withoutDup = existing.filter((m) => m.monthKey !== monthKeyValue);
  const nextVacations = { ...data.vacations, [yearKey]: remaining };
  if (remaining.length === 0) {
    delete nextVacations[yearKey];
  }

  return {
    ...data,
    vacations: nextVacations,
    vacationMonthArchive: [...withoutDup, entry].sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    ),
    autoArchiveSkip: withVacationAutoArchiveSkip(data, monthKeyValue, false),
  };
}

/** Move an archived vacation month back into active vacations. */
export function hasActiveVacationMonth(data: AppData, monthKeyValue: string): boolean {
  const yearKey = monthKeyValue.slice(0, 4);
  return vacationEntriesInMonth(data.vacations[yearKey] ?? [], monthKeyValue).length > 0;
}

export function restoreVacationMonthFromArchive(
  data: AppData,
  monthKeyValue: string
): AppData {
  const entry = (data.vacationMonthArchive ?? []).find((m) => m.monthKey === monthKeyValue);
  if (!entry) return data;

  const yearKey = monthKeyValue.slice(0, 4);
  const existing = data.vacations[yearKey] ?? [];
  const merged = [...existing];
  const seen = new Set(existing.map((e) => `${e.date}::${e.physiotherapistId}`));
  for (const raw of entry.entries) {
    const normalized = normalizeVacationEntry(raw);
    const key = `${normalized.date}::${normalized.physiotherapistId}`;
    if (seen.has(key)) continue;
    merged.push(normalized);
    seen.add(key);
  }

  return {
    ...data,
    vacations: {
      ...data.vacations,
      [yearKey]: merged,
    },
    vacationMonthArchive: (data.vacationMonthArchive ?? []).filter(
      (m) => m.monthKey !== monthKeyValue
    ),
    autoArchiveSkip: withVacationAutoArchiveSkip(data, monthKeyValue, true),
  };
}

/**
 * Manual full-year archive (remaining entries). Auto-archive uses months instead.
 * Archive from 1 January of the following year.
 */
export function shouldAutoArchiveVacationYear(
  yearKey: string,
  entries: VacationEntry[],
  todayIso: string = todayIsoDate()
): boolean {
  if (!entries.length) return false;
  const year = Number(yearKey);
  if (!Number.isFinite(year)) return false;
  return todayIso >= `${year + 1}-01-01`;
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
    autoArchiveSkip: withVacationAutoArchiveSkip(data, yearKey, false),
  };
}

function withVacationAutoArchiveSkip(
  data: AppData,
  yearKey: string,
  skip: boolean
): AppData["autoArchiveSkip"] {
  const current = data.autoArchiveSkip ?? {};
  const set = new Set(current.vacations ?? []);
  if (skip) set.add(yearKey);
  else set.delete(yearKey);
  return {
    ...current,
    vacations: [...set].sort(),
  };
}

/** Move an archived vacation year back into active vacations. */
export function hasActiveVacationYear(data: AppData, yearKey: string): boolean {
  return (data.vacations[yearKey] ?? []).length > 0;
}

export function restoreVacationYearFromArchive(
  data: AppData,
  yearKey: string
): AppData {
  const entry = (data.vacationArchive ?? []).find((y) => y.yearKey === yearKey);
  if (!entry) return data;

  return {
    ...data,
    vacations: {
      ...data.vacations,
      [yearKey]: entry.entries.map(normalizeVacationEntry),
    },
    vacationArchive: (data.vacationArchive ?? []).filter((y) => y.yearKey !== yearKey),
    autoArchiveSkip: withVacationAutoArchiveSkip(data, yearKey, true),
  };
}

export function applyAutoArchiveVacations(
  data: AppData,
  now = new Date()
): AppData {
  if (!VACATION_AUTO_ARCHIVE_ENABLED) return data;

  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const skip = new Set(data.autoArchiveSkip?.vacations ?? []);

  let next = data;
  let changed = false;

  for (const yearKey of collectVacationYearsToArchive(data, now)) {
    if (skip.has(yearKey)) continue;

    const yearNum = Number(yearKey);
    if (!Number.isFinite(yearNum)) continue;

    for (let month = 0; month < 12; month++) {
      const monthKey = vacationMonthKey(yearNum, month);
      if (!shouldAutoArchiveVacationMonth(monthKey, today)) continue;

      const activeEntries = next.vacations[yearKey] ?? [];
      const monthEntries = vacationEntriesInMonth(activeEntries, monthKey);

      // Restored months stay editable while they still have active entries.
      if (skip.has(monthKey) && monthEntries.length > 0) continue;

      if ((next.vacationMonthArchive ?? []).some((m) => m.monthKey === monthKey)) {
        if (!monthEntries.length) continue;
        const remaining = activeEntries.filter(
          (entry) =>
            !monthEntries.some(
              (archived) =>
                archived.date === entry.date &&
                archived.physiotherapistId === entry.physiotherapistId
            )
        );
        const nextVacations = { ...next.vacations, [yearKey]: remaining };
        if (remaining.length === 0) {
          delete nextVacations[yearKey];
        }
        next = { ...next, vacations: nextVacations };
        changed = true;
        continue;
      }

      next = archiveVacationMonth(next, yearKey, monthKey, now.toISOString());
      changed = true;
    }
  }

  return changed ? next : data;
}

export function hasAutoArchiveVacationChanges(before: AppData, after: AppData): boolean {
  return (
    JSON.stringify(before.vacations) !== JSON.stringify(after.vacations) ||
    JSON.stringify(before.vacationArchive ?? []) !==
      JSON.stringify(after.vacationArchive ?? []) ||
    JSON.stringify(before.vacationMonthArchive ?? []) !==
      JSON.stringify(after.vacationMonthArchive ?? [])
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
  return stripHtml(text.replace(VACATION_NOTE_RE, " ").replace(/\s+/g, " "));
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
      .replace(KRZYSZTOF_VACATION_HTML_RE, "")
      .replace(KRZYSZTOF_VACATION_PLAIN_RE, "")
      .replace(VACATION_NOTE_RE, " ");
  }
  cur = cur.trim();
  if (!isHtmlContent(cur)) {
    return stripHtml(cur.replace(/\s+/g, " ")).trim();
  }
  return cur
    .replace(/<div[^>]*>\s*<\/div>/gi, "")
    .replace(/<p[^>]*>\s*<\/p>/gi, "")
    .replace(/(<br\s*\/?>\s*){2,}/gi, "<br>")
    .trim();
}

function extractKrzysztofVacationLabel(vacationHtml: string): string | null {
  const match = vacationHtml.match(/\d{2}\.\d{2}(?:-\d{2}\.\d{2})?-Urlop Krzysztofa/i);
  return match ? match[0] : null;
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
  todayIso: string,
  extraClosedDates: readonly string[] = []
): string | null {
  for (const { start, end } of groupVacationRanges(dates, extraClosedDates)) {
    const notifyFrom = addDaysIso(start, -KRZYSZTOF_VACATION_NOTICE_DAYS);
    if (todayIso >= notifyFrom && todayIso <= end) {
      return buildKrzysztofVacationNoteHtml(start, end);
    }
  }
  return null;
}

function mergeKrzysztofVacationNote(existing: string, vacationHtml: string | null): string {
  if (!vacationHtml) {
    return stripKrzysztofVacationNote(existing);
  }

  const label = extractKrzysztofVacationLabel(vacationHtml);
  if (label && existing.includes(label)) {
    return existing;
  }

  const base = stripKrzysztofVacationNote(existing);
  if (!base) return vacationHtml;

  if (isHtmlContent(base) || isHtmlContent(vacationHtml)) {
    const separator = base.trimStart().startsWith("<") ? "" : "<br>";
    return `${vacationHtml}${separator}${base}`;
  }
  return `${vacationHtml} ${base}`;
}

function canBridgeVacationGap(
  from: string,
  to: string,
  extraClosedDates: readonly string[] = []
): boolean {
  let current = from;
  while (true) {
    current = addDaysIso(current, 1);
    if (current >= to) return true;
    if (isWorkingDay(current, extraClosedDates)) return false;
  }
}

/** Merge marked vacation days; gaps of only non-working days stay in one range. */
function groupVacationRanges(
  dates: string[],
  extraClosedDates: readonly string[] = []
): { start: string; end: string }[] {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length === 0) return [];

  const ranges: { start: string; end: string }[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const date = sorted[i];
    if (canBridgeVacationGap(end, date, extraClosedDates)) {
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

/** True when the physiotherapist has a vacation mark on the given calendar day. */
export function isPhysioOnVacationOnDate(
  data: AppData,
  physiotherapistId: string,
  dateIso: string
): boolean {
  const day = toDateInputValue(dateIso);
  if (!day || !physiotherapistId) return false;

  const yearKey = day.slice(0, 4);
  const active = data.vacations?.[yearKey] ?? [];
  if (
    active.some(
      (entry) =>
        entry.physiotherapistId === physiotherapistId &&
        toDateInputValue(entry.date) === day
    )
  ) {
    return true;
  }

  const monthKeyValue = day.slice(0, 7);
  const archived = (data.vacationMonthArchive ?? []).find(
    (month) => month.monthKey === monthKeyValue
  );
  return Boolean(
    archived?.entries.some(
      (entry) =>
        entry.physiotherapistId === physiotherapistId &&
        toDateInputValue(entry.date) === day
    )
  );
}

/** Active range: from 2 working days before start through last vacation day. */
function findActiveVacationNote(
  dates: string[],
  todayIso: string,
  extraClosedDates: readonly string[] = []
): string | null {
  for (const { start, end } of groupVacationRanges(dates, extraClosedDates)) {
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
  const krzysztofNote = findActiveKrzysztofVacationNote(
    krzysztofDates,
    todayIso,
    clinicClosedDays
  );
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
