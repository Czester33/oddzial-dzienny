import { v4 as uuidv4 } from "uuid";
import { formatDatePL, formatMonthLabel, toDateInputValue } from "./date-utils";
import { getDoctorName } from "./admission-utils";
import { getPhysioName } from "./physio-utils";
import { stripHtml } from "./text-format";
import { isCompleteTime } from "./massage-schedule";
import type {
  AdmissionSession,
  AdmissionSlot,
  Announcement,
  AnnouncementAdmissionLink,
  AppData,
} from "./types";

type AdmissionChangeEvent = {
  monthKey: string;
  sessionId: string;
  slotId?: string;
  message: string;
  physiotherapistId: string;
};

type SlotChangeAccumulator = {
  monthKey: string;
  sessionId: string;
  slotId: string;
  patientName: string;
  added: boolean;
  removed: boolean;
  admitted: boolean;
  disqualified: boolean;
  hour?: string;
  physio?: string;
};

function slotName(slot: AdmissionSlot): string {
  return stripHtml(slot.patientName).trim();
}

function normalizeSlot(slot: AdmissionSlot) {
  return {
    id: slot.id,
    patientName: slotName(slot),
    admissionHour: slot.admissionHour ?? "",
    physiotherapistId: slot.physiotherapistId ?? "",
    admissionStatus: slot.admissionStatus ?? "",
  };
}

function normalizeSession(session: AdmissionSession) {
  return {
    id: session.id,
    doctorId: session.doctorId ?? "",
    admissionDate: toDateInputValue(session.admissionDate),
    patients: session.patients.map(normalizeSlot).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function admissionsFingerprint(admissions: AppData["admissions"]): string {
  const out: Record<string, ReturnType<typeof normalizeSession>[]> = {};
  for (const [key, sessions] of Object.entries(admissions ?? {})) {
    out[key] = [...sessions]
      .map(normalizeSession)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  return JSON.stringify(out);
}

function indexSessions(admissions: AppData["admissions"]) {
  const map = new Map<string, { monthKey: string; session: AdmissionSession }>();
  for (const [monthKey, sessions] of Object.entries(admissions ?? {})) {
    for (const session of sessions) {
      map.set(session.id, { monthKey, session });
    }
  }
  return map;
}

function collectPhysioIdsFromSession(session: AdmissionSession): string[] {
  const ids = new Set<string>();
  for (const slot of session.patients) {
    if (slot.physiotherapistId) ids.add(slot.physiotherapistId);
  }
  return [...ids];
}

function pushSessionEvents(
  events: AdmissionChangeEvent[],
  monthKey: string,
  sessionId: string,
  message: string,
  physioIds: string[]
) {
  for (const physiotherapistId of physioIds) {
    events.push({ monthKey, sessionId, message, physiotherapistId });
  }
}

function splitMessageParts(message: string): { headline: string; detailParts: string[] } {
  const splitIndex = message.indexOf(" — ");
  if (splitIndex === -1) {
    return { headline: message, detailParts: [] };
  }
  const headline = message.slice(0, splitIndex);
  const details = message.slice(splitIndex + 3);
  return {
    headline,
    detailParts: details ? details.split("; ").filter(Boolean) : [],
  };
}

function mergeDetailParts(parts: string[]): string[] {
  const map = new Map<string, string>();
  for (const part of parts) {
    const key = part.split(":")[0]?.trim() ?? part;
    map.set(key, part);
  }
  return [...map.values()];
}

function buildPatientMessage(acc: SlotChangeAccumulator): string | null {
  if (acc.removed) {
    return acc.patientName
      ? `Usunięto pacjenta: ${acc.patientName}`
      : "Usunięto wiersz pacjenta";
  }

  if (acc.admitted) {
    return acc.patientName
      ? `Pacjent przyjęty: ${acc.patientName}`
      : "Pacjent przyjęty";
  }

  if (acc.disqualified) {
    return acc.patientName
      ? `Pacjent dyskwalifikowany: ${acc.patientName}`
      : "Pacjent dyskwalifikowany";
  }

  const parts: string[] = [];
  if (acc.hour) parts.push(`godzina: ${acc.hour}`);
  if (acc.physio) parts.push(`fizjoterapeuta: ${acc.physio}`);

  if (acc.added) {
    const headline = acc.patientName
      ? `Dodano pacjenta: ${acc.patientName}`
      : "Dodano pacjenta";
    return parts.length ? `${headline} — ${parts.join("; ")}` : headline;
  }

  if (parts.length === 0) return null;

  const label = acc.patientName ? `: ${acc.patientName}` : "";
  return `Zmieniono pacjenta${label} — ${parts.join("; ")}`;
}

function flushSlotChange(
  acc: SlotChangeAccumulator,
  physiotherapistId?: string
): AdmissionChangeEvent | null {
  const message = buildPatientMessage(acc);
  if (!message || !physiotherapistId) return null;

  return {
    monthKey: acc.monthKey,
    sessionId: acc.sessionId,
    slotId: acc.slotId,
    message,
    physiotherapistId,
  };
}

function mergePatientAnnouncementMessages(existing: string, incoming: string): string {
  if (incoming.startsWith("Usunięto pacjenta") || incoming.startsWith("Usunięto wiersz")) {
    return incoming;
  }
  if (incoming.startsWith("Pacjent przyjęty") || incoming.startsWith("Pacjent dyskwalifikowany")) {
    return incoming;
  }

  const existingParts = splitMessageParts(existing);
  const incomingParts = splitMessageParts(incoming);

  const headline = existingParts.headline.startsWith("Dodano pacjenta")
    ? existingParts.headline
    : incomingParts.headline;

  const detailParts = mergeDetailParts([
    ...existingParts.detailParts,
    ...incomingParts.detailParts,
  ]);

  return detailParts.length ? `${headline} — ${detailParts.join("; ")}` : headline;
}

function findAdmissionAnnouncementIndex(
  announcements: Announcement[],
  event: AdmissionChangeEvent
): number {
  return announcements.findIndex(
    (announcement) =>
      announcement.source === "admission" &&
      announcement.physiotherapistId === event.physiotherapistId &&
      announcement.admissionLink?.sessionId === event.sessionId &&
      (announcement.admissionLink?.slotId ?? "") === (event.slotId ?? "")
  );
}

function detectAdmissionChanges(before: AppData, after: AppData): AdmissionChangeEvent[] {
  const events: AdmissionChangeEvent[] = [];
  const beforeMap = indexSessions(before.admissions);
  const afterMap = indexSessions(after.admissions);

  for (const [sessionId, { monthKey, session }] of afterMap) {
    const prev = beforeMap.get(sessionId);
    if (!prev) {
      pushSessionEvents(
        events,
        monthKey,
        sessionId,
        `Dodano nowe przyjęcie (${formatMonthLabel(monthKey)})`,
        collectPhysioIdsFromSession(session)
      );
      continue;
    }

    const prevDate = toDateInputValue(prev.session.admissionDate);
    const nextDate = toDateInputValue(session.admissionDate);
    if (prevDate !== nextDate && nextDate) {
      pushSessionEvents(
        events,
        monthKey,
        sessionId,
        `Zmieniono datę przyjęcia na ${formatDatePL(nextDate)} (${formatMonthLabel(monthKey)})`,
        collectPhysioIdsFromSession(session)
      );
    }

    if (prev.session.doctorId !== session.doctorId && session.doctorId) {
      const doctor = getDoctorName(after, session.doctorId) || "—";
      pushSessionEvents(
        events,
        monthKey,
        sessionId,
        `Zmieniono lekarza prowadzącego: ${doctor}`,
        collectPhysioIdsFromSession(session)
      );
    }

    const prevSlots = new Map(prev.session.patients.map((slot) => [slot.id, slot]));
    for (const slot of session.patients) {
      const old = prevSlots.get(slot.id);
      const acc: SlotChangeAccumulator = {
        monthKey,
        sessionId,
        slotId: slot.id,
        patientName: "",
        added: false,
        removed: false,
        admitted: false,
        disqualified: false,
      };

      if (!old) {
        acc.patientName = slotName(slot);
        if (acc.patientName) acc.added = true;
        if (isCompleteTime(slot.admissionHour) && slot.admissionHour) {
          acc.hour = slot.admissionHour;
        }
        if (slot.physiotherapistId) {
          acc.physio = getPhysioName(after, slot.physiotherapistId) || "—";
        }
        const event = flushSlotChange(acc, slot.physiotherapistId);
        if (event) events.push(event);
        continue;
      }

      const oldName = slotName(old);
      const newName = slotName(slot);
      acc.patientName = newName || oldName;

      if (!oldName && newName) {
        acc.added = true;
      } else if (oldName && !newName) {
        acc.removed = true;
      }

      if (isCompleteTime(slot.admissionHour) && slot.admissionHour !== old.admissionHour) {
        acc.hour = slot.admissionHour;
      }

      if (slot.physiotherapistId && slot.physiotherapistId !== old.physiotherapistId) {
        acc.physio = getPhysioName(after, slot.physiotherapistId) || "—";
      }

      if (slot.admissionStatus !== old.admissionStatus) {
        if (slot.admissionStatus === "admitted") acc.admitted = true;
        if (slot.admissionStatus === "disqualified") acc.disqualified = true;
      }

      const physioId = slot.physiotherapistId || old.physiotherapistId;
      const event = flushSlotChange(acc, physioId);
      if (event) events.push(event);
    }

    for (const old of prev.session.patients) {
      if (!session.patients.some((slot) => slot.id === old.id)) {
        const name = slotName(old);
        const event = flushSlotChange(
          {
            monthKey,
            sessionId,
            slotId: old.id,
            patientName: name,
            added: false,
            removed: true,
            admitted: false,
            disqualified: false,
          },
          old.physiotherapistId
        );
        if (event) events.push(event);
      }
    }
  }

  for (const [sessionId, { monthKey, session }] of beforeMap) {
    if (!afterMap.has(sessionId)) {
      pushSessionEvents(
        events,
        monthKey,
        sessionId,
        `Usunięto przyjęcie (${formatMonthLabel(monthKey)})`,
        collectPhysioIdsFromSession(session)
      );
    }
  }

  return events;
}

export function buildAdmissionLinkHref(link: AnnouncementAdmissionLink): string {
  const params = new URLSearchParams({
    month: link.monthKey,
    session: link.sessionId,
  });
  if (link.slotId) params.set("slot", link.slotId);
  return `/przyjecia?${params.toString()}`;
}

export function getPhysioAdmissionAnnouncements(
  data: AppData,
  physiotherapistId: string
): Announcement[] {
  return [...(data.announcements ?? [])]
    .filter(
      (announcement) =>
        announcement.source === "admission" &&
        announcement.physiotherapistId === physiotherapistId
    )
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export function getPhysioAdmissionNotificationsSeenTime(
  data: AppData,
  physiotherapistId: string
): number {
  const seenAt = data.admissionNotificationsSeenAt?.[physiotherapistId];
  return seenAt ? new Date(seenAt).getTime() : 0;
}

function getPhysioAdmissionReadIds(data: AppData, physiotherapistId: string): Set<string> {
  return new Set(data.admissionNotificationsReadIds?.[physiotherapistId] ?? []);
}

export function isPhysioAdmissionAnnouncementUnread(
  announcement: Announcement,
  data: AppData,
  physiotherapistId: string
): boolean {
  if (getPhysioAdmissionReadIds(data, physiotherapistId).has(announcement.id)) {
    return false;
  }
  return (
    new Date(announcement.createdAt).getTime() >
    getPhysioAdmissionNotificationsSeenTime(data, physiotherapistId)
  );
}

export function hasUnreadPhysioAdmissionAnnouncements(
  data: AppData,
  physiotherapistId: string
): boolean {
  return getPhysioAdmissionAnnouncements(data, physiotherapistId).some((announcement) =>
    isPhysioAdmissionAnnouncementUnread(announcement, data, physiotherapistId)
  );
}

export function markPhysioAdmissionAnnouncementRead(
  data: AppData,
  physiotherapistId: string,
  announcementId: string
): AppData {
  const existing = getPhysioAdmissionReadIds(data, physiotherapistId);
  if (existing.has(announcementId)) return data;

  return {
    ...data,
    admissionNotificationsReadIds: {
      ...(data.admissionNotificationsReadIds ?? {}),
      [physiotherapistId]: [...existing, announcementId],
    },
  };
}

export function markPhysioAdmissionNotificationsSeen(
  data: AppData,
  physiotherapistId: string
): AppData {
  const announcements = getPhysioAdmissionAnnouncements(data, physiotherapistId);
  if (announcements.length === 0) return data;

  const latest = Math.max(
    ...announcements.map((announcement) => new Date(announcement.createdAt).getTime())
  );
  const readIds = getPhysioAdmissionReadIds(data, physiotherapistId);
  for (const announcement of announcements) {
    readIds.add(announcement.id);
  }

  return {
    ...data,
    admissionNotificationsSeenAt: {
      ...(data.admissionNotificationsSeenAt ?? {}),
      [physiotherapistId]: new Date(latest).toISOString(),
    },
    admissionNotificationsReadIds: {
      ...(data.admissionNotificationsReadIds ?? {}),
      [physiotherapistId]: [...readIds],
    },
  };
}

export function applyAdmissionChangeAnnouncements(
  before: AppData,
  after: AppData
): AppData {
  if (admissionsFingerprint(before.admissions) === admissionsFingerprint(after.admissions)) {
    return after;
  }

  const events = detectAdmissionChanges(before, after);
  if (events.length === 0) return after;

  const createdAt = new Date().toISOString();
  const announcements = [...(after.announcements ?? [])];

  for (const event of events) {
    const admissionLink: AnnouncementAdmissionLink = {
      monthKey: event.monthKey,
      sessionId: event.sessionId,
      ...(event.slotId ? { slotId: event.slotId } : {}),
    };

    const existingIndex = findAdmissionAnnouncementIndex(announcements, event);
    if (existingIndex >= 0) {
      const existing = announcements[existingIndex];
      const merged: Announcement = {
        ...existing,
        text: mergePatientAnnouncementMessages(existing.text, event.message),
        admissionLink,
        physiotherapistId: event.physiotherapistId,
      };
      announcements.splice(existingIndex, 1);
      announcements.unshift(merged);
      continue;
    }

    announcements.unshift({
      id: uuidv4(),
      text: event.message,
      createdAt,
      source: "admission",
      admissionLink,
      physiotherapistId: event.physiotherapistId,
    });
  }

  return {
    ...after,
    announcements,
  };
}
