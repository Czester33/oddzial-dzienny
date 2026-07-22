"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/context/DataContext";
import type { AppData, Physiotherapist } from "@/lib/types";
import { PageHeader, LoadingState, ErrorBanner, Card, Btn, Input } from "@/components/ui";
import { COLOR_PRESETS, createPhysiotherapist, resolvePhysioRowColor } from "@/lib/physio-utils";
import { useTheme } from "@/context/ThemeContext";

function reorderPhysios(
  list: Physiotherapist[],
  fromIndex: number,
  toIndex: number
): Physiotherapist[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length
  ) {
    return list;
  }
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function ColorPickerButton({
  physio,
  onPick,
}: {
  physio: Physiotherapist;
  onPick: (presetIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-black/15 bg-white/90 px-2 py-1.5 text-[16px] font-medium text-slate-800 hover:bg-white dark:border-white/20 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:bg-slate-800"
        aria-expanded={open}
        title="Zmień kolor sekcji"
      >
        <span
          className="h-4 w-4 shrink-0 rounded-sm border border-black/20 dark:border-white/30"
          style={{ backgroundColor: physio.color }}
          aria-hidden
        />
        Kolor
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 z-20 mb-2 w-[11rem] -translate-x-1/2 rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-600 dark:bg-slate-900">
          <p className="mb-1.5 text-center text-[13px] font-medium text-slate-500 dark:text-slate-400">
            Kolor sekcji
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {COLOR_PRESETS.map((preset, i) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  onPick(i);
                  setOpen(false);
                }}
                className={`aspect-square w-full rounded-md border-2 transition-transform hover:scale-105 ${
                  physio.color === preset.color
                    ? "border-slate-900 dark:border-white"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: preset.color }}
                title={preset.name}
                aria-label={preset.name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FizjoterapeuciPage() {
  const { data, loading, error, save } = useData();
  const { theme } = useTheme();
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  if (loading || !data) return <LoadingState />;

  const updateData = (newData: AppData) => save(newData);

  const addPhysio = () => {
    const physio = createPhysiotherapist("", data.physiotherapists.length);
    updateData({
      ...data,
      physiotherapists: [...data.physiotherapists, physio],
      currentPatients: {
        ...data.currentPatients,
        [physio.id]: [],
      },
    });
  };

  const updatePhysio = (updated: Physiotherapist) => {
    updateData({
      ...data,
      physiotherapists: data.physiotherapists.map((p) => (p.id === updated.id ? updated : p)),
    });
  };

  const reorderPhysioCards = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    updateData({
      ...data,
      physiotherapists: reorderPhysios(data.physiotherapists, fromIndex, toIndex),
    });
  };

  const deletePhysio = (id: string) => {
    if (!confirm("Usunąć fizjoterapeutę wraz z przypisanymi pacjentami?")) return;

    const { [id]: _, ...restPatients } = data.currentPatients;
    updateData({
      ...data,
      physiotherapists: data.physiotherapists.filter((p) => p.id !== id),
      currentPatients: restPatients,
      massages: {
        active: data.massages.active.map((m) =>
          m.physiotherapistId === id ? { ...m, physiotherapistId: "" } : m
        ),
        waiting: data.massages.waiting.map((m) =>
          m.physiotherapistId === id ? { ...m, physiotherapistId: "" } : m
        ),
      },
      archive: data.archive.map((a) =>
        a.physiotherapistId === id ? { ...a, physiotherapistId: "" } : a
      ),
      admissionArchive: (data.admissionArchive ?? []).map((month) => ({
        ...month,
        sessions: month.sessions.map((session) => ({
          ...session,
          patients: session.patients.map((slot) =>
            slot.physiotherapistId === id
              ? { ...slot, physiotherapistId: "" }
              : slot
          ),
        })),
      })),
      vacationArchive: (data.vacationArchive ?? []).map((year) => ({
        ...year,
        entries: year.entries.map((entry) =>
          entry.physiotherapistId === id
            ? { ...entry, physiotherapistId: "" }
            : entry
        ),
      })),
      dutyArchive: (data.dutyArchive ?? []).map((month) => ({
        ...month,
        entries: month.entries.map((entry) =>
          entry.physiotherapistId === id
            ? { ...entry, physiotherapistId: "" }
            : entry
        ),
      })),
    });
  };

  const applyColorPreset = (physio: Physiotherapist, presetIndex: number) => {
    const preset = COLOR_PRESETS[presetIndex];
    updatePhysio({ ...physio, color: preset.color, rowColor: preset.rowColor });
  };

  return (
    <div>
      <PageHeader title="Fizjoterapeuci">
        <Btn onClick={addPhysio}>+ Dodaj fizjoterapeutę</Btn>
      </PageHeader>
      {error && <ErrorBanner message={error} />}

      {data.physiotherapists.length === 0 ? (
        <Card className="px-6 py-12 text-center text-slate-500">
          Brak fizjoterapeutów. Kliknij „Dodaj fizjoterapeutę”, aby rozpocząć.
        </Card>
      ) : (
        <>
          <p className="mb-3 text-[16px] text-slate-500 dark:text-slate-400">
            Przeciągnij kafelki, aby zmienić kolejność — ta sama kolejność obowiązuje w tabelach
            „Obecni pacjenci”.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.physiotherapists.map((physio, index) => {
              const tileBg = resolvePhysioRowColor(physio.color, physio.rowColor, theme);
              const isDragging = draggingIndex === index;
              const isDropTarget = dragOverIndex === index && draggingIndex !== index;

              return (
                <div
                  key={physio.id}
                  draggable
                  onDragStart={(e) => {
                    const target = e.target as HTMLElement;
                    if (
                      target.closest("input, textarea, select, button, a, [contenteditable='true']")
                    ) {
                      e.preventDefault();
                      return;
                    }
                    dragIndexRef.current = index;
                    setDraggingIndex(index);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(index));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverIndex(index);
                  }}
                  onDragLeave={() => {
                    setDragOverIndex((current) => (current === index ? null : current));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromIndex =
                      dragIndexRef.current ?? Number(e.dataTransfer.getData("text/plain"));
                    reorderPhysioCards(fromIndex, index);
                    dragIndexRef.current = null;
                    setDraggingIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    dragIndexRef.current = null;
                    setDraggingIndex(null);
                    setDragOverIndex(null);
                  }}
                  title="Przeciągnij, aby zmienić kolejność tabel"
                  className={`flex aspect-square cursor-grab flex-col overflow-hidden rounded-lg border shadow-sm active:cursor-grabbing ${
                    isDragging ? "opacity-50" : ""
                  } ${isDropTarget ? "ring-2 ring-blue-400 ring-offset-2" : ""}`}
                  style={{
                    backgroundColor: tileBg,
                    borderColor: physio.color,
                  }}
                >
                  <div
                    className="relative flex shrink-0 items-center justify-center px-10 py-2.5 text-white"
                    style={{ backgroundColor: physio.color }}
                  >
                    <span
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-[14px] font-bold tracking-widest text-white/70"
                      aria-hidden
                    >
                      ⠿
                    </span>
                    <span className="truncate text-center text-[17px] font-semibold">
                      {physio.name || `Fizjoterapeuta ${index + 1}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => deletePhysio(physio.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[18px] leading-none text-white/90 hover:bg-black/20"
                      title="Usuń"
                      aria-label="Usuń fizjoterapeutę"
                    >
                      ×
                    </button>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
                    <div>
                      <label className="mb-1 block text-[14px] font-medium text-slate-500 dark:text-slate-400">
                        Imię / nazwa
                      </label>
                      <Input
                        value={physio.name}
                        onChange={(name) => updatePhysio({ ...physio, name })}
                        placeholder="np. Monia"
                        className="!py-1 !text-[17px]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[14px] font-medium text-slate-500 dark:text-slate-400">
                        Notatka w nagłówku
                      </label>
                      <Input
                        value={physio.headerNote ?? ""}
                        onChange={(headerNote) => updatePhysio({ ...physio, headerNote })}
                        placeholder="np. urlop 6.07–17.07"
                        className="!py-1 !text-[17px]"
                      />
                    </div>

                    <div className="mt-auto">
                      <ColorPickerButton
                        physio={physio}
                        onPick={(i) => applyColorPreset(physio, i)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
