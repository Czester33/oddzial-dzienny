"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Announcement, AppData } from "@/lib/types";
import {
  getAnnouncementCategory,
  hasUnreadAnnouncements,
  isAnnouncementUnread,
  markAnnouncementsSeen,
} from "@/lib/announcement-utils";
import { FormattedEditor } from "@/components/FormattedEditor";
import { adaptHtmlColorsForTheme } from "@/lib/text-format";
import { useTheme } from "@/context/ThemeContext";

function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 3a5 5 0 0 0-5 5v2.2c0 .5-.2 1-.5 1.4L5.1 14.2A1 1 0 0 0 6 16h12a1 1 0 0 0 .9-1.4l-1.4-2.6a2 2 0 0 1-.5-1.4V8a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function formatAnnouncementDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AnnouncementsButton({
  data,
  onSave,
  onRefresh,
}: {
  data: AppData;
  onSave: (data: AppData) => void;
  onRefresh?: () => void;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = hasUnreadAnnouncements(data);

  const announcements = [...(data.announcements ?? [])]
    .filter((announcement) => getAnnouncementCategory(announcement) === "general")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  useEffect(() => {
    if (!onRefresh) return;
    const tick = () => onRefresh();
    const interval = setInterval(tick, 15_000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const addAnnouncement = () => {
    const text = draft.trim();
    if (!text) return;
    const announcement: Announcement = {
      id: uuidv4(),
      text,
      createdAt: new Date().toISOString(),
      source: "manual",
    };
    onSave({
      ...data,
      announcements: [announcement, ...(data.announcements ?? [])],
    });
    setDraft("");
  };

  const deleteAnnouncement = (id: string) => {
    onSave({
      ...data,
      announcements: (data.announcements ?? []).filter((a) => a.id !== id),
    });
  };

  const confirmRead = () => {
    onSave(markAnnouncementsSeen(data));
  };

  return (
    <div className="relative inline-flex shrink-0" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative rounded-full border p-1.5 transition-colors ${
          unread
            ? "border-red-500 bg-red-500 text-white hover:bg-red-600"
            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        }`}
        title={unread ? "Nowe ogłoszenia" : "Ogłoszenia"}
        aria-label={unread ? "Nowe ogłoszenia" : "Ogłoszenia"}
      >
        <BellIcon className="h-5 w-5" />
        {unread && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-300 opacity-90" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-yellow-300 ring-2 ring-red-500" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[60] mt-2 w-[min(864px,calc(100vw-1rem))] rounded-lg border border-slate-200 bg-white text-left shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <h4 className="text-[19px] font-semibold text-slate-800 dark:text-slate-100">Ogłoszenia</h4>
          </div>

          <div className="max-h-[min(672px,70vh)] overflow-y-auto p-4">
            {announcements.length === 0 ? (
              <p className="px-2 py-8 text-center text-[19px] text-slate-400 dark:text-slate-500">
                Brak ogłoszeń
              </p>
            ) : (
              <ul className="space-y-3">
                {announcements.map((a) => {
                  const isNew = isAnnouncementUnread(a, data);
                  return (
                    <li
                      key={a.id}
                      className={`rounded-md border px-4 py-3 text-[19px] text-slate-700 dark:text-slate-200 ${
                        isNew
                          ? "border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/50"
                          : "border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80"
                      }`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <span className="text-[19px] text-slate-400">
                          {formatAnnouncementDate(a.createdAt)}
                          {isNew && (
                            <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[12px] font-semibold text-red-700 dark:bg-red-900 dark:text-red-300">
                              Nowe
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteAnnouncement(a.id)}
                          className="shrink-0 text-[19px] text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          title="Usuń"
                        >
                          ×
                        </button>
                      </div>
                      <p
                        className="whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: adaptHtmlColorsForTheme(a.text, theme) }}
                      />
                      {isNew && (
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={confirmRead}
                            className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[13px] font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                            title="Potwierdź odczytanie"
                          >
                            <span aria-hidden="true">✓</span>
                            Odczytano
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 p-4 dark:border-slate-700">
            <FormattedEditor
              value={draft}
              onChange={setDraft}
              placeholder="Nowe ogłoszenie..."
              multiline
              className="mb-3 min-h-[8rem] w-full rounded border border-slate-200 bg-white px-3 py-2 text-[19px] text-slate-900 focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={addAnnouncement}
              disabled={!draft.trim()}
              className="w-full rounded bg-blue-600 px-3 py-2.5 text-[19px] font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              Dodaj ogłoszenie
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
