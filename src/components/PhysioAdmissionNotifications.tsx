"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppData, Physiotherapist } from "@/lib/types";
import {
  buildAdmissionLinkHref,
  getPhysioAdmissionAnnouncements,
  hasUnreadPhysioAdmissionAnnouncements,
  isPhysioAdmissionAnnouncementUnread,
  markPhysioAdmissionNotificationsSeen,
  markPhysioAdmissionAnnouncementRead,
} from "@/lib/admission-announcement-utils";
import { physioDisplayName, physioShortName, visiblePhysiotherapists } from "@/lib/physio-utils";
import { adaptHtmlColorsForTheme } from "@/lib/text-format";
import { useTheme } from "@/context/ThemeContext";

function shortName(name: string): string {
  return physioShortName(name);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SideNotificationTab({
  physio,
  unreadCount,
  active,
  onClick,
}: {
  physio: Physiotherapist;
  unreadCount: number;
  active: boolean;
  onClick: () => void;
}) {
  const label =
    unreadCount > 1 ? `${shortName(physio.name)} (${unreadCount})` : shortName(physio.name);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Przyjęcia — ${physioDisplayName(physio.name)}, ${unreadCount} nowe`}
      className={`relative rounded-l-lg border border-r-0 px-2.5 py-3 text-[19px] font-medium shadow-md transition-colors ${
        active
          ? "border-red-600 bg-red-600 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      }`}
      style={{
        writingMode: "vertical-rl",
        textOrientation: "mixed",
        borderLeftWidth: active ? undefined : 4,
        borderLeftColor: active ? undefined : physio.color,
      }}
    >
      {!active && (
        <span
          className="absolute left-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800"
          aria-hidden="true"
        />
      )}
      {label}
    </button>
  );
}

function TopNotificationTab({
  physio,
  unreadCount,
  active,
  onClick,
}: {
  physio: Physiotherapist;
  unreadCount: number;
  active: boolean;
  onClick: () => void;
}) {
  const label =
    unreadCount > 1 ? `${shortName(physio.name)} (${unreadCount})` : shortName(physio.name);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Przyjęcia — ${physioDisplayName(physio.name)}, ${unreadCount} nowe`}
      className={`relative min-w-0 flex-1 rounded-md border px-3 py-2 text-[17px] font-medium shadow-sm transition-colors ${
        active
          ? "border-red-600 bg-red-600 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      }`}
      style={{
        borderLeftWidth: active ? undefined : 4,
        borderLeftColor: active ? undefined : physio.color,
      }}
    >
      {!active && (
        <span
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800"
          aria-hidden="true"
        />
      )}
      {label}
    </button>
  );
}

function ExpandedNotificationsPanel({
  physio,
  data,
  onSave,
  onClose,
  layout = "side",
}: {
  physio: Physiotherapist;
  data: AppData;
  onSave: (data: AppData) => void;
  onClose: () => void;
  layout?: "side" | "top";
}) {
  const { theme } = useTheme();
  const router = useRouter();
  const unreadAnnouncements = getPhysioAdmissionAnnouncements(data, physio.id).filter(
    (announcement) => isPhysioAdmissionAnnouncementUnread(announcement, data, physio.id)
  );

  const markOneRead = (announcementId: string) => {
    onSave(markPhysioAdmissionAnnouncementRead(data, physio.id, announcementId));
  };

  const markAllRead = () => {
    onSave(markPhysioAdmissionNotificationsSeen(data, physio.id));
    onClose();
  };

  const goToAdmission = (href: string) => {
    onClose();
    router.push(href);
  };

  const shellClass =
    layout === "top"
      ? "flex max-h-[min(70vh,520px)] w-full flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900"
      : "flex max-h-[min(70vh,520px)] w-[min(calc(100vw-3rem),22rem)] flex-col overflow-hidden rounded-l-lg border border-r-0 border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900";

  return (
    <aside
      className={shellClass}
      role="dialog"
      aria-label={`Powiadomienia o przyjęciach — ${physioDisplayName(physio.name)}`}
    >
      <div
        className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700"
        style={{ backgroundColor: `${physio.color}22` }}
      >
        <div className="min-w-0">
          <h3 className="truncate text-[18px] font-semibold text-slate-800 dark:text-slate-100">
            Przyjęcia · {physioDisplayName(physio.name)}
          </h3>
          <p className="text-[14px] text-red-700 dark:text-red-400">
            {unreadAnnouncements.length}{" "}
            {unreadAnnouncements.length === 1 ? "nowe powiadomienie" : "nowe powiadomienia"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md px-2 py-1 text-[18px] text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Zwiń"
        >
          ✕
        </button>
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto p-4">
        {unreadAnnouncements.map((announcement) => {
          const admissionHref = announcement.admissionLink
            ? buildAdmissionLinkHref(announcement.admissionLink)
            : null;
          return (
            <li
              key={announcement.id}
              className="rounded-md border border-red-200 bg-red-50/70 px-3 py-2 text-[15px] text-slate-800 dark:border-red-900 dark:bg-red-950/40 dark:text-slate-100"
            >
              <p className="mb-1 text-[12px] text-slate-500 dark:text-slate-400">
                {formatTime(announcement.createdAt)}
              </p>
              <p
                className="leading-snug"
                dangerouslySetInnerHTML={{
                  __html: adaptHtmlColorsForTheme(announcement.text, theme),
                }}
              />
              {admissionHref ? (
                <button
                  type="button"
                  onClick={() => goToAdmission(admissionHref)}
                  className="mt-2 block w-full rounded border border-blue-300 bg-blue-50 px-2 py-2 text-[15px] font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
                >
                  Przejdź do zmiany →
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => markOneRead(announcement.id)}
                className="mt-2 block w-full rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[14px] font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
              >
                Odczytano
              </button>
            </li>
          );
        })}
      </ul>

      {unreadAnnouncements.length > 1 && (
        <div className="border-t border-slate-200 p-4 dark:border-slate-700">
          <button
            type="button"
            onClick={markAllRead}
            className="w-full rounded border border-slate-300 bg-slate-50 px-2 py-2 text-[15px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Odczytaj wszystkie
          </button>
        </div>
      )}
    </aside>
  );
}

function NotificationTabs({
  physiosWithUnread,
  data,
  expandedId,
  onToggle,
  variant,
}: {
  physiosWithUnread: Physiotherapist[];
  data: AppData;
  expandedId: string | null;
  onToggle: (physioId: string) => void;
  variant: "side" | "top";
}) {
  return (
    <>
      {physiosWithUnread.map((physio) => {
        const unreadCount = getPhysioAdmissionAnnouncements(data, physio.id).filter(
          (announcement) =>
            isPhysioAdmissionAnnouncementUnread(announcement, data, physio.id)
        ).length;

        if (variant === "top") {
          return (
            <TopNotificationTab
              key={physio.id}
              physio={physio}
              unreadCount={unreadCount}
              active={expandedId === physio.id}
              onClick={() => onToggle(physio.id)}
            />
          );
        }

        return (
          <SideNotificationTab
            key={physio.id}
            physio={physio}
            unreadCount={unreadCount}
            active={expandedId === physio.id}
            onClick={() => onToggle(physio.id)}
          />
        );
      })}
    </>
  );
}

export function PhysioAdmissionNotificationsRail({
  data,
  onSave,
}: {
  data: AppData;
  onSave: (data: AppData) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const physiosWithUnread = visiblePhysiotherapists(data).filter((physio) =>
    hasUnreadPhysioAdmissionAnnouncements(data, physio.id)
  );

  const expandedPhysio = expandedId
    ? visiblePhysiotherapists(data).find((physio) => physio.id === expandedId) ??
      data.physiotherapists.find((physio) => physio.id === expandedId)
    : undefined;

  const togglePhysio = (physioId: string) => {
    setExpandedId((current) => (current === physioId ? null : physioId));
  };

  useEffect(() => {
    if (!expandedId) return;
    if (!physiosWithUnread.some((physio) => physio.id === expandedId)) {
      setExpandedId(null);
    }
  }, [expandedId, physiosWithUnread]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (physiosWithUnread.length === 0) return null;

  return (
    <>
      {/* Mobile: sticky tabs; panel as overlay so taps/navigation are not trapped */}
      <div className="sticky top-0 z-40 -mx-3 mb-3 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 md:hidden">
        <div className="flex flex-wrap gap-2 px-3 py-2">
          <NotificationTabs
            physiosWithUnread={physiosWithUnread}
            data={data}
            expandedId={expandedId}
            onToggle={togglePhysio}
            variant="top"
          />
        </div>
      </div>

      {expandedPhysio && hasUnreadPhysioAdmissionAnnouncements(data, expandedPhysio.id) ? (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Zwiń powiadomienia"
            onClick={() => setExpandedId(null)}
          />
          <div className="relative z-10 max-h-[min(75vh,560px)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <ExpandedNotificationsPanel
              physio={expandedPhysio}
              data={data}
              onSave={onSave}
              onClose={() => setExpandedId(null)}
              layout="top"
            />
          </div>
        </div>
      ) : null}

      {/* Desktop: fixed side rail */}
      {expandedId ? (
        <button
          type="button"
          className="fixed inset-0 z-[65] hidden bg-black/25 md:block"
          aria-label="Zwiń powiadomienia"
          onClick={() => setExpandedId(null)}
        />
      ) : null}

      <div className="fixed right-0 top-1/2 z-[70] hidden -translate-y-1/2 items-stretch md:flex">
        {expandedPhysio && hasUnreadPhysioAdmissionAnnouncements(data, expandedPhysio.id) ? (
          <ExpandedNotificationsPanel
            physio={expandedPhysio}
            data={data}
            onSave={onSave}
            onClose={() => setExpandedId(null)}
            layout="side"
          />
        ) : null}

        <div className="flex flex-col gap-2">
          <NotificationTabs
            physiosWithUnread={physiosWithUnread}
            data={data}
            expandedId={expandedId}
            onToggle={togglePhysio}
            variant="side"
          />
        </div>
      </div>
    </>
  );
}
