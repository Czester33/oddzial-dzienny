import { v4 as uuidv4 } from "uuid";
import type {
  AppData,
  ArchivedAdmissionMonth,
  ArchivedDutyMonth,
  ArchivedVacationYear,
  ArchivedVacationMonth,
  ColumnWidths,
  Doctor,
  MassageHourChange,
  Patient,
  Physiotherapist,
} from "./types";
import { getPlannedDischargeDate, toDateInputValue } from "./date-utils";
import { buildPlannedHourChange, clampMaxMassagesPerDay, DEFAULT_MAX_MASSAGES_PER_DAY } from "./massage-schedule";
import { normalizeAdmissions, migrateFlatArchiveToMonths } from "./admission-utils";
import { normalizeNavLabels, normalizeNavOrder } from "./nav-utils";
import { stripHtml, replaceNbspInHtml, stripEmojis } from "./text-format";

function sanitizePlannedHourChange(value: unknown): MassageHourChange | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  return buildPlannedHourChange(String(raw.effectiveDate ?? ""), String(raw.hour ?? ""));
}

function mapMassageActiveFields(m: {
  id: string;
  name?: string;
  hour?: string;
  lastTreatmentDate?: string;
  physiotherapistId?: string;
  plannedHourChange?: unknown;
}) {
  const plannedHourChange = sanitizePlannedHourChange(m.plannedHourChange);
  return {
    id: m.id,
    name: m.name ?? "",
    hour: m.hour ?? "",
    lastTreatmentDate: m.lastTreatmentDate ?? "",
    physiotherapistId: m.physiotherapistId ?? "",
    ...(plannedHourChange ? { plannedHourChange } : {}),
  };
}

function mapMassageWaitingFields(m: {
  id: string;
  name?: string;
  hour?: string;
  startDate?: string;
  lastTreatmentDate?: string;
  physiotherapistId?: string;
  plannedHourChange?: unknown;
}) {
  const plannedHourChange = sanitizePlannedHourChange(m.plannedHourChange);
  return {
    id: m.id,
    name: m.name ?? "",
    hour: m.hour ?? "",
    startDate: m.startDate ?? "",
    lastTreatmentDate: m.lastTreatmentDate ?? "",
    physiotherapistId: m.physiotherapistId ?? "",
    ...(plannedHourChange ? { plannedHourChange } : {}),
  };
}

function mapMassagesFields(data: AppData["massages"]) {
  const maxPerDay = clampMaxMassagesPerDay(data?.maxPerDay);
  return {
    active: (data?.active ?? []).map(mapMassageActiveFields),
    waiting: (data?.waiting ?? []).map(mapMassageWaitingFields),
    scheduleHours: data?.scheduleHours ?? "7:45-13:45",
    headerNote: (() => {
      const cleaned = replaceNbspInHtml(data?.headerNote ?? "").trim();
      return stripHtml(cleaned) ? cleaned : "";
    })(),
    ...(maxPerDay !== DEFAULT_MAX_MASSAGES_PER_DAY ? { maxPerDay } : {}),
    ...(data?.todaySlotPeak ? { todaySlotPeak: data.todaySlotPeak } : {}),
  };
}

export const COLOR_PRESETS = [
  { name: "Różowy", color: "#C2185B", rowColor: "#F48FB1" },
  { name: "Niebieski", color: "#1565C0", rowColor: "#64B5F6" },
  { name: "Szary", color: "#424242", rowColor: "#BDBDBD" },
  { name: "Fioletowy", color: "#6A1B9A", rowColor: "#CE93D8" },
  { name: "Pomarańczowy", color: "#E65100", rowColor: "#FFB74D" },
  { name: "Żółty", color: "#F9A825", rowColor: "#FFE082" },
  { name: "Zielony", color: "#2E7D32", rowColor: "#81C784" },
  { name: "Czerwony", color: "#C62828", rowColor: "#E57373" },
  { name: "Turkusowy", color: "#00695C", rowColor: "#4DB6AC" },
  { name: "Indigo", color: "#283593", rowColor: "#7986CB" },
  { name: "Granatowy", color: "#1A237E", rowColor: "#5C6BC0" },
  { name: "Cyjan", color: "#00838F", rowColor: "#4DD0E1" },
  { name: "Oliwkowy", color: "#558B2F", rowColor: "#AED581" },
  { name: "Limonkowy", color: "#827717", rowColor: "#DCE775" },
  { name: "Brązowy", color: "#5D4037", rowColor: "#BCAAA4" },
  { name: "Bordowy", color: "#880E4F", rowColor: "#EC407A" },
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

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return toHex(
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  );
}

/** Lighter tint stored as rowColor for custom accent colors. */
export function derivePhysioRowColorFromAccent(color: string): string {
  const accent = parseHex(color);
  if (!accent) return "#BDBDBD";
  const strength = 0.45;
  return toHex(
    Math.round(255 * (1 - strength) + accent[0] * strength),
    Math.round(255 * (1 - strength) + accent[1] * strength),
    Math.round(255 * (1 - strength) + accent[2] * strength)
  );
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

export function retirePhysiotherapist(physio: Physiotherapist): Physiotherapist {
  return {
    id: physio.id,
    name: physio.name,
    color: physio.color,
    rowColor: physio.rowColor,
  };
}

export function restorePhysiotherapist(physio: Physiotherapist): Physiotherapist {
  return {
    id: physio.id,
    name: physio.name,
    color: physio.color,
    rowColor: physio.rowColor,
    columnWidths: { ...DEFAULT_COLUMN_WIDTHS },
  };
}

export interface PhysioPurgeImpact {
  activeVacations: number;
  archivedVacationEntries: number;
  archivedAdmissionSlots: number;
  notepadNotes: number;
}

export function countPhysioPurgeImpact(data: AppData, id: string): PhysioPurgeImpact {
  const activeVacations = Object.values(data.vacations ?? {})
    .flat()
    .filter((entry) => entry.physiotherapistId === id).length;

  const archivedVacationEntries =
    (data.vacationArchive ?? []).flatMap((year) => year.entries ?? []).filter(
      (entry) => entry.physiotherapistId === id
    ).length +
    (data.vacationMonthArchive ?? []).flatMap((month) => month.entries ?? []).filter(
      (entry) => entry.physiotherapistId === id
    ).length;

  const archivedAdmissionSlots = (data.admissionArchive ?? [])
    .flatMap((month) => month.sessions ?? [])
    .flatMap((session) => session.patients ?? [])
    .filter((slot) => slot.physiotherapistId === id).length;

  const notepadNotes = (data.notepadNotes ?? []).filter(
    (note) => note.physiotherapistId === id
  ).length;

  return {
    activeVacations,
    archivedVacationEntries,
    archivedAdmissionSlots,
    notepadNotes,
  };
}

export function buildPhysioPurgeConfirmMessage(
  name: string,
  impact: PhysioPurgeImpact
): string {
  const lines = [
    `Trwale usunąć „${name}”?`,
    "",
    "Tej operacji nie można cofnąć.",
    "",
    "• Osoba zniknie z listy usuniętych — nie da się jej przywrócić",
  ];

  if (impact.activeVacations > 0) {
    lines.push(
      `• ${impact.activeVacations} urlopów zostanie usuniętych z bieżącego kalendarza`
    );
  }

  const archiveTotal = impact.archivedVacationEntries + impact.archivedAdmissionSlots;
  if (archiveTotal > 0) {
    lines.push(
      `• ${archiveTotal} wpisów w archiwum urlopów/przyjęć zostanie z zachowanym imieniem i kolorem`
    );
  }

  if (impact.notepadNotes > 0) {
    lines.push(`• ${impact.notepadNotes} notatek straci przypisanie autora`);
  }

  if (impact.activeVacations === 0 && archiveTotal === 0 && impact.notepadNotes === 0) {
    lines.push("• Brak powiązanych urlopów, archiwum ani notatek");
  }

  lines.push("", "Kontynuować?");
  return lines.join("\n");
}

/** Permanently remove a retired physiotherapist and drop revivable links. */
export function purgeRetiredPhysiotherapist(data: AppData, id: string): AppData {
  const physio = data.retiredPhysiotherapists?.find((p) => p.id === id);
  const archiveProfiles = [...(data.archivePhysiotherapistProfiles ?? [])];
  if (physio && !archiveProfiles.some((p) => p.id === id)) {
    archiveProfiles.push(retirePhysiotherapist(physio));
  }

  const vacations = Object.fromEntries(
    Object.entries(data.vacations ?? {})
      .map(([key, entries]) => [
        key,
        entries.filter((entry) => entry.physiotherapistId !== id),
      ])
      .filter(([, entries]) => entries.length > 0)
  );

  return {
    ...data,
    retiredPhysiotherapists: (data.retiredPhysiotherapists ?? []).filter((p) => p.id !== id),
    archivePhysiotherapistProfiles: archiveProfiles,
    vacations,
    notepadNotes: (data.notepadNotes ?? []).map((note) => {
      if (note.physiotherapistId !== id) return note;
      const { physiotherapistId: _removed, ...rest } = note;
      return rest;
    }),
  };
}

export function getPhysioById(data: AppData, id: string): Physiotherapist | undefined {
  return (
    data.physiotherapists.find((p) => p.id === id) ??
    data.retiredPhysiotherapists?.find((p) => p.id === id) ??
    data.archivePhysiotherapistProfiles?.find((p) => p.id === id)
  );
}

export function isPhysioVisible(physio: Physiotherapist): boolean {
  return !physio.hidden;
}

export function visiblePhysiotherapists(data: AppData): Physiotherapist[] {
  return data.physiotherapists.filter(isPhysioVisible);
}

/** Visible physios for pickers; keeps current selection even if hidden. */
export function physiosForSelect(data: AppData, selectedId = ""): Physiotherapist[] {
  const visible = visiblePhysiotherapists(data);
  if (!selectedId) return visible;
  const selected = data.physiotherapists.find((p) => p.id === selectedId);
  if (!selected || visible.some((p) => p.id === selectedId)) return visible;
  return [...visible, selected];
}

/** Active physios for planning (admissions, duties, vacations, …) — includes hidden, visible first. */
export function physiosForPlanningSelect(data: AppData): Physiotherapist[] {
  const visible: Physiotherapist[] = [];
  const hidden: Physiotherapist[] = [];
  for (const physio of data.physiotherapists) {
    if (physio.hidden) hidden.push(physio);
    else visible.push(physio);
  }
  return [...visible, ...hidden];
}

/** @deprecated Use physiosForPlanningSelect */
export function physiosForAdmissionSelect(data: AppData): Physiotherapist[] {
  return physiosForPlanningSelect(data);
}

/** Plain name on tiles / selected values in planning views. */
export function physioPlanningDisplayLabel(physio: Physiotherapist, short = false): string {
  return short ? physioShortName(physio.name) : physioDisplayName(physio.name);
}

/** Dropdown option label; marks hidden staff. */
export function physioPlanningOptionLabel(physio: Physiotherapist, short = false): string {
  const base = physioPlanningDisplayLabel(physio, short);
  if (!base) return physio.hidden ? "(ukryty)" : "";
  return physio.hidden ? `${base} (ukryty)` : base;
}

/** @deprecated Use physioPlanningDisplayLabel or physioPlanningOptionLabel */
export function physioPickerLabel(physio: Physiotherapist, short = false): string {
  return physioPlanningDisplayLabel(physio, short);
}

/** Physio name without emoji — use everywhere except Pacjenci column headers. */
export function physioDisplayName(name: string): string {
  return stripEmojis(name);
}

export function physioShortName(name: string): string {
  const plain = physioDisplayName(name);
  return plain.split(" ")[0] || plain || name.split(" ")[0] || name;
}

export function getPhysioName(data: AppData, id: string): string {
  const raw = getPhysioById(data, id)?.name ?? "";
  return raw ? physioDisplayName(raw) : "";
}

export function physioNames(data: AppData): string[] {
  return visiblePhysiotherapists(data).map((p) => p.name);
}

export function createEmptyPatient(): Patient {
  return { id: uuidv4(), text: "", dischargeDate: "" };
}

/** Empty row in Obecni pacjenci — free slot for a new admission. */
export function isPatientSlotEmpty(patient: Patient): boolean {
  return !stripHtml(patient.text).trim() && !toDateInputValue(patient.dischargeDate);
}

/** How long an empty patient row may stay before auto-removal. */
export const EMPTY_PATIENT_ROW_TTL_MS = 60_000;

/**
 * Track when each empty patient row first became empty.
 * Filled rows and removed ids are dropped from the map.
 */
export function syncEmptyPatientRowTimestamps(
  data: AppData,
  emptySince: Map<string, number>,
  nowMs: number
): Map<string, number> {
  const next = new Map(emptySince);
  const seen = new Set<string>();

  for (const list of Object.values(data.currentPatients ?? {})) {
    for (const patient of list) {
      seen.add(patient.id);
      if (isPatientSlotEmpty(patient)) {
        if (!next.has(patient.id)) next.set(patient.id, nowMs);
      } else {
        next.delete(patient.id);
      }
    }
  }

  for (const id of next.keys()) {
    if (!seen.has(id)) next.delete(id);
  }

  return next;
}

/** Remove empty patient rows that have stayed empty longer than `ttlMs`. */
export function removeStaleEmptyPatientRows(
  data: AppData,
  emptySince: Map<string, number>,
  nowMs: number,
  ttlMs: number = EMPTY_PATIENT_ROW_TTL_MS
): AppData {
  let changed = false;
  const nextPatients: Record<string, Patient[]> = {};

  for (const [physioId, list] of Object.entries(data.currentPatients ?? {})) {
    const filtered = list.filter((patient) => {
      if (!isPatientSlotEmpty(patient)) return true;
      const since = emptySince.get(patient.id);
      if (since == null || nowMs - since < ttlMs) return true;
      changed = true;
      return false;
    });
    nextPatients[physioId] = filtered;
  }

  return changed ? { ...data, currentPatients: nextPatients } : data;
}

/**
 * Fill the first empty slot for a physiotherapist, or append if none is free.
 * Returns the list and the patient id used in Obecni pacjenci.
 */
export function placePatientInFreeSlot(
  patients: Patient[],
  text: string,
  dischargeDate: string,
  ownerPhysiotherapistId?: string
): { patients: Patient[]; patientId: string } {
  const list = [...patients];
  const emptyIndex = list.findIndex(isPatientSlotEmpty);
  const owner =
    ownerPhysiotherapistId && ownerPhysiotherapistId.trim()
      ? { ownerPhysiotherapistId }
      : {};

  if (emptyIndex >= 0) {
    const patientId = list[emptyIndex].id;
    list[emptyIndex] = {
      id: patientId,
      text,
      dischargeDate,
      ...owner,
    };
    return { patients: sortPatientsByDischargeDate(list), patientId };
  }

  const patientId = uuidv4();
  return {
    patients: sortPatientsByDischargeDate([
      ...list,
      { id: patientId, text, dischargeDate, ...owner },
    ]),
    patientId,
  };
}

/** Physiotherapist list currently holding this patient row, if any. */
export function findPhysioIdForPatient(
  data: AppData,
  patientId: string
): string | undefined {
  if (!patientId) return undefined;
  for (const [physioId, list] of Object.entries(data.currentPatients ?? {})) {
    if (list.some((patient) => patient.id === patientId)) return physioId;
  }
  return undefined;
}

/** Clear a patient row back to an empty slot (keep the row). */
export function clearPatientSlot(patients: Patient[], patientId: string): Patient[] {
  return patients.map((p) =>
    p.id === patientId ? { id: p.id, text: "", dischargeDate: "" } : p
  );
}

/** Drop admission links so a manually removed patient is not treated as still admitted. */
export function unlinkPatientFromAdmissions(data: AppData, patientId: string): AppData {
  let changed = false;
  const admissions: AppData["admissions"] = { ...data.admissions };

  for (const [monthKey, sessions] of Object.entries(admissions)) {
    let monthChanged = false;
    const nextSessions = sessions.map((session) => {
      let sessionChanged = false;
      const patients = session.patients.map((slot) => {
        if (slot.linkedPatientId !== patientId) return slot;
        sessionChanged = true;
        monthChanged = true;
        changed = true;
        const { linkedPatientId: _drop, admissionStatus: _status, ...rest } = slot;
        return rest;
      });
      return sessionChanged ? { ...session, patients } : session;
    });
    if (monthChanged) admissions[monthKey] = nextSessions;
  }

  return changed ? { ...data, admissions } : data;
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
  const rest = { ...(widths ?? {}) };
  delete rest.comment;
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
          ...(slot.substitutePhysiotherapistId
            ? {
                substitutePhysiotherapistId: resolvePhysioId(
                  { physiotherapists: data.physiotherapists } as AppData,
                  slot.substitutePhysiotherapistId
                ),
              }
            : {}),
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
    retiredPhysiotherapists: (data.retiredPhysiotherapists ?? []).map((p) => ({
      id: p.id,
      name: p.name ?? "",
      color: p.color ?? "#64748b",
      rowColor: p.rowColor ?? "#e2e8f0",
    })),
    archivePhysiotherapistProfiles: (data.archivePhysiotherapistProfiles ?? []).map((p) => ({
      id: p.id,
      name: p.name ?? "",
      color: p.color ?? "#64748b",
      rowColor: p.rowColor ?? "#e2e8f0",
    })),
    currentPatients,
    massages: mapMassagesFields(data.massages),
    announcements: data.announcements ?? [],
    announcementsSeenAt: data.announcementsSeenAt ?? "",
    announcementsReadIds: Array.isArray(data.announcementsReadIds)
      ? data.announcementsReadIds.filter((id): id is string => typeof id === "string")
      : undefined,
    announcementsUnreadIds: Array.isArray(data.announcementsUnreadIds)
      ? data.announcementsUnreadIds.filter((id): id is string => typeof id === "string")
      : undefined,
    notepadNotes: (data.notepadNotes ?? []).map((note) => ({
      id: note.id,
      title: String(note.title ?? "").trim(),
      text: replaceNbspInHtml(note.text ?? "").trim(),
      createdAt: note.createdAt ?? new Date().toISOString(),
      updatedAt: note.updatedAt ?? note.createdAt ?? new Date().toISOString(),
      ...(note.physiotherapistId ? { physiotherapistId: note.physiotherapistId } : {}),
    })),
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
    vacationMonthArchive: Array.isArray(data.vacationMonthArchive)
      ? data.vacationMonthArchive.map((m) => ({
          monthKey: m.monthKey,
          archivedAt: m.archivedAt ?? new Date().toISOString(),
          entries: (m.entries ?? []).map((v) => ({
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
    autoArchiveSkip: {
      admissions: Array.isArray(data.autoArchiveSkip?.admissions)
        ? [...data.autoArchiveSkip.admissions].filter(Boolean).sort()
        : [],
      duties: Array.isArray(data.autoArchiveSkip?.duties)
        ? [...data.autoArchiveSkip.duties].filter(Boolean).sort()
        : [],
      vacations: Array.isArray(data.autoArchiveSkip?.vacations)
        ? [...data.autoArchiveSkip.vacations].filter(Boolean).sort()
        : [],
    },
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
          ...(slot.substitutePhysiotherapistId
            ? {
                substitutePhysiotherapistId: migratePhysioRef(
                  slot.substitutePhysiotherapistId
                ),
              }
            : {}),
        })),
      })),
    ])
  );

  return sanitizeAppData({
    physiotherapists,
    doctors: admissionMigration.doctors,
    currentPatients,
    massages: mapMassagesFields({
      active: (raw.massages?.active ?? []).map((m: Record<string, unknown>) =>
        mapMassageActiveFields({
          id: String(m.id ?? uuidv4()),
          name: String(m.name ?? ""),
          hour: String(m.hour ?? ""),
          lastTreatmentDate: String(m.lastTreatmentDate ?? ""),
          physiotherapistId: migratePhysioRef(String(m.physiotherapistId ?? m.physiotherapist ?? "")),
          plannedHourChange: m.plannedHourChange,
        })
      ),
      waiting: (raw.massages?.waiting ?? []).map((m: Record<string, unknown>) =>
        mapMassageWaitingFields({
          id: String(m.id ?? uuidv4()),
          name: String(m.name ?? ""),
          hour: String(m.hour ?? ""),
          startDate: String(m.startDate ?? ""),
          lastTreatmentDate: String(m.lastTreatmentDate ?? ""),
          physiotherapistId: migratePhysioRef(String(m.physiotherapistId ?? m.physiotherapist ?? "")),
          plannedHourChange: m.plannedHourChange,
        })
      ),
      scheduleHours: raw.massages?.scheduleHours ?? "7:45-13:45",
      headerNote: raw.massages?.headerNote ?? "",
      maxPerDay:
        typeof raw.massages?.maxPerDay === "number" ? raw.massages.maxPerDay : undefined,
      todaySlotPeak: raw.massages?.todaySlotPeak as AppData["massages"]["todaySlotPeak"],
    }),
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
              ...(p.substitutePhysiotherapistId
                ? {
                    substitutePhysiotherapistId: migratePhysioRef(
                      p.substitutePhysiotherapistId
                    ),
                  }
                : {}),
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
    vacationMonthArchive: Array.isArray(raw.vacationMonthArchive)
      ? (raw.vacationMonthArchive as ArchivedVacationMonth[]).map((m) => ({
          monthKey: m.monthKey,
          archivedAt: m.archivedAt ?? new Date().toISOString(),
          entries: (m.entries ?? []).map((v) => ({
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
    notepadNotes: Array.isArray(raw.notepadNotes)
      ? (raw.notepadNotes as Record<string, unknown>[]).map((note) => {
          const createdAt = String(note.createdAt ?? new Date().toISOString());
          return {
            id: String(note.id ?? uuidv4()),
            title: String(note.title ?? "").trim(),
            text: replaceNbspInHtml(String(note.text ?? "")).trim(),
            createdAt,
            updatedAt: String(note.updatedAt ?? createdAt),
            ...(typeof note.physiotherapistId === "string" && note.physiotherapistId
              ? { physiotherapistId: note.physiotherapistId }
              : {}),
          };
        })
      : [],
    announcementsSeenAt: raw.announcementsSeenAt ?? "",
    announcementsReadIds: Array.isArray(raw.announcementsReadIds)
      ? (raw.announcementsReadIds as unknown[]).filter(
          (id): id is string => typeof id === "string"
        )
      : undefined,
    announcementsUnreadIds: Array.isArray(raw.announcementsUnreadIds)
      ? (raw.announcementsUnreadIds as unknown[]).filter(
          (id): id is string => typeof id === "string"
        )
      : undefined,
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
    retiredPhysiotherapists: [],
    archivePhysiotherapistProfiles: [],
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
    vacationMonthArchive: [],
    dutyArchive: [],
    announcements: [],
    announcementsSeenAt: "",
    notepadNotes: [],
    admissionNotificationsSeenAt: {},
    admissionNotificationsReadIds: {},
    navOrder: [...normalizeNavOrder()],
    navLabels: {},
  };
}
