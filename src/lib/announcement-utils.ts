import type { Announcement, AppData } from "./types";

export type AnnouncementCategory = "general" | "admission";

export function getAnnouncementCategory(announcement: Announcement): AnnouncementCategory {
  if (announcement.source === "admission") return "admission";
  return "general";
}

export function getLatestAnnouncementTime(data: AppData): number {
  if (!data.announcements?.length) return 0;
  return Math.max(...data.announcements.map((a) => new Date(a.createdAt).getTime()));
}

export function getAnnouncementsSeenTime(data: AppData): number {
  return data.announcementsSeenAt ? new Date(data.announcementsSeenAt).getTime() : 0;
}

function generalAnnouncements(data: AppData): Announcement[] {
  return (data.announcements ?? []).filter(
    (announcement) => getAnnouncementCategory(announcement) === "general"
  );
}

export function isAnnouncementUnread(announcement: Announcement, data: AppData): boolean {
  if (getAnnouncementCategory(announcement) !== "general") return false;

  const unreadIds = data.announcementsUnreadIds ?? [];
  if (unreadIds.includes(announcement.id)) return true;

  const readIds = data.announcementsReadIds ?? [];
  if (readIds.includes(announcement.id)) return false;

  const seenAt = getAnnouncementsSeenTime(data);
  if (seenAt <= 0) return true;
  return new Date(announcement.createdAt).getTime() > seenAt;
}

export function hasUnreadAnnouncements(data: AppData): boolean {
  return generalAnnouncements(data).some((announcement) => isAnnouncementUnread(announcement, data));
}

export function markAnnouncementRead(data: AppData, announcementId: string): AppData {
  const readIds = new Set(data.announcementsReadIds ?? []);
  readIds.add(announcementId);

  const unreadIds = (data.announcementsUnreadIds ?? []).filter((id) => id !== announcementId);

  return {
    ...data,
    announcementsReadIds: [...readIds],
    announcementsUnreadIds: unreadIds.length ? unreadIds : undefined,
  };
}

export function markAnnouncementUnread(data: AppData, announcementId: string): AppData {
  const unreadIds = new Set(data.announcementsUnreadIds ?? []);
  unreadIds.add(announcementId);

  const readIds = (data.announcementsReadIds ?? []).filter((id) => id !== announcementId);

  return {
    ...data,
    announcementsReadIds: readIds.length ? readIds : undefined,
    announcementsUnreadIds: [...unreadIds],
  };
}

/** @deprecated Prefer markAnnouncementRead for individual announcements. */
export function markAnnouncementsSeen(data: AppData): AppData {
  const latestGeneral = generalAnnouncements(data).reduce((max, announcement) => {
    const time = new Date(announcement.createdAt).getTime();
    return time > max ? time : max;
  }, 0);

  return {
    ...data,
    announcementsSeenAt:
      latestGeneral > 0 ? new Date(latestGeneral).toISOString() : new Date().toISOString(),
  };
}
