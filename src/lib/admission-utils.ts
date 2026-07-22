import { v4 as uuidv4 } from "uuid";
import { getPlannedDischargeDate, getLastWorkingDayOfMonth, monthKey, parseMonthKey, toDateInputValue, todayIsoDate } from "@/lib/date-utils";
import { isCompleteTime, timeToMinutes } from "@/lib/massage-schedule";
import { stripHtml } from "@/lib/text-format";
import type {
  Admission,
  AdmissionSession,
  AdmissionSlot,
  AppData,
  ArchivedAdmissionMonth,
  Doctor,
} from "@/lib/types";

export function createDoctor(name = ""): Doctor {
  return { id: uuidv4(), name };
}

export function getDoctorName(data: AppData, doctorId: string): string {
  if (!doctorId) return "";
  return data.doctors.find((d) => d.id === doctorId)?.name ?? "";
}

export function createAdmissionSlot(): AdmissionSlot {
  return {
    id: uuidv4(),
    patientName: "",
    admissionHour: "",
    physiotherapistId: "",
  };
}

export function sortAdmissionSlotsByHour(slots: AdmissionSlot[]): AdmissionSlot[] {
  return slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => {
      const aComplete = isCompleteTime(a.slot.admissionHour);
      const bComplete = isCompleteTime(b.slot.admissionHour);

      if (!aComplete && !bComplete) return a.index - b.index;
      if (!aComplete) return 1;
      if (!bComplete) return -1;

      const byHour = timeToMinutes(a.slot.admissionHour) - timeToMinutes(b.slot.admissionHour);
      if (byHour !== 0) return byHour;

      const byName = stripHtml(a.slot.patientName)
        .trim()
        .localeCompare(stripHtml(b.slot.patientName).trim(), "pl");
      if (byName !== 0) return byName;

      return a.index - b.index;
    })
    .map(({ slot }) => slot);
}

export function isAdmissionSessionPast(
  session: AdmissionSession,
  todayIso: string = todayIsoDate()
): boolean {
  const iso = toDateInputValue(session.admissionDate);
  if (!iso) return false;
  return iso < todayIso;
}

/** Upcoming dated first (by date), then undated, then past at the bottom (by date). */
export function orderAdmissionSessionsWithPastAtBottom(
  sessions: AdmissionSession[],
  todayIso: string = todayIsoDate()
): AdmissionSession[] {
  const upcomingDated: AdmissionSession[] = [];
  const undated: AdmissionSession[] = [];
  const past: AdmissionSession[] = [];

  for (const session of sessions) {
    const iso = toDateInputValue(session.admissionDate);
    if (!iso) {
      undated.push(session);
      continue;
    }
    if (iso < todayIso) past.push(session);
    else upcomingDated.push(session);
  }

  const byAdmissionDate = (a: AdmissionSession, b: AdmissionSession) => {
    const da = toDateInputValue(a.admissionDate);
    const db = toDateInputValue(b.admissionDate);
    return da.localeCompare(db);
  };

  upcomingDated.sort(byAdmissionDate);
  past.sort(byAdmissionDate);

  return [...upcomingDated, ...undated, ...past];
}

export function admissionSessionsSameOrder(
  a: AdmissionSession[],
  b: AdmissionSession[]
): boolean {
  if (a.length !== b.length) return false;
  return a.every((session, index) => session.id === b[index]?.id);
}

export function createAdmissionSession(): AdmissionSession {
  return {
    id: uuidv4(),
    doctorId: "",
    admissionDate: "",
    plannedDischargeDate: "",
    plannedDischargeDateManual: false,
    patients: [createAdmissionSlot()],
  };
}

/** Planned discharge stored on session, or 15 working days from admission. */
export function resolveSessionPlannedDischarge(session: AdmissionSession): string {
  const stored = toDateInputValue(session.plannedDischargeDate ?? "");
  if (stored) return stored;
  return getPlannedDischargeDate(session.admissionDate);
}

export function sessionMonthKey(session: AdmissionSession): string {
  const iso = toDateInputValue(session.admissionDate);
  if (!iso) return "";
  const [y, m] = iso.split("-").map(Number);
  return monthKey(y, m - 1);
}

export function sessionsForMonth(
  data: AppData,
  monthKeyValue: string
): AdmissionSession[] {
  return data.admissions[monthKeyValue] ?? [];
}

/** Month with the soonest upcoming admission; falls back to current calendar month. */
export function preferredAdmissionMonthKey(
  admissions: Record<string, AdmissionSession[]>,
  todayIso: string = todayIsoDate()
): string {
  const current = todayIso.slice(0, 7);
  let bestDate: string | null = null;
  let bestMonth: string | null = null;

  for (const [key, sessions] of Object.entries(admissions)) {
    if (key < current) continue;
    for (const session of sessions) {
      const iso = toDateInputValue(session.admissionDate);
      if (!iso || iso < todayIso) continue;
      if (!bestDate || iso < bestDate) {
        bestDate = iso;
        bestMonth = key;
      }
    }
  }

  return bestMonth ?? current;
}

/** Chronological month keys from current calendar month forward. */
export function admissionMonthOptions(
  todayIso: string = todayIsoDate(),
  count = 14
): string[] {
  const current = todayIso.slice(0, 7);
  const { year, month } = parseMonthKey(current);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(year, month + i, 1);
    keys.push(monthKey(d.getFullYear(), d.getMonth()));
  }
  return keys;
}

export function flattenSessionToArchive(
  data: AppData,
  session: AdmissionSession,
  archivedAt: string
): Admission[] {
  const dischargeDate = resolveSessionPlannedDischarge(session);
  const doctor = getDoctorName(data, session.doctorId);

  return session.patients.map((slot) => ({
    id: slot.id,
    patientName: slot.patientName,
    doctor,
    doctorId: session.doctorId,
    admissionDate: session.admissionDate,
    dischargeDate,
    admissionHour: slot.admissionHour,
    physiotherapistId: slot.physiotherapistId,
    archivedAt,
  }));
}

/** Latest dated admission in a month (YYYY-MM-DD), or "" if none. */
export function getLastAdmissionDateInMonth(sessions: AdmissionSession[]): string {
  let latest = "";
  for (const session of sessions) {
    const iso = toDateInputValue(session.admissionDate);
    if (iso && iso > latest) latest = iso;
  }
  return latest;
}

/**
 * Archive on/after the last working day of that month.
 * Empty months are skipped.
 */
export function shouldAutoArchiveAdmissionMonth(
  monthKeyValue: string,
  sessions: AdmissionSession[],
  todayIso: string = todayIsoDate()
): boolean {
  if (!sessions.length) return false;
  const { year, month } = parseMonthKey(monthKeyValue);
  const lastWorkingDay = getLastWorkingDayOfMonth(year, month);
  return todayIso >= lastWorkingDay;
}

export function archiveAdmissionMonth(
  data: AppData,
  monthKeyValue: string,
  archivedAt: string = new Date().toISOString()
): AppData {
  const sessions = data.admissions[monthKeyValue] ?? [];
  if (sessions.length === 0) return data;

  const themeId = data.admissionTableThemes?.[monthKeyValue];
  const flat = sessions.flatMap((s) => flattenSessionToArchive(data, s, archivedAt));
  const entry: ArchivedAdmissionMonth = {
    monthKey: monthKeyValue,
    archivedAt,
    sessions: sessions.map((s) => ({
      ...s,
      patients: s.patients.map((p) => ({ ...p })),
    })),
    ...(themeId ? { themeId } : {}),
  };

  const existing = data.admissionArchive ?? [];
  const withoutDup = existing.filter((m) => m.monthKey !== monthKeyValue);
  const themes = { ...(data.admissionTableThemes ?? {}) };
  delete themes[monthKeyValue];

  return {
    ...data,
    admissions: { ...data.admissions, [monthKeyValue]: [] },
    admissionArchive: [...withoutDup, entry].sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    ),
    archive: [...data.archive, ...flat],
    admissionTableThemes: themes,
    autoArchiveSkip: withAdmissionAutoArchiveSkip(data, monthKeyValue, false),
  };
}

function withAdmissionAutoArchiveSkip(
  data: AppData,
  monthKeyValue: string,
  skip: boolean
): AppData["autoArchiveSkip"] {
  const current = data.autoArchiveSkip ?? {};
  const set = new Set(current.admissions ?? []);
  if (skip) set.add(monthKeyValue);
  else set.delete(monthKeyValue);
  return {
    ...current,
    admissions: [...set].sort(),
  };
}

/** Move an archived month back into active admissions. */
export function restoreAdmissionMonthFromArchive(
  data: AppData,
  monthKeyValue: string
): AppData {
  const entry = (data.admissionArchive ?? []).find((m) => m.monthKey === monthKeyValue);
  if (!entry) return data;

  const slotIds = new Set(
    entry.sessions.flatMap((s) => s.patients.map((p) => p.id))
  );
  const themes = { ...(data.admissionTableThemes ?? {}) };
  if (entry.themeId) themes[monthKeyValue] = entry.themeId;

  return {
    ...data,
    admissions: {
      ...data.admissions,
      [monthKeyValue]: entry.sessions.map((s) => ({
        ...s,
        patients: s.patients.map((p) => ({ ...p })),
      })),
    },
    admissionArchive: (data.admissionArchive ?? []).filter(
      (m) => m.monthKey !== monthKeyValue
    ),
    archive: data.archive.filter(
      (a) => !slotIds.has(a.id) && !toDateInputValue(a.admissionDate).startsWith(monthKeyValue)
    ),
    admissionTableThemes: themes,
    autoArchiveSkip: withAdmissionAutoArchiveSkip(data, monthKeyValue, true),
  };
}

export function applyAutoArchiveAdmissions(
  data: AppData,
  now = new Date()
): AppData {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const skip = new Set(data.autoArchiveSkip?.admissions ?? []);

  let next = data;
  let changed = false;

  for (const [key, sessions] of Object.entries(data.admissions ?? {})) {
    if (skip.has(key)) continue;
    if (!shouldAutoArchiveAdmissionMonth(key, sessions, today)) continue;
    next = archiveAdmissionMonth(next, key, now.toISOString());
    changed = true;
  }

  return changed ? next : data;
}

export function hasAutoArchiveAdmissionChanges(before: AppData, after: AppData): boolean {
  return JSON.stringify(before.admissions) !== JSON.stringify(after.admissions);
}

/** Rebuild month archives from legacy flat rows when admissionArchive is empty. */
export function migrateFlatArchiveToMonths(
  archive: Admission[],
  existing: ArchivedAdmissionMonth[] = []
): ArchivedAdmissionMonth[] {
  if (existing.length > 0) return existing;
  if (!archive.length) return [];

  const byMonth = new Map<string, Admission[]>();
  for (const row of archive) {
    const iso = toDateInputValue(row.admissionDate);
    if (!iso) continue;
    const [y, mo] = iso.split("-").map(Number);
    const key = monthKey(y, mo - 1);
    const list = byMonth.get(key) ?? [];
    list.push(row);
    byMonth.set(key, list);
  }

  const result: ArchivedAdmissionMonth[] = [];
  for (const [key, rows] of byMonth) {
    const groups = new Map<string, AdmissionSession>();
    for (const row of rows) {
      const groupKey = `${row.doctorId ?? row.doctor}|${row.admissionDate}`;
      let session = groups.get(groupKey);
      if (!session) {
        session = {
          id: uuidv4(),
          doctorId: row.doctorId ?? "",
          admissionDate: row.admissionDate,
          plannedDischargeDate:
            row.dischargeDate || getPlannedDischargeDate(row.admissionDate),
          patients: [],
        };
        groups.set(groupKey, session);
      }
      session.patients.push({
        id: row.id,
        patientName: row.patientName,
        admissionHour: row.admissionHour,
        physiotherapistId: row.physiotherapistId,
      });
    }
    result.push({
      monthKey: key,
      archivedAt: rows[0]?.archivedAt ?? new Date().toISOString(),
      sessions: Array.from(groups.values()).map((s) => ({
        ...s,
        patients: sortAdmissionSlotsByHour(s.patients),
      })),
    });
  }

  return result.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

function resolveDoctorId(
  doctors: Doctor[],
  name: string,
  doctorIds: Map<string, string>
): { doctors: Doctor[]; doctorId: string } {
  const trimmed = name.trim();
  if (!trimmed) return { doctors, doctorId: "" };

  const existingId = doctorIds.get(trimmed.toLowerCase());
  if (existingId) return { doctors, doctorId: existingId };

  const doctor = createDoctor(trimmed);
  doctorIds.set(trimmed.toLowerCase(), doctor.id);
  return { doctors: [...doctors, doctor], doctorId: doctor.id };
}

type LegacyAdmission = {
  id?: string;
  patientName?: string;
  doctor?: string;
  admissionDate?: string;
  admissionHour?: string;
  physiotherapistId?: string;
  patients?: AdmissionSlot[];
  doctorId?: string;
};

/** Converts legacy flat admissions or normalizes session arrays. */
export function normalizeAdmissions(
  raw: Record<string, LegacyAdmission[] | AdmissionSession[]>,
  existingDoctors: Doctor[] = []
): { doctors: Doctor[]; admissions: Record<string, AdmissionSession[]> } {
  let doctors = [...existingDoctors];
  const doctorIds = new Map(
    doctors.map((d) => [d.name.trim().toLowerCase(), d.id])
  );
  const admissions: Record<string, AdmissionSession[]> = {};

  for (const [key, entries] of Object.entries(raw ?? {})) {
    if (!Array.isArray(entries) || entries.length === 0) {
      admissions[key] = [];
      continue;
    }

    if (entries[0].patients) {
      admissions[key] = (entries as AdmissionSession[]).map((session) => ({
        id: session.id ?? uuidv4(),
        doctorId: session.doctorId ?? "",
        admissionDate: session.admissionDate ?? "",
        plannedDischargeDate:
          session.plannedDischargeDate ??
          getPlannedDischargeDate(session.admissionDate ?? ""),
        ...(session.plannedDischargeDateManual
          ? { plannedDischargeDateManual: true }
          : {}),
        patients: sortAdmissionSlotsByHour(
          (session.patients ?? []).map((slot) => ({
            id: slot.id ?? uuidv4(),
            patientName: slot.patientName ?? "",
            admissionHour: slot.admissionHour ?? "",
            physiotherapistId: slot.physiotherapistId ?? "",
            ...(slot.admissionStatus ? { admissionStatus: slot.admissionStatus } : {}),
            ...(slot.linkedPatientId ? { linkedPatientId: slot.linkedPatientId } : {}),
          }))
        ),
      }));
      continue;
    }

    const groups = new Map<string, AdmissionSession>();

    for (const entry of entries as LegacyAdmission[]) {
      const admissionDate = entry.admissionDate ?? "";
      const doctorName = entry.doctor ?? "";
      const groupKey = `${doctorName.toLowerCase()}|${admissionDate}`;
      const resolved = resolveDoctorId(doctors, doctorName, doctorIds);
      doctors = resolved.doctors;

      let session = groups.get(groupKey);
      if (!session) {
        session = {
          id: uuidv4(),
          doctorId: resolved.doctorId,
          admissionDate,
          patients: [],
        };
        groups.set(groupKey, session);
      }

      session.patients.push({
        id: entry.id ?? uuidv4(),
        patientName: entry.patientName ?? "",
        admissionHour: entry.admissionHour ?? "",
        physiotherapistId: entry.physiotherapistId ?? "",
      });
    }

    admissions[key] = Array.from(groups.values()).map((session) => ({
      ...session,
      patients: sortAdmissionSlotsByHour(session.patients),
    }));
  }

  return { doctors, admissions };
}

export type PhysioAdmissionCount = {
  physiotherapistId: string;
  count: number;
};

export type UpcomingWeekAdmissionDay = {
  date: string;
  physioCounts: PhysioAdmissionCount[];
  total: number;
};

export type UpcomingWeekAdmissions = {
  days: UpcomingWeekAdmissionDay[];
  total: number;
};

/** @deprecated Use UpcomingWeekAdmissions */
export type UpcomingWeekAdmission = UpcomingWeekAdmissionDay;

/** Mon–Sun calendar week containing `todayIso`. */
function getCalendarWeekRange(todayIso: string): { start: string; end: string } {
  const date = new Date(`${todayIso}T12:00:00`);
  const dow = date.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return { start: toIso(monday), end: toIso(sunday) };
}

function countPhysioSlotsForSessions(sessions: AdmissionSession[]): PhysioAdmissionCount[] {
  const countByPhysio = new Map<string, number>();

  for (const session of sessions) {
    for (const slot of session.patients) {
      if (slot.admissionStatus === "disqualified") continue;
      if (!slot.physiotherapistId) continue;
      if (!stripHtml(slot.patientName).trim()) continue;
      countByPhysio.set(
        slot.physiotherapistId,
        (countByPhysio.get(slot.physiotherapistId) ?? 0) + 1
      );
    }
  }

  return [...countByPhysio.entries()]
    .map(([physiotherapistId, count]) => ({ physiotherapistId, count }))
    .sort((a, b) => b.count - a.count || a.physiotherapistId.localeCompare(b.physiotherapistId));
}

/** All admission days from today through end of this week, with per-physio slot counts. */
export function getUpcomingAdmissionThisWeek(
  data: AppData,
  todayIso: string = todayIsoDate()
): UpcomingWeekAdmissions | null {
  const { end } = getCalendarWeekRange(todayIso);
  const sessionsByDate = new Map<string, AdmissionSession[]>();

  for (const sessions of Object.values(data.admissions ?? {})) {
    for (const session of sessions) {
      const iso = toDateInputValue(session.admissionDate);
      if (!iso || iso < todayIso || iso > end) continue;
      const list = sessionsByDate.get(iso) ?? [];
      list.push(session);
      sessionsByDate.set(iso, list);
    }
  }

  const dates = [...sessionsByDate.keys()].sort();
  if (dates.length === 0) return null;

  const days = dates.map((date) => {
    const physioCounts = countPhysioSlotsForSessions(sessionsByDate.get(date) ?? []);
    const total = physioCounts.reduce((sum, row) => sum + row.count, 0);
    return { date, physioCounts, total };
  });

  const total = days.reduce((sum, day) => sum + day.total, 0);

  return { days, total };
}
