import type { AppData, Patient } from "./types";
import { toDateInputValue } from "./date-utils";

const DEFAULT_DISCHARGE_HOUR = 18;
const DEFAULT_DISCHARGE_MINUTE = 0;
const TIMEZONE = "Europe/Warsaw";

/** One-off test: auto-discharge today at 19:52 Warsaw time */
const TEST_DISCHARGE_DATE = "2026-07-07";
const TEST_DISCHARGE_HOUR = 19;
const TEST_DISCHARGE_MINUTE = 52;

function getDischargeDeadline(now: Date): { hour: number; minute: number } {
  const warsaw = getWarsawDateParts(now);
  const todayIso = `${warsaw.year}-${String(warsaw.month).padStart(2, "0")}-${String(warsaw.day).padStart(2, "0")}`;

  if (todayIso === TEST_DISCHARGE_DATE) {
    return { hour: TEST_DISCHARGE_HOUR, minute: TEST_DISCHARGE_MINUTE };
  }

  return { hour: DEFAULT_DISCHARGE_HOUR, minute: DEFAULT_DISCHARGE_MINUTE };
}

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

function isPastDischargeTime(now: Date): boolean {
  const warsaw = getWarsawDateParts(now);
  const { hour, minute } = getDischargeDeadline(now);
  const nowMinutes = warsaw.hour * 60 + warsaw.minute;
  const deadlineMinutes = hour * 60 + minute;
  return nowMinutes >= deadlineMinutes;
}

export function shouldAutoDischarge(dischargeDate: string, now = new Date()): boolean {
  const iso = toDateInputValue(dischargeDate);
  if (!iso) return false;

  const [year, month, day] = iso.split("-").map(Number);
  const warsaw = getWarsawDateParts(now);

  if (warsaw.year > year) return true;
  if (warsaw.year < year) return false;
  if (warsaw.month > month) return true;
  if (warsaw.month < month) return false;
  if (warsaw.day > day) return true;
  if (warsaw.day < day) return false;
  return isPastDischargeTime(now);
}

export function purgeDischargedPatients(patients: Patient[], now = new Date()): Patient[] {
  return patients.filter((p) => !shouldAutoDischarge(p.dischargeDate, now));
}

export function applyAutoDischarge(data: AppData, now = new Date()): AppData {
  const currentPatients: Record<string, Patient[]> = {};

  for (const physio of data.physiotherapists) {
    const patients = data.currentPatients[physio.id] ?? [];
    const kept = purgeDischargedPatients(patients, now);
    currentPatients[physio.id] = kept;
  }

  return { ...data, currentPatients };
}

export function hasAutoDischargeChanges(before: AppData, after: AppData): boolean {
  for (const physio of before.physiotherapists) {
    const a = before.currentPatients[physio.id] ?? [];
    const b = after.currentPatients[physio.id] ?? [];
    if (a.length !== b.length) return true;
    if (a.some((patient, index) => patient.id !== b[index]?.id)) return true;
  }
  return false;
}
