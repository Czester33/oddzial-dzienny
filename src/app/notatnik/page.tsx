"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { v4 as uuidv4 } from "uuid";
import { useData } from "@/context/DataContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useTheme } from "@/context/ThemeContext";
import type { AppData, NotepadNote, Physiotherapist } from "@/lib/types";
import { PageHeader, LoadingState, ErrorBanner, Card, Btn } from "@/components/ui";
import { PhysioSelect } from "@/components/PhysioSelect";
import { FormattedEditor } from "@/components/FormattedEditor";
import { adaptHtmlColorsForTheme, stripHtml } from "@/lib/text-format";
import { getPhysioById, physioDisplayName, physioPlanningDisplayLabel, physioPlanningOptionLabel, physiosForPlanningSelect, resolvePhysioRowColor } from "@/lib/physio-utils";

type NoteDraft = {
  title: string;
  text: string;
  physiotherapistId: string;
};

function sortNotes(notes: NotepadNote[]): NotepadNote[] {
  return [...notes].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function noteLabel(note: NotepadNote): string {
  const title = note.title.trim();
  if (title) return title;
  const preview = stripHtml(note.text).replace(/\s+/g, " ").trim();
  if (preview) return preview.length > 48 ? `${preview.slice(0, 48)}…` : preview;
  return "Nowa notatka";
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updateNotes(data: AppData, notes: NotepadNote[]): AppData {
  return { ...data, notepadNotes: notes };
}

function draftFromNote(note: NotepadNote): NoteDraft {
  return {
    title: note.title,
    text: note.text,
    physiotherapistId: note.physiotherapistId ?? "",
  };
}

function noteTileStyle(
  physio: Physiotherapist | undefined,
  active: boolean,
  isDark: boolean
): CSSProperties | undefined {
  if (!physio) return undefined;
  const accent = physio.color;
  const fill = resolvePhysioRowColor(physio.color, physio.rowColor, isDark ? "dark" : "light");
  if (active) {
    return {
      backgroundColor: fill,
      boxShadow: `0 0 0 2px ${accent}, 0 0 16px ${accent}66`,
      color: isDark ? "#f1f5f9" : "#0f172a",
    };
  }
  return {
    borderLeft: `4px solid ${accent}`,
    backgroundColor: isDark ? `${fill}44` : `${fill}66`,
  };
}

export default function NotatnikPage() {
  const { data, loading, error, save } = useData();
  const askConfirm = useConfirm();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDraft>({ title: "", text: "", physiotherapistId: "" });

  const notes = useMemo(
    () => sortNotes(data?.notepadNotes ?? []),
    [data?.notepadNotes]
  );

  useEffect(() => {
    if (notes.length === 0) {
      setSelectedId(null);
      setEditingId(null);
      return;
    }
    if (!selectedId || !notes.some((note) => note.id === selectedId)) {
      setSelectedId(notes[0].id);
      setEditingId(null);
    }
  }, [notes, selectedId]);

  if (loading || !data) return <LoadingState />;

  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;
  const isEditing = selectedNote !== null && editingId === selectedNote.id;

  const saveNotes = (nextNotes: NotepadNote[]) => {
    save(updateNotes(data, nextNotes));
  };

  const selectNote = (id: string) => {
    setSelectedId(id);
    setEditingId(null);
  };

  const startEdit = (note: NotepadNote) => {
    setSelectedId(note.id);
    setEditingId(note.id);
    setDraft(draftFromNote(note));
  };

  const saveDraft = () => {
    if (!selectedNote || !isEditing) return;
    const now = new Date().toISOString();
    const nextNote: NotepadNote = {
      id: selectedNote.id,
      title: draft.title.trim(),
      text: draft.text,
      createdAt: selectedNote.createdAt,
      updatedAt: now,
      ...(draft.physiotherapistId ? { physiotherapistId: draft.physiotherapistId } : {}),
    };
    saveNotes(
      (data.notepadNotes ?? []).map((note) => (note.id === selectedNote.id ? nextNote : note))
    );
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const addNote = () => {
    const now = new Date().toISOString();
    const note: NotepadNote = {
      id: uuidv4(),
      title: "",
      text: "",
      createdAt: now,
      updatedAt: now,
    };
    saveNotes([note, ...(data.notepadNotes ?? [])]);
    setSelectedId(note.id);
    setEditingId(note.id);
    setDraft(draftFromNote(note));
  };

  const deleteNote = async (id: string) => {
    if (
      !(await askConfirm({
        title: "Usunąć notatkę?",
        message: "Notatka zostanie trwale usunięta.",
        variant: "danger",
      }))
    ) {
      return;
    }
    const nextNotes = (data.notepadNotes ?? []).filter((note) => note.id !== id);
    saveNotes(nextNotes);
    if (selectedId === id) {
      setSelectedId(nextNotes[0]?.id ?? null);
      setEditingId(null);
    } else if (editingId === id) {
      setEditingId(null);
    }
  };

  const selectedPhysio = selectedNote?.physiotherapistId
    ? getPhysioById(data, selectedNote.physiotherapistId)
    : undefined;

  return (
    <div>
      <PageHeader title="Notatnik">
        <Btn onClick={addNote}>Nowa notatka</Btn>
      </PageHeader>

      {error && <ErrorBanner message={error} />}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="w-full shrink-0 lg:w-72">
          <div className="border-b border-slate-200 px-4 py-3 text-[15px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
            Notatki ({notes.length})
          </div>
          {notes.length === 0 ? (
            <p className="px-4 py-8 text-center text-[17px] text-slate-400 dark:text-slate-500">
              Brak notatek. Kliknij „Nowa notatka”.
            </p>
          ) : (
            <ul className="max-h-[min(70vh,640px)] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {notes.map((note) => {
                const active = note.id === selectedId;
                const physio = note.physiotherapistId
                  ? getPhysioById(data, note.physiotherapistId)
                  : undefined;
                const tileStyle = noteTileStyle(physio, active, isDark);
                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={() => selectNote(note.id)}
                      style={tileStyle}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        tileStyle
                          ? ""
                          : active
                            ? "bg-blue-50 dark:bg-blue-950/40"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/70"
                      }`}
                    >
                      <p
                        className={`truncate text-[17px] font-medium ${
                          tileStyle
                            ? ""
                            : active
                              ? "text-blue-800 dark:text-blue-300"
                              : "text-slate-800 dark:text-slate-100"
                        }`}
                      >
                        {noteLabel(note)}
                      </p>
                      {physio ? (
                        <p className="mt-0.5 truncate text-[13px] font-medium opacity-90">
                          Od: {physioDisplayName(physio.name)}
                        </p>
                      ) : null}
                      <p
                        className={`mt-0.5 text-[13px] ${
                          tileStyle ? "opacity-80" : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {formatUpdatedAt(note.updatedAt)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 flex-1">
          {selectedNote ? (
            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  {isEditing ? (
                    <>
                      <div>
                        <label
                          htmlFor="notepad-title"
                          className="mb-1 block text-[15px] font-medium text-slate-600 dark:text-slate-400"
                        >
                          Tytuł
                        </label>
                        <input
                          id="notepad-title"
                          type="text"
                          value={draft.title}
                          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                          placeholder="Opcjonalny tytuł notatki"
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[19px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="notepad-author"
                          className="mb-1 block text-[15px] font-medium text-slate-600 dark:text-slate-400"
                        >
                          Od kogo
                        </label>
                        <PhysioSelect
                          value={draft.physiotherapistId}
                          onChange={(physiotherapistId) =>
                            setDraft((d) => ({ ...d, physiotherapistId }))
                          }
                          emptyLabel="— nie wybrano —"
                          className="w-full max-w-md cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-[17px] outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:focus:border-blue-400"
                          options={physiosForPlanningSelect(data).map((p) => ({
                            value: p.id,
                            label: physioPlanningOptionLabel(p),
                            displayLabel: physioPlanningDisplayLabel(p),
                            color: p.color,
                            rowColor: p.rowColor,
                          }))}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-[22px] font-semibold text-slate-900 dark:text-slate-100">
                        {selectedNote.title.trim() || noteLabel(selectedNote)}
                      </h3>
                      {selectedPhysio ? (
                        <p className="text-[15px] font-medium text-slate-600 dark:text-slate-400">
                          Od:{" "}
                          <span
                            className="inline-block rounded px-2 py-0.5 text-[15px] font-semibold text-white"
                            style={{ backgroundColor: selectedPhysio.color }}
                          >
                            {physioDisplayName(selectedPhysio.name)}
                          </span>
                        </p>
                      ) : null}
                      <p className="text-[13px] text-slate-400 dark:text-slate-500">
                        Zaktualizowano: {formatUpdatedAt(selectedNote.updatedAt)}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {isEditing ? (
                    <>
                      <Btn onClick={saveDraft}>Zapisz</Btn>
                      <Btn variant="secondary" onClick={cancelEdit}>
                        Anuluj
                      </Btn>
                    </>
                  ) : (
                    <Btn variant="secondary" onClick={() => startEdit(selectedNote)}>
                      Edytuj
                    </Btn>
                  )}
                  <Btn variant="danger" onClick={() => void deleteNote(selectedNote.id)}>
                    Usuń
                  </Btn>
                </div>
              </div>

              <div>
                {isEditing ? (
                  <>
                    <p className="mb-1 text-[15px] font-medium text-slate-600 dark:text-slate-400">
                      Treść
                    </p>
                    <p className="mb-2 text-[13px] text-slate-400 dark:text-slate-500">
                      Kliknij pole, aby formatować tekst. Enter kontynuuje numerowanie (1. → 2.).
                      Po przerwie wpisz 1. — kropka podpowie kolejny numer (np. 3.). Tab = podpunkt z kropką.
                    </p>
                    <FormattedEditor
                      key={`edit-${selectedNote.id}`}
                      value={draft.text}
                      onChange={(text) => setDraft((d) => ({ ...d, text }))}
                      multiline
                      extendedFormatting
                      placeholder="Wpisz notatkę…"
                      className="min-h-[min(60vh,560px)] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[19px] text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </>
                ) : (
                  <div
                    className="formatted-editor min-h-[min(40vh,400px)] w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-[19px] text-slate-900 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    dangerouslySetInnerHTML={{
                      __html:
                        adaptHtmlColorsForTheme(selectedNote.text, theme) ||
                        '<span class="text-slate-400">Brak treści.</span>',
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <p className="px-4 py-16 text-center text-[17px] text-slate-400 dark:text-slate-500">
              Wybierz notatkę z listy albo utwórz nową.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
