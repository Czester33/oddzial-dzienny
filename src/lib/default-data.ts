import type { AppData } from "./types";
import { DEFAULT_NAV_ORDER } from "./nav-utils";

export function createDefaultData(): AppData {
  return {
    physiotherapists: [],
    retiredPhysiotherapists: [],
    doctors: [],
    currentPatients: {},
    massages: {
      active: [],
      waiting: [],
      scheduleHours: "7:45-13:45",
      headerNote: "",
    },
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
    admissionTableThemes: {},
    navOrder: [...DEFAULT_NAV_ORDER],
    navLabels: {},
  };
}
