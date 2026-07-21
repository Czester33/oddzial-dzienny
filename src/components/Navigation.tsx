"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/context/DataContext";
import { useTheme } from "@/context/ThemeContext";
import { AnnouncementsButton } from "@/components/AnnouncementsButton";
import { AppGuideButton } from "@/components/AppGuideButton";
import { getOrderedNavItems, NAV_ITEMS, reorderNavOrder } from "@/lib/nav-utils";
import { APP_BETA_NOTICE } from "@/lib/app-beta-notice";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Jasny motyw" : "Ciemny motyw";
  const switchTo = isDark ? "Przełącz na jasny motyw" : "Przełącz na ciemny motyw";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[15px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      title={switchTo}
      aria-label={switchTo}
      suppressHydrationWarning
    >
      <span suppressHydrationWarning>{label}</span>
    </button>
  );
}

function NavTab({
  href,
  label,
  active,
  editing,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: {
  href: string;
  label: string;
  active: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCommitEdit: (value: string) => void;
  onCancelEdit: () => void;
}) {
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(label);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, label]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommitEdit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommitEdit(draft);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancelEdit();
          }
        }}
        className={`w-full min-w-[8rem] rounded-md border px-3 py-2 text-[19px] font-medium outline-none ${
          active
            ? "border-blue-400 bg-blue-600 text-white"
            : "border-slate-300 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        }`}
      />
    );
  }

  return (
    <Link
      href={href}
      draggable={false}
      onDoubleClick={(e) => {
        e.preventDefault();
        onStartEdit();
      }}
      className={`block rounded-md px-3 py-2 text-[19px] font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

export function Navigation() {
  const pathname = usePathname();
  const { data, saving, save, canUndo, undo, refresh } = useData();
  const silentRefresh = useCallback(() => refresh({ silent: true }), [refresh]);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [editingHref, setEditingHref] = useState<string | null>(null);

  const navItems = useMemo(
    () => getOrderedNavItems(data?.navOrder, data?.navLabels),
    [data?.navOrder, data?.navLabels]
  );

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (!data || fromIndex === toIndex) return;
    const currentOrder = navItems.map((item) => item.href);
    save({
      ...data,
      navOrder: reorderNavOrder(currentOrder, fromIndex, toIndex),
    });
  };

  const commitLabel = (href: string, value: string) => {
    if (!data) return;
    const trimmed = value.trim();
    const defaultLabel = NAV_ITEMS.find((item) => item.href === href)?.label ?? "";
    const navLabels = { ...(data.navLabels ?? {}) };

    if (!trimmed || trimmed === defaultLabel) {
      delete navLabels[href];
    } else {
      navLabels[href] = trimmed;
    }

    save({ ...data, navLabels });
    setEditingHref(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;

      const target = e.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      e.preventDefault();
      if (canUndo && !saving) void undo();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canUndo, saving, undo]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mx-auto max-w-[1600px] px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <h1 className="text-[19px] font-bold text-slate-800 dark:text-slate-100">
              Oddział dzienny (wersja beta)
            </h1>
            <p className="text-[19px] text-slate-500 dark:text-slate-400">Zarządzanie pacjentami i grafikiem</p>
            <p className="text-[15px] text-amber-700 dark:text-amber-400">{APP_BETA_NOTICE}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {saving && <span className="text-[19px] text-blue-600 dark:text-blue-400">Zapisywanie...</span>}
            <button
              type="button"
              onClick={() => void undo()}
              disabled={!canUndo || saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[15px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              title="Cofnij ostatnią zmianę (Ctrl+Z)"
            >
              Cofnij
            </button>
            <ThemeToggle />
            <AppGuideButton />
            {data && (
              <AnnouncementsButton
                data={data}
                onSave={save}
                onRefresh={silentRefresh}
              />
            )}
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 pb-2">
          {navItems.map((item, index) => {
            const active = pathname.startsWith(item.href);
            const isDragging = draggingIndex === index;
            const isDropTarget = dragOverIndex === index && draggingIndex !== index;
            const isEditing = editingHref === item.href;

            return (
              <div
                key={item.href}
                draggable={!isEditing}
                onDragStart={(e) => {
                  if (isEditing) {
                    e.preventDefault();
                    return;
                  }
                  dragIndexRef.current = index;
                  setDraggingIndex(index);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(index));
                }}
                onDragOver={(e) => {
                  if (isEditing) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverIndex(index);
                }}
                onDragLeave={() => {
                  setDragOverIndex((current) => (current === index ? null : current));
                }}
                onDrop={(e) => {
                  if (isEditing) return;
                  e.preventDefault();
                  const fromIndex = dragIndexRef.current ?? Number(e.dataTransfer.getData("text/plain"));
                  handleReorder(fromIndex, index);
                  dragIndexRef.current = null;
                  setDraggingIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  dragIndexRef.current = null;
                  setDraggingIndex(null);
                  setDragOverIndex(null);
                }}
                title="Przeciągnij, aby zmienić kolejność. Kliknij dwukrotnie, aby zmienić nazwę."
                className={`rounded-md ${isEditing ? "" : "cursor-grab active:cursor-grabbing"} ${
                  isDragging ? "opacity-50" : ""
                } ${isDropTarget ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}
              >
                <NavTab
                  href={item.href}
                  label={item.label}
                  active={active}
                  editing={isEditing}
                  onStartEdit={() => setEditingHref(item.href)}
                  onCommitEdit={(value) => commitLabel(item.href, value)}
                  onCancelEdit={() => setEditingHref(null)}
                />
              </div>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
