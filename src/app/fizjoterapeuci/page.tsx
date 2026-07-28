"use client";

import { useRef, useState } from "react";
import { useData } from "@/context/DataContext";
import type { AppData, Physiotherapist } from "@/lib/types";
import { PageHeader, LoadingState, ErrorBanner, Card, Btn, Input } from "@/components/ui";
import { PhysioColorPicker } from "@/components/PhysioColorPicker";
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

    const restPatients = { ...data.currentPatients };
    delete restPatients[id];
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

  const applyCustomColor = (physio: Physiotherapist, color: string, rowColor: string) => {
    updatePhysio({ ...physio, color, rowColor });
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
            Przeciągnij za przycisk ⠿ w nagłówku kafelka, aby zmienić kolejność — ta sama kolejność
            obowiązuje w tabelach „Obecni pacjenci”.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.physiotherapists.map((physio, index) => {
              const tileBg = resolvePhysioRowColor(physio.color, physio.rowColor, theme);
              const isDragging = draggingIndex === index;
              const isDropTarget = dragOverIndex === index && draggingIndex !== index;

              return (
                <div
                  key={physio.id}
                  data-physio-card
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
                  className={`flex aspect-square flex-col overflow-hidden rounded-lg border shadow-sm ${
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
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={(e) => {
                        const card = (e.currentTarget as HTMLElement).closest("[data-physio-card]");
                        if (card instanceof HTMLElement) {
                          e.dataTransfer.setDragImage(card, 40, 24);
                        }
                        dragIndexRef.current = index;
                        setDraggingIndex(index);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(index));
                      }}
                      onDragEnd={() => {
                        dragIndexRef.current = null;
                        setDraggingIndex(null);
                        setDragOverIndex(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                      }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 cursor-grab select-none rounded px-1.5 py-1 text-[14px] font-bold tracking-widest text-white/80 hover:bg-black/20 hover:text-white active:cursor-grabbing"
                      title="Przeciągnij, aby zmienić kolejność"
                      aria-label="Zmień kolejność fizjoterapeuty"
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
                      <PhysioColorPicker
                        physio={physio}
                        onPickPreset={(i) => applyColorPreset(physio, i)}
                        onPickCustom={(color, rowColor) => applyCustomColor(physio, color, rowColor)}
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
