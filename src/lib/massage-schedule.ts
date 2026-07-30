import type { AppData, MassageHourChange, MassagePatient, MassageWaiting } from "@/lib/types";
import { formatDatePL, isoFromParts, isWeekend, toDateInputValue } from "@/lib/date-utils";

export const MAX_MASSAGES_PER_DAY = 12;

export function parseTimeLabel(value: string | undefined | null): { hours: number; minutes: number } | null {
  const match = (value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function isCompleteTime(value: string): boolean {
  return parseTimeLabel(value) !== null;
}

export function formatTimeLabel(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function timeToMinutes(value: string): number {
  const parsed = parseTimeLabel(value);
  if (!parsed) return Number.MAX_SAFE_INTEGER;
  return parsed.hours * 60 + parsed.minutes;
}

export function parseScheduleRange(scheduleHours: string): { start: string; end: string } {
  const [start = "7:45", end = "13:45"] = scheduleHours.split("-").map((part) => part.trim());
  return { start, end };
}

export function buildTimeSlots(scheduleHours: string, stepMinutes = 15): string[] {
  const { start, end } = parseScheduleRange(scheduleHours);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes >= endMinutes) return [start];

  const slots: string[] = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += stepMinutes) {
    slots.push(formatTimeLabel(Math.floor(minutes / 60), minutes % 60));
  }
  return slots;
}

export function getValidHours(scheduleHours: string): number[] {
  const hours = new Set<number>();
  for (const slot of buildTimeSlots(scheduleHours)) {
    const parsed = parseTimeLabel(slot);
    if (parsed) hours.add(parsed.hours);
  }
  return [...hours].sort((a, b) => a - b);
}

export function getValidMinutesForHour(scheduleHours: string, hour: number): number[] {
  return buildTimeSlots(scheduleHours)
    .map((slot) => parseTimeLabel(slot))
    .filter((parsed): parsed is { hours: number; minutes: number } => parsed !== null && parsed.hours === hour)
    .map((parsed) => parsed.minutes);
}

export function sortMassagePatientsByHour(patients: MassagePatient[]): MassagePatient[] {
  return patients
    .map((patient, index) => ({ patient, index }))
    .sort((a, b) => {
      const aComplete = isCompleteTime(a.patient.hour);
      const bComplete = isCompleteTime(b.patient.hour);

      if (!aComplete && !bComplete) return a.index - b.index;
      if (!aComplete) return 1;
      if (!bComplete) return -1;

      const byHour = timeToMinutes(a.patient.hour) - timeToMinutes(b.patient.hour);
      if (byHour !== 0) return byHour;

      const byName = a.patient.name.localeCompare(b.patient.name, "pl");
      if (byName !== 0) return byName;

      return a.index - b.index;
    })
    .map(({ patient }) => patient);
}

const TIMEZONE = "Europe/Warsaw";
const CLEAR_DELAY_MINUTES = 20;

function getWarsawDateParts(now: Date) {
  const formatter = new Intl.DateTimeFormat("pl-PL", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Clear row when end date is today and 20 minutes after planned hour (or end date already passed). */
export function shouldClearMassagePatient(patient: MassagePatient, now = new Date()): boolean {
  const endDate = toDateInputValue(patient.lastTreatmentDate);
  const planned = parseTimeLabel(patient.hour);
  if (!endDate || !planned) return false;

  const warsaw = getWarsawDateParts(now);
  const todayIso = `${warsaw.year}-${String(warsaw.month).padStart(2, "0")}-${String(warsaw.day).padStart(2, "0")}`;

  if (endDate < todayIso) return true;
  if (endDate > todayIso) return false;

  const clearAt = planned.hours * 60 + planned.minutes + CLEAR_DELAY_MINUTES;
  const nowMinutes = warsaw.hour * 60 + warsaw.minute;
  return nowMinutes >= clearAt;
}

export function purgeFinishedMassagePatients(
  patients: MassagePatient[],
  now = new Date()
): MassagePatient[] {
  return patients.filter((p) => !shouldClearMassagePatient(p, now));
}

export function applyAutoClearMassages(data: AppData, now = new Date()): AppData {
  const active = data.massages?.active ?? [];
  const kept = purgeFinishedMassagePatients(active, now);
  if (kept.length === active.length && kept.every((p, i) => p.id === active[i]?.id)) {
    return data;
  }
  return {
    ...data,
    massages: {
      ...data.massages,
      active: kept,
    },
  };
}

export function hasAutoClearMassageChanges(before: AppData, after: AppData): boolean {
  const a = before.massages?.active ?? [];
  const b = after.massages?.active ?? [];
  if (a.length !== b.length) return true;
  return a.some((patient, index) => patient.id !== b[index]?.id);
}

function waitingPlainName(patient: MassageWaiting): string {
  return patient.name.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

/** Waiting entry is ready when it has a name and OD kiedy is today/past (or empty = ASAP). */
export function isWaitingReadyToActivate(patient: MassageWaiting, now = new Date()): boolean {
  if (!waitingPlainName(patient)) return false;

  const todayIso = getTodayIso(now);
  const startDate = toDateInputValue(patient.startDate);
  const endDate = toDateInputValue(patient.lastTreatmentDate);

  if (endDate && endDate < todayIso) return false;
  if (startDate && startDate > todayIso) return false;
  return true;
}

/**
 * Move ready waiting patients into active while free slots remain (max 12).
 * Order: earliest OD kiedy, then list order.
 */
export function promoteWaitingToActive(data: AppData, now = new Date()): AppData {
  const todayIso = getTodayIso(now);
  const active = [...(data.massages?.active ?? [])];
  const waiting = [...(data.massages?.waiting ?? [])];

  if (active.length >= MAX_MASSAGES_PER_DAY) return data;

  const ready = waiting
    .map((patient, index) => ({ patient, index }))
    .filter(({ patient }) => isWaitingReadyToActivate(patient, now))
    .sort((a, b) => {
      const startA = toDateInputValue(a.patient.startDate) || todayIso;
      const startB = toDateInputValue(b.patient.startDate) || todayIso;
      if (startA !== startB) return startA.localeCompare(startB);
      return a.index - b.index;
    });

  if (ready.length === 0) return data;

  const promotedIds = new Set<string>();
  for (const { patient } of ready) {
    if (active.length >= MAX_MASSAGES_PER_DAY) break;
    active.push({
      id: patient.id,
      name: patient.name,
      hour: patient.hour ?? "",
      lastTreatmentDate: patient.lastTreatmentDate,
      physiotherapistId: patient.physiotherapistId,
      ...(patient.plannedHourChange ? { plannedHourChange: patient.plannedHourChange } : {}),
    });
    promotedIds.add(patient.id);
  }

  if (promotedIds.size === 0) return data;

  return {
    ...data,
    massages: {
      ...data.massages,
      active: sortMassagePatientsByHour(active),
      waiting: waiting.filter((p) => !promotedIds.has(p.id)),
    },
  };
}

function countOccupancyOnDay(
  active: MassagePatient[],
  waiting: MassageWaiting[],
  day: string,
  todayIso: string
): number {
  return (
    active.reduce((n, p) => (occupiesActiveOnDay(p, day) ? n + 1 : n), 0) +
    waiting.reduce((n, p) => (occupiesWaitingOnDay(p, day, todayIso) ? n + 1 : n), 0)
  );
}

function computeTodaySlotPeak(
  active: MassagePatient[],
  waiting: MassageWaiting[],
  existing: { date: string; count: number } | undefined,
  now = new Date()
): { date: string; count: number } {
  const todayIso = getTodayIso(now);
  const current = countOccupancyOnDay(active, waiting, todayIso, todayIso);
  if (!existing || existing.date !== todayIso) {
    return { date: todayIso, count: current };
  }
  return { date: todayIso, count: Math.max(existing.count, current) };
}

/** Clear finished actives, apply planned hour changes, then fill free slots from waiting. */
export function applyMassageSync(data: AppData, now = new Date()): AppData {
  const cleared = applyAutoClearMassages(data, now);
  const withHours = applyPlannedHourChanges(cleared, now);
  const next = promoteWaitingToActive(withHours, now);
  const active = next.massages?.active ?? [];
  const waiting = next.massages?.waiting ?? [];
  const peak = computeTodaySlotPeak(active, waiting, next.massages?.todaySlotPeak, now);
  const prev = next.massages?.todaySlotPeak;
  if (prev?.date === peak.date && prev?.count === peak.count) {
    return next;
  }
  return {
    ...next,
    massages: {
      ...next.massages,
      todaySlotPeak: peak,
    },
  };
}

export function hasMassageSyncChanges(before: AppData, after: AppData): boolean {
  if (hasAutoClearMassageChanges(before, after)) return true;
  const aa = before.massages?.active ?? [];
  const ba = after.massages?.active ?? [];
  if (aa.length !== ba.length) return true;
  if (
    aa.some(
      (patient, index) =>
        patient.id !== ba[index]?.id ||
        patient.hour !== ba[index]?.hour ||
        patient.plannedHourChange?.effectiveDate !==
          ba[index]?.plannedHourChange?.effectiveDate ||
        patient.plannedHourChange?.hour !== ba[index]?.plannedHourChange?.hour
    )
  ) {
    return true;
  }
  const aw = before.massages?.waiting ?? [];
  const bw = after.massages?.waiting ?? [];
  if (aw.length !== bw.length) return true;
  if (aw.some((patient, index) => patient.id !== bw[index]?.id)) return true;
  if (
    aw.some(
      (patient, index) =>
        patient.hour !== bw[index]?.hour ||
        patient.plannedHourChange?.effectiveDate !==
          bw[index]?.plannedHourChange?.effectiveDate ||
        patient.plannedHourChange?.hour !== bw[index]?.plannedHourChange?.hour
    )
  ) {
    return true;
  }
  const bp = before.massages?.todaySlotPeak;
  const ap = after.massages?.todaySlotPeak;
  return bp?.date !== ap?.date || bp?.count !== ap?.count;
}

function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return isoFromParts(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Move to the next Monday if the date falls on Saturday or Sunday. */
function toWeekdayIso(iso: string): string {
  let day = iso;
  while (isWeekend(day)) {
    day = addDaysIso(day, 1);
  }
  return day;
}

function getTodayIso(now = new Date()): string {
  const warsaw = getWarsawDateParts(now);
  return `${warsaw.year}-${String(warsaw.month).padStart(2, "0")}-${String(warsaw.day).padStart(2, "0")}`;
}

function normalizePlannedHourChange(
  value: MassageHourChange | undefined
): MassageHourChange | undefined {
  if (!value) return undefined;
  const effectiveDate = toDateInputValue(value.effectiveDate);
  const hour = (value.hour ?? "").trim();
  if (!effectiveDate || !isCompleteTime(hour)) return undefined;
  return { effectiveDate, hour };
}

export function buildPlannedHourChange(
  effectiveDate: string,
  hour: string
): MassageHourChange | undefined {
  return normalizePlannedHourChange({ effectiveDate, hour });
}

export function isFuturePlannedHourChange(
  patient: { plannedHourChange?: MassageHourChange },
  now = new Date()
): boolean {
  const planned = normalizePlannedHourChange(patient.plannedHourChange);
  if (!planned) return false;
  return planned.effectiveDate > getTodayIso(now);
}

export function formatPlannedHourChangeLabel(
  patient: { hour: string; plannedHourChange?: MassageHourChange },
  now = new Date()
): string | undefined {
  const planned = normalizePlannedHourChange(patient.plannedHourChange);
  if (!planned || !isFuturePlannedHourChange(patient, now)) return undefined;
  const oldHour = (patient.hour ?? "").trim() || "—";
  return `${oldHour} ➡️ ${planned.hour}`;
}

export function plannedHourChangeTooltip(
  patient: { hour: string; plannedHourChange?: MassageHourChange },
  now = new Date()
): string | undefined {
  const planned = normalizePlannedHourChange(patient.plannedHourChange);
  if (!planned || !isFuturePlannedHourChange(patient, now)) return undefined;
  return `Od ${formatDatePL(planned.effectiveDate)}: ${planned.hour}`;
}

function applyPlannedHourChangesToPatient<T extends MassagePatient | MassageWaiting>(
  patient: T,
  todayIso: string
): T {
  const planned = normalizePlannedHourChange(patient.plannedHourChange);
  if (!planned || planned.effectiveDate > todayIso) return patient;
  const { plannedHourChange: _removed, ...rest } = patient;
  return { ...rest, hour: planned.hour } as T;
}

function applyPlannedHourChanges(data: AppData, now = new Date()): AppData {
  const todayIso = getTodayIso(now);
  const active = (data.massages?.active ?? []).map((p) =>
    applyPlannedHourChangesToPatient(p, todayIso)
  );
  const waiting = (data.massages?.waiting ?? []).map((p) =>
    applyPlannedHourChangesToPatient(p, todayIso)
  );

  const prevActive = data.massages?.active ?? [];
  const prevWaiting = data.massages?.waiting ?? [];
  const unchanged =
    active.length === prevActive.length &&
    waiting.length === prevWaiting.length &&
    active.every(
      (p, i) =>
        p.id === prevActive[i]?.id &&
        p.hour === prevActive[i]?.hour &&
        p.plannedHourChange?.effectiveDate === prevActive[i]?.plannedHourChange?.effectiveDate &&
        p.plannedHourChange?.hour === prevActive[i]?.plannedHourChange?.hour
    ) &&
    waiting.every(
      (p, i) =>
        p.id === prevWaiting[i]?.id &&
        p.hour === prevWaiting[i]?.hour &&
        p.plannedHourChange?.effectiveDate === prevWaiting[i]?.plannedHourChange?.effectiveDate &&
        p.plannedHourChange?.hour === prevWaiting[i]?.plannedHourChange?.hour
    );

  if (unchanged) return data;

  return {
    ...data,
    massages: {
      ...data.massages,
      active: sortMassagePatientsByHour(active),
      waiting,
    },
  };
}

export type FreeMassageDay = { date: string; count: number };

function occupiesActiveOnDay(patient: MassagePatient, day: string): boolean {
  const endDate = toDateInputValue(patient.lastTreatmentDate);
  if (!endDate) return true;
  return endDate >= day;
}

/** Reserved waiting occupies from OD kiedy (or today) through Do kiedy. */
function occupiesWaitingOnDay(
  patient: MassageWaiting,
  day: string,
  todayIso: string
): boolean {
  const startDate = toDateInputValue(patient.startDate);
  const endDate = toDateInputValue(patient.lastTreatmentDate);
  if (!startDate && !endDate) return false;

  const from = startDate || todayIso;
  if (day < from) return false;
  if (!endDate) return true;
  return day <= endDate;
}

/**
 * Nearest free massage places (max 12/day, weekdays only).
 * Active + waiting reservations occupy slots through "Do kiedy".
 * If today reached full capacity, freed same-day slots appear from tomorrow only.
 */
export function getNearestFreeMassageSlots(
  active: MassagePatient[],
  waiting: MassageWaiting[] = [],
  now = new Date(),
  maxPerDay = MAX_MASSAGES_PER_DAY,
  maxDaysToShow = 8,
  todaySlotPeak?: { date: string; count: number }
): FreeMassageDay[] {
  const todayIso = getTodayIso(now);

  const freeOnDay = (day: string) => {
    const occupying = countOccupancyOnDay(active, waiting, day, todayIso);
    if (day === todayIso && todaySlotPeak?.date === todayIso) {
      const effective = Math.max(occupying, todaySlotPeak.count);
      return Math.max(0, maxPerDay - effective);
    }
    return Math.max(0, maxPerDay - occupying);
  };

  const candidateDays = new Set<string>();
  const todayWeekday = toWeekdayIso(todayIso);
  if (todayWeekday >= todayIso) candidateDays.add(todayWeekday);

  for (const patient of active) {
    const endDate = toDateInputValue(patient.lastTreatmentDate);
    if (!endDate) continue;
    const freeDay = toWeekdayIso(addDaysIso(endDate, 1));
    if (freeDay >= todayIso) candidateDays.add(freeDay);
  }

  for (const patient of waiting) {
    const startDate = toDateInputValue(patient.startDate);
    const endDate = toDateInputValue(patient.lastTreatmentDate);

    if (startDate) {
      const startDay = toWeekdayIso(startDate);
      if (startDay >= todayIso) candidateDays.add(startDay);
    }

    if (endDate) {
      const freeDay = toWeekdayIso(addDaysIso(endDate, 1));
      if (freeDay >= todayIso) candidateDays.add(freeDay);
    }
  }

  return [...candidateDays]
    .filter((date) => !isWeekend(date))
    .sort((a, b) => a.localeCompare(b))
    .map((date) => ({ date, count: freeOnDay(date) }))
    .filter((day) => day.count > 0)
    .slice(0, maxDaysToShow);
}

export function formatFreePlacesLabel(count: number): string {
  if (count === 1) return "1 miejsce";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${count} miejsca`;
  }
  return `${count} miejsc`;
}
