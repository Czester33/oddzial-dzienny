import { v4 as uuidv4 } from "uuid";
import type {
  AppData,
  ArchivedAdmissionMonth,
  ArchivedDutyMonth,
  ArchivedVacationYear,
  ColumnWidths,
  Doctor,
  Patient,
  Physiotherapist,
} from "./types";
import { getPlannedDischargeDate, toDateInputValue } from "./date-utils";
import { normalizeAdmissions, migrateFlatArchiveToMonths } from "./admission-utils";
import { normalizeNavLabels, normalizeNavOrder } from "./nav-utils";
import { stripHtml, replaceNbspInHtml } from "./text-format";

export const COLOR_PRESETS = [
  { name: "Różowy", color: "#C2185B", rowColor: "#F48FB1" },
  { name: "Niebieski", color: "#1565C0", rowColor: "#64B5F6" },
  { name: "Szary", color: "#424242", rowColor: "#BDBDBD" },
  { name: "Fioletowy", color: "#6A1B9A", rowColor: "#CE93D8" },
  { name: "Pomarańczowy", color: "#E65100", rowColor: "#FFB74D" },
  { name: "Żółty", color: "#F9A825", rowColor: "#FFE082" },
  { name: "Zielony", color: "#2E7D32", rowColor: "#81C784" },
  { name: "Czerwony", color: "#C62828", rowColor: "#E57373" },
];

function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace("#", "");
  if (raw.length === 3) {
    return [
      Number.parseInt(raw[0] + raw[0], 16),
      Number.parseInt(raw[1] + raw[1], 16),
      Number.parseInt(raw[2] + raw[2], 16),
    ];
  }
  if (raw.length === 6) {
    return [
      Number.parseInt(raw.slice(0, 2), 16),
      Number.parseInt(raw.slice(2, 4), 16),
      Number.parseInt(raw.slice(4, 6), 16),
    ];
  }
  return null;
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("")}`;
}

/** Stronger brand wash for patient rows / physio name tiles. */
export function resolvePhysioRowColor(
  headerColor: string,
  rowColor: string,
  theme: "light" | "dark"
): string {
  const accent = parseHex(headerColor);

  if (theme === "light") {
    // Prefer vivid tint from brand color (stored rowColor is often too pale).
    if (!accent) return rowColor;
    const strength = 0.52;
    return toHex(
      Math.round(255 * (1 - strength) + accent[0] * strength),
      Math.round(255 * (1 - strength) + accent[1] * strength),
      Math.round(255 * (1 - strength) + accent[2] * strength)
    );
  }

  if (!accent) return "#1a2332";

  const base: [number, number, number] = [22, 32, 48];
  const strength = 0.55;
  return toHex(
    Math.round(base[0] * (1 - strength) + accent[0] * strength),
    Math.round(base[1] * (1 - strength) + accent[1] * strength),
    Math.round(base[2] * (1 - strength) + accent[2] * strength)
  );
}

/** Stronger tint for column headers so they stand out from body rows. */
export function resolvePhysioColumnHeaderColor(
  headerColor: string,
  rowColor: string,
  theme: "light" | "dark"
): string {
  const accent = parseHex(headerColor);
  if (!accent) return resolvePhysioRowColor(headerColor, rowColor, theme);

  if (theme === "light") {
    // Prefer saturated brand color mixed lightly toward white for readability
    const strength = 0.72;
    return toHex(
      Math.round(255 * (1 - strength) + accent[0] * strength),
      Math.round(255 * (1 - strength) + accent[1] * strength),
      Math.round(255 * (1 - strength) + accent[2] * strength)
    );
  }

  const base: [number, number, number] = [30, 41, 59];
  const strength = 0.7;
  return toHex(
    Math.round(base[0] * (1 - strength) + accent[0] * strength),
    Math.round(base[1] * (1 - strength) + accent[1] * strength),
    Math.round(base[2] * (1 - strength) + accent[2] * strength)
  );
}

/** Discharge fits short date (DD.MM) + calendar/clear controls; patient fills the rest. */
export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  lp: 40,
  patient: 280,
  discharge: 108,
};

export function getPhysioById(data: AppData, id: string): Physiotherapist | undefined {
  return data.physiotherapists.find((p) => p.id === id);
}

export function getPhysioName(data: AppData, id: string): string {
  return getPhysioById(data, id)?.name ?? "";
}

export function physioNames(data: AppData): string[] {
  return data.physiotherapists.map((p) => p.name);
}

export function createEmptyPatient(): Patient {
  return { id: uuidv4(), text: "", dischargeDate: "" };
}

/** Empty row in Obecni pacjenci — free slot for a new admission. */
export function isPatientSlotEmpty(patient: Patient): boolean {
  return !stripHtml(patient.text).trim() && !toDateInputValue(patient.dischargeDate);
}

/**
 * Fill the first empty slot for a physiotherapist, or append if none is free.
 * Returns the list and the patient id used in Obecni pacjenci.
 */
export function placePatientInFreeSlot(
  patients: Patient[],
  text: string,
  dischargeDate: string
): { patients: Patient[]; patientId: string } {
  const list = [...patients];
  const emptyIndex = list.findIndex(isPatientSlotEmpty);

  if (emptyIndex >= 0) {
    const patientId = list[emptyIndex].id;
    list[emptyIndex] = {
      id: patientId,
      text,
      dischargeDate,
      ownerPhysiotherapistId: list[emptyIndex].ownerPhysiotherapistId,
    };
    return { patients: sortPatientsByDischargeDate(list), patientId };
  }

  const patientId = uuidv4();
  return {
    patients: sortPatientsByDischargeDate([
      ...list,
      { id: patientId, text, dischargeDate },
    ]),
    patientId,
  };
}

/** Clear a patient row back to an empty slot (keep the row). */
export function clearPatientSlot(patients: Patient[], patientId: string): Patient[] {
  return patients.map((p) =>
    p.id === patientId ? { id: p.id, text: "", dischargeDate: "" } : p
  );
}

/** Nearest discharge dates first; empty dates stay at the bottom. */
export function sortPatientsByDischargeDate(patients: Patient[]): Patient[] {
  return patients
    .map((patient, index) => ({ patient, index }))
    .sort((a, b) => {
      const dateA = toDateInputValue(a.patient.dischargeDate);
      const dateB = toDateInputValue(b.patient.dischargeDate);

      if (!dateA && !dateB) return a.index - b.index;
      if (!dateA) return 1;
      if (!dateB) return -1;

      const byDate = dateA.localeCompare(dateB);
      if (byDate !== 0) return byDate;

      return a.index - b.index;
    })
    .map(({ patient }) => patient);
}

/** Move patient between physiotherapists; keep original owner for substitute marking. */
export function movePatientBetweenPhysios(
  data: AppData,
  fromPhysioId: string,
  patientIndex: number,
  toPhysioId: string
): AppData {
  if (fromPhysioId === toPhysioId) return data;

  const fromList = [...(data.currentPatients[fromPhysioId] ?? [])];
  const patient = fromList[patientIndex];
  if (!patient) return data;

  fromList.splice(patientIndex, 1);

  const originalOwnerId = patient.ownerPhysiotherapistId ?? fromPhysioId;
  const moved: Patient = {
    ...patient,
    ownerPhysiotherapistId: toPhysioId === originalOwnerId ? undefined : originalOwnerId,
  };

  const toList = sortPatientsByDischargeDate([
    ...(data.currentPatients[toPhysioId] ?? []),
    moved,
  ]);

  return {
    ...data,
    currentPatients: {
      ...data.currentPatients,
      [fromPhysioId]: fromList,
      [toPhysioId]: toList,
    },
  };
}

/** How many of this physio's patients are currently with someone else (substitutes). */
export function countSubstitutesAway(data: AppData, physioId: string): number {
  let count = 0;
  for (const [id, list] of Object.entries(data.currentPatients ?? {})) {
    if (id === physioId) continue;
    for (const p of list) {
      if (p.ownerPhysiotherapistId === physioId && !isPatientSlotEmpty(p)) count += 1;
    }
  }
  return count;
}

/** Move all substitutes belonging to `physioId` back to that physiotherapist. */
export function returnSubstitutesToPhysio(data: AppData, physioId: string): AppData {
  const nextLists: Record<string, Patient[]> = Object.fromEntries(
    Object.entries(data.currentPatients ?? {}).map(([id, list]) => [id, [...list]])
  );

  const returning: Patient[] = [];

  for (const [id, list] of Object.entries(nextLists)) {
    if (id === physioId) continue;
    const kept: Patient[] = [];
    for (const p of list) {
      if (p.ownerPhysiotherapistId === physioId && !isPatientSlotEmpty(p)) {
        returning.push({
          ...p,
          ownerPhysiotherapistId: undefined,
        });
      } else {
        kept.push(p);
      }
    }
    nextLists[id] = kept;
  }

  if (returning.length === 0) return data;

  nextLists[physioId] = sortPatientsByDischargeDate([
    ...(nextLists[physioId] ?? []),
    ...returning,
  ]);

  return {
    ...data,
    currentPatients: nextLists,
  };
}

/** Return one substitute patient to their original owner. */
export function returnSubstitutePatient(
  data: AppData,
  currentPhysioId: string,
  patientId: string
): AppData {
  const list = data.currentPatients[currentPhysioId] ?? [];
  const index = list.findIndex((p) => p.id === patientId);
  if (index < 0) return data;
  const ownerId = list[index].ownerPhysiotherapistId;
  if (!ownerId || ownerId === currentPhysioId) return data;
  return movePatientBetweenPhysios(data, currentPhysioId, index, ownerId);
}

export function ensureMinPatientRows(patients: Patient[], min = 0): Patient[] {
  const result = [...patients];
  while (result.length < min) {
    result.push(createEmptyPatient());
  }
  return result;
}

/** @deprecated use ensureMinPatientRows */
export function ensurePatientRows(patients: Patient[], count = 0): Patient[] {
  return ensureMinPatientRows(patients, count);
}

export function getDefaultColumnWidths(widths?: Partial<ColumnWidths> & { comment?: number }): ColumnWidths {
  const { comment: _comment, ...rest } = widths ?? {};
  return {
    ...DEFAULT_COLUMN_WIDTHS,
    ...rest,
    // Keep discharge compact so Pacjent can use remaining table width
    discharge: DEFAULT_COLUMN_WIDTHS.discharge,
  };
}

export function createPhysiotherapist(name: string, index: number): Physiotherapist {
  const preset = COLOR_PRESETS[index % COLOR_PRESETS.length];
  return {
    id: uuidv4(),
    name,
    color: preset.color,
    rowColor: preset.rowColor,
    columnWidths: { ...DEFAULT_COLUMN_WIDTHS },
  };
}

function resolvePhysioId(data: AppData, value: string): string {
  if (!value) return "";
  const byId = data.physiotherapists.find((p) => p.id === value);
  if (byId) return byId.id;
  const byName = data.physiotherapists.find((p) => p.name === value);
  return byName?.id ?? "";
}

export function sanitizeAppData(data: AppData): AppData {
  const currentPatients: Record<string, Patient[]> = {};
  for (const physio of data.physiotherapists) {
    currentPatients[physio.id] = (data.currentPatients[physio.id] ?? []).map((p) => {
      const legacyComment = (p as { comment?: string }).comment ?? "";
      const text = p.text ?? "";
      const ownerId = p.ownerPhysiotherapistId ?? "";
      return {
        id: p.id,
        text: legacyComment && text ? `${text} ${legacyComment}` : legacyComment || text,
        dischargeDate: p.dischargeDate ?? "",
        // Manual flag only with a known original date (from Przyjęcia correction).
        ...(p.dischargeDateManual && p.dischargeDateBeforeManual
          ? { dischargeDateManual: true, dischargeDateBeforeManual: p.dischargeDateBeforeManual }
          : {}),
        ...(ownerId && ownerId !== physio.id ? { ownerPhysiotherapistId: ownerId } : {}),
      };
    });
  }

  const doctors: Doctor[] = (data.doctors ?? []).map((d) => ({
    id: d.id,
    name: d.name ?? "",
    ...(d.themeId ? { themeId: d.themeId } : {}),
  }));
  const { doctors: mergedDoctors, admissions } = normalizeAdmissions(
    data.admissions ?? {},
    doctors
  );
  const admissionsWithPhysio = Object.fromEntries(
    Object.entries(admissions).map(([key, sessions]) => [
      key,
      sessions.map((session) => ({
        ...session,
        patients: session.patients.map((slot) => ({
          ...slot,
          physiotherapistId: resolvePhysioId(
            { physiotherapists: data.physiotherapists } as AppData,
            slot.physiotherapistId
          ),
        })),
      })),
    ])
  );

  return {
    ...data,
    doctors: mergedDoctors,
    admissions: admissionsWithPhysio,
    physiotherapists: data.physiotherapists.map((p) => {
      const headerNote = stripHtml(p.headerNote ?? "");
      return {
        ...p,
        columnWidths: getDefaultColumnWidths(p.columnWidths),
        ...(headerNote ? { headerNote } : { headerNote: "" }),
      };
    }),
    currentPatients,
    massages: {
      active: data.massages?.active ?? [],
      waiting: data.massages?.waiting ?? [],
      scheduleHours: data.massages?.scheduleHours ?? "7:45-13:45",
      headerNote: (() => {
        const cleaned = replaceNbspInHtml(data.massages?.headerNote ?? "").trim();
        return stripHtml(cleaned) ? cleaned : "";
      })(),
    },
    announcements: data.announcements ?? [],
    announcementsSeenAt: data.announcementsSeenAt ?? "",
    admissionNotificationsSeenAt: data.admissionNotificationsSeenAt ?? {},
    admissionNotificationsReadIds: data.admissionNotificationsReadIds ?? {},
    clinicClosedDays: Array.isArray(data.clinicClosedDays)
      ? data.clinicClosedDays
          .map((d) => toDateInputValue(d))
          .filter((d): d is string => Boolean(d))
          .sort()
      : [],
    admissionTableThemes: data.admissionTableThemes ?? {},
    admissionArchive: migrateFlatArchiveToMonths(
      data.archive ?? [],
      data.admissionArchive ?? []
    ),
    vacationArchive: Array.isArray(data.vacationArchive)
      ? data.vacationArchive.map((y) => ({
          yearKey: y.yearKey,
          archivedAt: y.archivedAt ?? new Date().toISOString(),
          entries: (y.entries ?? []).map((v) => ({
            date: v.date,
            physiotherapistId: v.physiotherapistId ?? "",
            certainty: v.certainty === "uncertain" ? ("uncertain" as const) : ("certain" as const),
          })),
        }))
      : [],
    dutyArchive: Array.isArray(data.dutyArchive)
      ? data.dutyArchive.map((m) => ({
          monthKey: m.monthKey,
          archivedAt: m.archivedAt ?? new Date().toISOString(),
          entries: (m.entries ?? []).map((d) => ({
            date: d.date,
            physiotherapistId: d.physiotherapistId ?? "",
          })),
        }))
      : [],
    navOrder: normalizeNavOrder(data.navOrder),
    navLabels: normalizeNavLabels(data.navLabels),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateData(raw: any): AppData {
  if (!raw || typeof raw !== "object") {
    return createEmptyAppData();
  }

  if (Array.isArray(raw.physiotherapists)) {
    if (raw.physiotherapists.length === 0) {
      return sanitizeAppData({
        ...createEmptyAppData(),
        ...raw,
        physiotherapists: [],
      });
    }

    if (raw.physiotherapists[0]?.id) {
      return sanitizeAppData(raw as AppData);
    }
  }

  const oldNames: string[] = Array.isArray(raw.physiotherapists)
    ? raw.physiotherapists.filter((name: unknown) => typeof name === "string")
    : [];
  const physiotherapists = oldNames.map((name, i) => createPhysiotherapist(name, i));
  const nameToId = Object.fromEntries(physiotherapists.map((p) => [p.name, p.id]));

  const oldPatients: Record<string, Patient[]> = raw.currentPatients ?? {};
  const currentPatients: Record<string, Patient[]> = {};
  for (const [name, patients] of Object.entries(oldPatients)) {
    const id = nameToId[name];
    if (!id) continue;
    currentPatients[id] = (patients as Patient[]).map((p) => ({
        id: p.id ?? uuidv4(),
        text:
          p.text ??
          [(p as { name?: string }).name, (p as { notes?: string }).notes, (p as { comment?: string }).comment]
            .filter(Boolean)
            .join(" "),
        dischargeDate: p.dischargeDate ?? "",
        ...(p.dischargeDateManual && p.dischargeDateBeforeManual
          ? { dischargeDateManual: true, dischargeDateBeforeManual: p.dischargeDateBeforeManual }
          : {}),
        ...(p.ownerPhysiotherapistId ? { ownerPhysiotherapistId: p.ownerPhysiotherapistId } : {}),
      }));
  }

  for (const physio of physiotherapists) {
    if (!currentPatients[physio.id]) {
      currentPatients[physio.id] = [];
    }
  }

  const migratePhysioRef = (value: string) => resolvePhysioId({ physiotherapists } as AppData, value);
  const admissionMigration = normalizeAdmissions(
    raw.admissions ?? {},
    Array.isArray(raw.doctors) ? raw.doctors : []
  );
  const migratedAdmissions = Object.fromEntries(
    Object.entries(admissionMigration.admissions).map(([key, sessions]) => [
      key,
      sessions.map((session) => ({
        ...session,
        patients: session.patients.map((slot) => ({
          ...slot,
          physiotherapistId: migratePhysioRef(slot.physiotherapistId),
        })),
      })),
    ])
  );

  return sanitizeAppData({
    physiotherapists,
    doctors: admissionMigration.doctors,
    currentPatients,
    massages: {
      active: (raw.massages?.active ?? []).map((m: Record<string, string>) => ({
        id: m.id ?? uuidv4(),
        name: m.name ?? "",
        hour: m.hour ?? "",
        lastTreatmentDate: m.lastTreatmentDate ?? "",
        physiotherapistId: migratePhysioRef(m.physiotherapistId ?? m.physiotherapist ?? ""),
      })),
      waiting: (raw.massages?.waiting ?? []).map((m: Record<string, string>) => ({
        id: m.id ?? uuidv4(),
        name: m.name ?? "",
        startDate: m.startDate ?? "",
        lastTreatmentDate: m.lastTreatmentDate ?? "",
        physiotherapistId: migratePhysioRef(m.physiotherapistId ?? m.physiotherapist ?? ""),
      })),
      scheduleHours: raw.massages?.scheduleHours ?? "7:45-13:45",
      headerNote: raw.massages?.headerNote ?? "",
    },
    duties: Object.fromEntries(
      Object.entries(raw.duties ?? {}).map(([key, entries]) => [
        key,
        (entries as Record<string, string>[]).map((d) => ({
          date: d.date,
          physiotherapistId: migratePhysioRef(d.physiotherapistId ?? d.physiotherapist ?? ""),
        })),
      ])
    ),
    admissions: migratedAdmissions,
    vacations: Object.fromEntries(
      Object.entries(raw.vacations ?? {}).map(([key, entries]) => [
        key,
        (entries as Record<string, string>[]).map((v) => ({
          date: v.date,
          physiotherapistId: migratePhysioRef(v.physiotherapistId ?? v.physiotherapist ?? ""),
          certainty: v.certainty === "uncertain" ? ("uncertain" as const) : ("certain" as const),
        })),
      ])
    ),
    archive: (raw.archive ?? []).map((a: Record<string, string>) => ({
      id: a.id ?? uuidv4(),
      patientName: a.patientName ?? "",
      doctor: a.doctor ?? "",
      doctorId: a.doctorId,
      admissionDate: a.admissionDate ?? "",
      dischargeDate: a.dischargeDate ?? "",
      admissionHour: a.admissionHour ?? "",
      physiotherapistId: migratePhysioRef(a.physiotherapistId ?? a.physiotherapist ?? ""),
      archivedAt: a.archivedAt,
    })),
    admissionArchive: Array.isArray(raw.admissionArchive)
      ? (raw.admissionArchive as ArchivedAdmissionMonth[]).map((m) => ({
          monthKey: m.monthKey,
          archivedAt: m.archivedAt ?? new Date().toISOString(),
          themeId: m.themeId,
          sessions: (m.sessions ?? []).map((s) => ({
            id: s.id ?? uuidv4(),
            doctorId: s.doctorId ?? "",
            admissionDate: s.admissionDate ?? "",
            plannedDischargeDate:
              s.plannedDischargeDate ??
              getPlannedDischargeDate(s.admissionDate ?? ""),
            ...(s.plannedDischargeDateManual
              ? { plannedDischargeDateManual: true }
              : {}),
            patients: (s.patients ?? []).map((p) => ({
              id: p.id ?? uuidv4(),
              patientName: p.patientName ?? "",
              admissionHour: p.admissionHour ?? "",
              physiotherapistId: migratePhysioRef(p.physiotherapistId ?? ""),
              ...(p.admissionStatus ? { admissionStatus: p.admissionStatus } : {}),
              ...(p.linkedPatientId ? { linkedPatientId: p.linkedPatientId } : {}),
            })),
          })),
        }))
      : undefined,
    vacationArchive: Array.isArray(raw.vacationArchive)
      ? (raw.vacationArchive as ArchivedVacationYear[]).map((y) => ({
          yearKey: y.yearKey,
          archivedAt: y.archivedAt ?? new Date().toISOString(),
          entries: (y.entries ?? []).map((v) => ({
            date: v.date,
            physiotherapistId: migratePhysioRef(v.physiotherapistId ?? ""),
            certainty: v.certainty === "uncertain" ? ("uncertain" as const) : ("certain" as const),
          })),
        }))
      : undefined,
    dutyArchive: Array.isArray(raw.dutyArchive)
      ? (raw.dutyArchive as ArchivedDutyMonth[]).map((m) => ({
          monthKey: m.monthKey,
          archivedAt: m.archivedAt ?? new Date().toISOString(),
          entries: (m.entries ?? []).map((d) => ({
            date: d.date,
            physiotherapistId: migratePhysioRef(d.physiotherapistId ?? ""),
          })),
        }))
      : undefined,
    announcements: (raw.announcements ?? []).map((a: Record<string, unknown>) => ({
      id: String(a.id ?? uuidv4()),
      text: String(a.text ?? a["Treść"] ?? ""),
      createdAt: String(a.createdAt ?? a["Data"] ?? new Date().toISOString()),
      ...(a.source === "manual" || a.source === "admission" || a.source === "substitution"
        ? { source: a.source }
        : {}),
      ...(typeof a.physiotherapistId === "string" ? { physiotherapistId: a.physiotherapistId } : {}),
      ...(a.admissionLink && typeof a.admissionLink === "object"
        ? { admissionLink: a.admissionLink as AppData["announcements"][number]["admissionLink"] }
        : {}),
    })),
    announcementsSeenAt: raw.announcementsSeenAt ?? "",
    admissionNotificationsSeenAt:
      raw.admissionNotificationsSeenAt &&
      typeof raw.admissionNotificationsSeenAt === "object" &&
      !Array.isArray(raw.admissionNotificationsSeenAt)
        ? (raw.admissionNotificationsSeenAt as Record<string, string>)
        : {},
    admissionNotificationsReadIds:
      raw.admissionNotificationsReadIds &&
      typeof raw.admissionNotificationsReadIds === "object" &&
      !Array.isArray(raw.admissionNotificationsReadIds)
        ? Object.fromEntries(
            Object.entries(raw.admissionNotificationsReadIds as Record<string, unknown>).map(
              ([physioId, ids]) => [
                physioId,
                Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [],
              ]
            )
          )
        : {},
    clinicClosedDays: Array.isArray(raw.clinicClosedDays)
      ? (raw.clinicClosedDays as string[])
          .map((d) => toDateInputValue(d))
          .filter((d): d is string => Boolean(d))
      : [],
  });
}

function createEmptyAppData(): AppData {
  return {
    physiotherapists: [],
    doctors: [],
    currentPatients: {},
    massages: { active: [], waiting: [], scheduleHours: "7:45-13:45", headerNote: "" },
    duties: {},
    admissions: {},
    vacations: {},
    clinicClosedDays: [],
    archive: [],
    admissionArchive: [],
    vacationArchive: [],
    dutyArchive: [],
    announcements: [],
    announcementsSeenAt: "",
    admissionNotificationsSeenAt: {},
    admissionNotificationsReadIds: {},
    navOrder: [...normalizeNavOrder()],
    navLabels: {},
  };
}
