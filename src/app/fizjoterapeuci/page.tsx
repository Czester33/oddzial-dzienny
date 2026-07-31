"use client";

import { useRef, useState } from "react";
import { useData } from "@/context/DataContext";
import type { AppData, Physiotherapist } from "@/lib/types";
import { PageHeader, LoadingState, ErrorBanner, Card, Btn, Input } from "@/components/ui";
import { PhysioColorPicker } from "@/components/PhysioColorPicker";
import { COLOR_PRESETS, createPhysiotherapist, physioDisplayName, resolvePhysioRowColor, restorePhysiotherapist, retirePhysiotherapist, countPhysioPurgeImpact, buildPhysioPurgeConfirmMessage, purgeRetiredPhysiotherapist } from "@/lib/physio-utils";
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

    const physio = data.physiotherapists.find((p) => p.id === id);
    const restPatients = { ...data.currentPatients };
    delete restPatients[id];
    const retired = [...(data.retiredPhysiotherapists ?? [])];
    if (physio && !retired.some((p) => p.id === id)) {
      retired.push(retirePhysiotherapist(physio));
    }
    updateData({
      ...data,
      physiotherapists: data.physiotherapists.filter((p) => p.id !== id),
      retiredPhysiotherapists: retired,
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

  const restorePhysio = (id: string) => {
    const retired = data.retiredPhysiotherapists ?? [];
    const physio = retired.find((p) => p.id === id);
    if (!physio) return;

    const label = physioDisplayName(physio.name) || "fizjoterapeutę";
    if (
      !confirm(
        `Przywrócić ${label}? Urlopy i archiwum pozostaną przypisane do tej samej osoby.`
      )
    ) {
      return;
    }

    updateData({
      ...data,
      physiotherapists: [...data.physiotherapists, restorePhysiotherapist(physio)],
      retiredPhysiotherapists: retired.filter((p) => p.id !== id),
      currentPatients: {
        ...data.currentPatients,
        [physio.id]: data.currentPatients[physio.id] ?? [],
      },
    });
  };

  const purgePhysio = (id: string) => {
    const retired = data.retiredPhysiotherapists ?? [];
    const physio = retired.find((p) => p.id === id);
    if (!physio) return;

    const label = physioDisplayName(physio.name) || "fizjoterapeutę";
    const impact = countPhysioPurgeImpact(data, id);
    if (!confirm(buildPhysioPurgeConfirmMessage(label, impact))) return;

    updateData(purgeRetiredPhysiotherapist(data, id));
  };

  const retiredPhysios = data.retiredPhysiotherapists ?? [];
  const hiddenCount = data.physiotherapists.filter((p) => p.hidden).length;

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
            obowiązuje w tabelach „Obecni pacjenci”. „Ukryj” chowa kafelek z tabel pacjentów i list
            wyboru (dane zostają).
            {hiddenCount > 0 ? (
              <span className="mt-1 block text-slate-400 dark:text-slate-500">
                Ukrytych: {hiddenCount}
              </span>
            ) : null}
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
                  } ${physio.hidden ? "opacity-60" : ""} ${
                    isDropTarget ? "ring-2 ring-blue-400 ring-offset-2" : ""
                  }`}
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
                      {physioDisplayName(physio.name) || `Fizjoterapeuta ${index + 1}`}
                      {physio.hidden ? (
                        <span className="ml-1 text-[13px] font-normal text-white/75">(ukryty)</span>
                      ) : null}
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

                    <div className="mt-auto space-y-3">
                      <button
                        type="button"
                        onClick={() => updatePhysio({ ...physio, hidden: !physio.hidden })}
                        className="w-full rounded-md border border-slate-300/80 bg-white/70 px-2 py-1.5 text-[15px] font-medium text-slate-700 hover:bg-white dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/70"
                      >
                        {physio.hidden ? "Pokaż w tabelach" : "Ukryj z tabel"}
                      </button>
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

      {retiredPhysios.length > 0 ? (
        <div className="mt-12 pt-2">
          <details className="mx-auto max-w-md">
            <summary className="cursor-pointer list-none text-center text-[13px] text-slate-400/70 marker:content-none hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-500 [&::-webkit-details-marker]:hidden">
              Przywróć usuniętego fizjoterapeutę
            </summary>
            <ul className="mt-2 space-y-2 text-center">
              {retiredPhysios.map((physio) => (
                <li
                  key={physio.id}
                  className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
                >
                  <span className="text-[13px] text-slate-500 dark:text-slate-400">
                    {physioDisplayName(physio.name) || "Bez nazwy"}
                  </span>
                  <button
                    type="button"
                    onClick={() => restorePhysio(physio.id)}
                    className="text-[13px] text-slate-400/80 underline-offset-2 hover:text-slate-600 hover:underline dark:text-slate-600 dark:hover:text-slate-400"
                  >
                    Przywróć
                  </button>
                  <span className="text-[12px] text-slate-300 dark:text-slate-600">·</span>
                  <button
                    type="button"
                    onClick={() => purgePhysio(physio.id)}
                    className="text-[13px] text-red-500/80 underline-offset-2 hover:text-red-600 hover:underline dark:text-red-400/80 dark:hover:text-red-400"
                  >
                    Usuń trwale
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
    </div>
  );
}
