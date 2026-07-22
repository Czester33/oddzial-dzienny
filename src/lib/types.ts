export interface ColumnWidths {
  lp: number;
  patient: number;
  discharge: number;
}

export interface Physiotherapist {
  id: string;
  name: string;
  color: string;
  rowColor: string;
  headerNote?: string;
  columnWidths?: ColumnWidths;
}

export interface Patient {
  id: string;
  text: string;
  dischargeDate: string;
  /** True when discharge date was changed from the Przyjęcia planned date. */
  dischargeDateManual?: boolean;
  /** Planned discharge date from Przyjęcia (before manual correction). */
  dischargeDateBeforeManual?: string;
  /** Original physiotherapist when patient is temporarily moved (substitute). */
  ownerPhysiotherapistId?: string;
}

export interface MassagePatient {
  id: string;
  name: string;
  hour: string;
  lastTreatmentDate: string;
  physiotherapistId: string;
}

export interface MassageWaiting {
  id: string;
  name: string;
  startDate: string;
  lastTreatmentDate: string;
  physiotherapistId: string;
}

export interface MassagesData {
  active: MassagePatient[];
  waiting: MassageWaiting[];
  scheduleHours?: string;
  headerNote?: string;
}

export interface DutyEntry {
  date: string;
  physiotherapistId: string;
}

export interface Doctor {
  id: string;
  name: string;
  /** Color theme for this doctor's admission tables. */
  themeId?: string;
}

export interface AdmissionSlot {
  id: string;
  patientName: string;
  admissionHour: string;
  physiotherapistId: string;
  /** + = admitted to current patients, X = disqualified / no-show */
  admissionStatus?: "admitted" | "disqualified";
  linkedPatientId?: string;
}

export interface AdmissionSession {
  id: string;
  doctorId: string;
  admissionDate: string;
  /** Suggested/planned discharge (defaults to 15 working days from admission). */
  plannedDischargeDate?: string;
  /** True when planned discharge was set by hand (kept until admission date changes). */
  plannedDischargeDateManual?: boolean;
  patients: AdmissionSlot[];
}

export interface Admission {
  id: string;
  patientName: string;
  doctor: string;
  doctorId?: string;
  admissionDate: string;
  dischargeDate: string;
  admissionHour: string;
  physiotherapistId: string;
  archivedAt?: string;
}

/** Full admission month snapshot for archive (same tables as Przyjęcia). */
export interface ArchivedAdmissionMonth {
  monthKey: string;
  archivedAt: string;
  sessions: AdmissionSession[];
  /** Month table theme id at archive time. */
  themeId?: string;
}

export interface VacationEntry {
  date: string;
  physiotherapistId: string;
  /** Confirmed vs tentative leave. Legacy entries without this are treated as certain. */
  certainty?: "certain" | "uncertain";
}

/** Full vacation year snapshot for archive. */
export interface ArchivedVacationYear {
  yearKey: string;
  archivedAt: string;
  entries: VacationEntry[];
}

/** Duty month snapshot for archive. */
export interface ArchivedDutyMonth {
  monthKey: string;
  archivedAt: string;
  entries: DutyEntry[];
}

export interface AnnouncementAdmissionLink {
  monthKey: string;
  sessionId: string;
  slotId?: string;
}

export interface Announcement {
  id: string;
  text: string;
  createdAt: string;
  source?: "manual" | "admission" | "substitution";
  admissionLink?: AnnouncementAdmissionLink;
  /** Physiotherapist who should see this admission notification. */
  physiotherapistId?: string;
}

export interface AppData {
  physiotherapists: Physiotherapist[];
  doctors: Doctor[];
  currentPatients: Record<string, Patient[]>;
  massages: MassagesData;
  duties: Record<string, DutyEntry[]>;
  admissions: Record<string, AdmissionSession[]>;
  vacations: Record<string, VacationEntry[]>;
  /** Extra facility-closed ISO dates (blocks vacations / working-day logic). */
  clinicClosedDays?: string[];
  /** Legacy flat archive rows (kept for compatibility). */
  archive: Admission[];
  /** Archived admission months with full session tables. */
  admissionArchive?: ArchivedAdmissionMonth[];
  /** Archived vacation years. */
  vacationArchive?: ArchivedVacationYear[];
  /** Archived duty months. */
  dutyArchive?: ArchivedDutyMonth[];
  /**
   * Keys restored from archive. Auto-archive skips them so they are not
   * immediately re-archived while the calendar threshold still applies.
   */
  autoArchiveSkip?: {
    admissions?: string[];
    duties?: string[];
    vacations?: string[];
  };
  announcements: Announcement[];
  announcementsSeenAt: string;
  /** Last time each physiotherapist marked admission notifications as read. */
  admissionNotificationsSeenAt?: Record<string, string>;
  /** Per-physio list of individually read admission announcement ids. */
  admissionNotificationsReadIds?: Record<string, string[]>;
  /** Per-month color theme id for admission tables (monthKey -> themeId). */
  admissionTableThemes?: Record<string, string>;
  navOrder?: string[];
  navLabels?: Record<string, string>;
}
