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

export function hasUnreadAnnouncements(data: AppData): boolean {
  const seenAt = getAnnouncementsSeenTime(data);
  return (data.announcements ?? []).some(
    (announcement) =>
      getAnnouncementCategory(announcement) === "general" &&
      new Date(announcement.createdAt).getTime() > seenAt
  );
}

export function isAnnouncementUnread(announcement: Announcement, data: AppData): boolean {
  if (getAnnouncementCategory(announcement) !== "general") return false;
  return new Date(announcement.createdAt).getTime() > getAnnouncementsSeenTime(data);
}

export function markAnnouncementsSeen(data: AppData): AppData {
  const latestGeneral = (data.announcements ?? [])
    .filter((announcement) => getAnnouncementCategory(announcement) === "general")
    .reduce((max, announcement) => {
      const time = new Date(announcement.createdAt).getTime();
      return time > max ? time : max;
    }, 0);

  return {
    ...data,
    announcementsSeenAt:
      latestGeneral > 0 ? new Date(latestGeneral).toISOString() : new Date().toISOString(),
  };
}
