"use client";

import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useData } from "@/context/DataContext";
import type { AppData, NotepadNote } from "@/lib/types";
import { PageHeader, LoadingState, ErrorBanner, Card, Btn } from "@/components/ui";
import { FormattedEditor } from "@/components/FormattedEditor";
import { stripHtml } from "@/lib/text-format";

function sortNotes(notes: NotepadNote[]): NotepadNote[] {
  return [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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

export default function NotatnikPage() {
  const { data, loading, error, save } = useData();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const notes = useMemo(
    () => sortNotes(data?.notepadNotes ?? []),
    [data?.notepadNotes]
  );

  useEffect(() => {
    if (notes.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !notes.some((note) => note.id === selectedId)) {
      setSelectedId(notes[0].id);
    }
  }, [notes, selectedId]);

  if (loading || !data) return <LoadingState />;

  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;

  const saveNotes = (nextNotes: NotepadNote[]) => {
    save(updateNotes(data, nextNotes));
  };

  const patchNote = (id: string, patch: Partial<NotepadNote>) => {
    const now = new Date().toISOString();
    saveNotes(
      (data.notepadNotes ?? []).map((note) =>
        note.id === id ? { ...note, ...patch, updatedAt: now } : note
      )
    );
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
  };

  const deleteNote = (id: string) => {
    const nextNotes = (data.notepadNotes ?? []).filter((note) => note.id !== id);
    saveNotes(nextNotes);
    if (selectedId === id) {
      setSelectedId(nextNotes[0]?.id ?? null);
    }
  };

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
                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(note.id)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        active
                          ? "bg-blue-50 dark:bg-blue-950/40"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/70"
                      }`}
                    >
                      <p
                        className={`truncate text-[17px] font-medium ${
                          active
                            ? "text-blue-800 dark:text-blue-300"
                            : "text-slate-800 dark:text-slate-100"
                        }`}
                      >
                        {noteLabel(note)}
                      </p>
                      <p className="mt-0.5 text-[13px] text-slate-400 dark:text-slate-500">
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
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="notepad-title"
                    className="mb-1 block text-[15px] font-medium text-slate-600 dark:text-slate-400"
                  >
                    Tytuł
                  </label>
                  <input
                    id="notepad-title"
                    type="text"
                    value={selectedNote.title}
                    onChange={(e) => patchNote(selectedNote.id, { title: e.target.value })}
                    placeholder="Opcjonalny tytuł notatki"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[19px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <Btn variant="danger" onClick={() => deleteNote(selectedNote.id)} className="mt-6">
                  Usuń
                </Btn>
              </div>

              <div>
                <p className="mb-1 text-[15px] font-medium text-slate-600 dark:text-slate-400">
                  Treść
                </p>
                <p className="mb-2 text-[13px] text-slate-400 dark:text-slate-500">
                  Kliknij pole, aby formatować tekst. Tab tworzy podpunkt na liście.
                </p>
                <FormattedEditor
                  key={selectedNote.id}
                  value={selectedNote.text}
                  onChange={(text) => patchNote(selectedNote.id, { text })}
                  multiline
                  extendedFormatting
                  placeholder="Wpisz notatkę…"
                  className="min-h-[min(60vh,560px)] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[19px] text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
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
