import type { AdmissionSession, AppData, Patient } from "./types";
import { toDateInputValue, todayIsoDate, previousWorkingDay } from "./date-utils";
import { getDoctorName } from "./admission-utils";
import { stripHtml } from "./text-format";

export type CheckupListRow = {
  patientId: string;
  physioId: string;
  patientName: string;
  physioName: string;
  doctorId: string;
  admissionDate: string;
  checkupDate: string;
  checkupDone: boolean;
};

export type CheckupDateGroup = {
  admissionDate: string;
  rows: CheckupListRow[];
};

export type CheckupDoctorGroup = {
  doctorId: string;
  doctorName: string;
  dates: CheckupDateGroup[];
};

function searchAdmissionInSessions(
  sessions: AdmissionSession[] | undefined,
  patientId: string
): { doctorId: string; admissionDate: string; patientName: string } | null {
  for (const session of sessions ?? []) {
    const slot = session.patients.find((s) => s.linkedPatientId === patientId);
    if (!slot) continue;
    return {
      doctorId: session.doctorId ?? "",
      admissionDate: toDateInputValue(session.admissionDate),
      patientName: slot.patientName ?? "",
    };
  }
  return null;
}

function physioNameById(data: AppData, physioId: string): string {
  const all = [
    ...(data.physiotherapists ?? []),
    ...(data.retiredPhysiotherapists ?? []),
  ];
  const raw = all.find((p) => p.id === physioId)?.name ?? "";
  return stripHtml(raw).trim();
}

/** Attending doctor and admission date from the session that placed this patient. */
export function findAdmissionForPatient(
  data: AppData,
  patientId: string
): { doctorId: string; admissionDate: string; patientName: string } {
  if (!patientId) return { doctorId: "", admissionDate: "", patientName: "" };
  for (const sessions of Object.values(data.admissions ?? {})) {
    const found = searchAdmissionInSessions(sessions, patientId);
    if (found) return found;
  }
  for (const month of data.admissionArchive ?? []) {
    const found = searchAdmissionInSessions(month.sessions, patientId);
    if (found) return found;
  }
  return { doctorId: "", admissionDate: "", patientName: "" };
}

export function findDoctorIdForPatient(data: AppData, patientId: string): string {
  return findAdmissionForPatient(data, patientId).doctorId;
}

export function persistPatientCheckupFields(
  patient: Patient
): Pick<Patient, "checkupDate" | "checkupDone"> {
  const checkupDate = toDateInputValue(patient.checkupDate ?? "");
  if (!checkupDate) return {};
  return {
    checkupDate,
    ...(patient.checkupDone ? { checkupDone: true } : {}),
  };
}

export function withCheckupDate(patient: Patient, date: string): Patient {
  const iso = toDateInputValue(date);
  const next: Patient = { ...patient };
  if (!iso) {
    delete next.checkupDate;
    delete next.checkupDone;
    return next;
  }
  const prev = toDateInputValue(patient.checkupDate ?? "");
  next.checkupDate = iso;
  if (iso !== prev) delete next.checkupDone;
  return next;
}

export function withCheckupDone(patient: Patient): Patient {
  if (!toDateInputValue(patient.checkupDate ?? "")) return patient;
  return { ...patient, checkupDone: true };
}

function replaceFirstLine(text: string, name: string): string {
  const plain = stripHtml(text);
  const rest = plain.split(/\r?\n/).slice(1).join("\n").trim();
  return rest ? `${name}\n${rest}` : name;
}

function patchLinkedAdmissionName(data: AppData, patientId: string, name: string): AppData {
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
        return { ...slot, patientName: name };
      });
      return sessionChanged ? { ...session, patients } : session;
    });
    if (monthChanged) admissions[monthKey] = nextSessions;
  }

  return changed ? { ...data, admissions } : data;
}

/** Update the name shown on Kontrole (admission slot, and first line of current patient). */
export function withCheckupPatientName(
  data: AppData,
  physioId: string,
  patientId: string,
  name: string
): AppData {
  const next = patchLinkedAdmissionName(data, patientId, name);
  const list = next.currentPatients[physioId] ?? [];
  const idx = list.findIndex((p) => p.id === patientId);
  if (idx < 0) return next;
  const updated = [...list];
  updated[idx] = { ...list[idx], text: replaceFirstLine(list[idx].text, name) };
  return {
    ...next,
    currentPatients: {
      ...next.currentPatients,
      [physioId]: updated,
    },
  };
}

/** Show K on Obecni pacjenci on the planned checkup day (also after it was marked done). */
export function isCheckupDayToday(
  patient: Patient,
  todayIso: string = todayIsoDate()
): boolean {
  const date = toDateInputValue(patient.checkupDate ?? "");
  return Boolean(date) && date === todayIso;
}

/** Yellow K — from previous working day up to the day before checkup (includes weekend). */
export function isCheckupReminderDay(
  patient: Patient,
  todayIso: string = todayIsoDate(),
  extraClosedDates: readonly string[] = []
): boolean {
  if (patient.checkupDone) return false;
  const date = toDateInputValue(patient.checkupDate ?? "");
  if (!date || todayIso >= date) return false;
  const from = previousWorkingDay(date, extraClosedDates);
  if (!from) return false;
  return todayIso >= from;
}

/** Green K on Obecni pacjenci — planned checkup day, not yet marked done. */
export function isCheckupDueToday(
  patient: Patient,
  todayIso: string = todayIsoDate()
): boolean {
  if (patient.checkupDone) return false;
  return isCheckupDayToday(patient, todayIso);
}

export function withCheckupDoneFlag(patient: Patient, done: boolean): Patient {
  const next: Patient = { ...patient };
  if (done) {
    if (!toDateInputValue(next.checkupDate ?? "")) return patient;
    next.checkupDone = true;
    return next;
  }
  delete next.checkupDone;
  return next;
}

function groupRowsByAdmissionDate(rows: CheckupListRow[]): CheckupDateGroup[] {
  const byDate = new Map<string, CheckupListRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.admissionDate) ?? [];
    list.push(row);
    byDate.set(row.admissionDate, list);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => {
      if (!a && b) return 1;
      if (a && !b) return -1;
      return a.localeCompare(b);
    })
    .map(([admissionDate, dateRows]) => ({
      admissionDate,
      rows: dateRows.sort((a, b) =>
        stripHtml(a.patientName).localeCompare(stripHtml(b.patientName), "pl")
      ),
    }));
}

export function listCurrentPatientsForCheckups(data: AppData): CheckupListRow[] {
  const rows: CheckupListRow[] = [];
  for (const [physioId, list] of Object.entries(data.currentPatients ?? {})) {
    for (const patient of list) {
      const admission = findAdmissionForPatient(data, patient.id);
      const patientName = admission.patientName || patient.text;
      if (!stripHtml(admission.patientName) && !stripHtml(patient.text)) continue;
      rows.push({
        patientId: patient.id,
        physioId,
        patientName,
        physioName: physioNameById(data, physioId),
        doctorId: admission.doctorId,
        admissionDate: admission.admissionDate,
        checkupDate: toDateInputValue(patient.checkupDate ?? ""),
        checkupDone: Boolean(patient.checkupDone),
      });
    }
  }
  return rows.sort((a, b) =>
    stripHtml(a.patientName).localeCompare(stripHtml(b.patientName), "pl")
  );
}

export function groupCheckupPatientsByDoctor(data: AppData): CheckupDoctorGroup[] {
  const byDoctor = new Map<string, CheckupListRow[]>();
  for (const row of listCurrentPatientsForCheckups(data)) {
    const list = byDoctor.get(row.doctorId) ?? [];
    list.push(row);
    byDoctor.set(row.doctorId, list);
  }

  const groups: CheckupDoctorGroup[] = [];
  for (const [doctorId, rows] of byDoctor) {
    groups.push({
      doctorId,
      doctorName: doctorId ? getDoctorName(data, doctorId) : "",
      dates: groupRowsByAdmissionDate(rows),
    });
  }

  return groups.sort((a, b) => {
    if (!a.doctorId && b.doctorId) return 1;
    if (a.doctorId && !b.doctorId) return -1;
    return (a.doctorName || "—").localeCompare(b.doctorName || "—", "pl");
  });
}
