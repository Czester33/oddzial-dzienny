"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppData } from "@/lib/types";
import { deepEqual, mergeAppData } from "@/lib/app-data-merge";

const MAX_UNDO_HISTORY = 50;
const REMOTE_POLL_MS = 8_000;
/** Ignore silent remote refresh briefly after local edits so the UI does not jump. */
const LOCAL_EDIT_QUIET_MS = 12_000;

type UndoEntry = {
  /** Snapshot before this client's edit. */
  before: AppData;
  /** Snapshot after this client's edit (what was written). */
  after: AppData;
};

type ApiDataResponse = {
  data: AppData;
  updatedAt: string;
};

type PersistResult =
  | { ok: true; updatedAt: string; data: AppData }
  | { ok: false; conflict?: false }
  | { ok: false; conflict: true; data: AppData; updatedAt: string };

interface DataContextValue {
  data: AppData | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  save: (data: AppData) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const dataRef = useRef<AppData | null>(null);
  const historyRef = useRef<UndoEntry[]>([]);
  const redoHistoryRef = useRef<UndoEntry[]>([]);
  const pendingSaveRef = useRef<AppData | null>(null);
  const saveInFlightRef = useRef(false);
  const undoBaselineRef = useRef<AppData | null>(null);
  /** Last known server revision this client synced from / wrote. */
  const serverUpdatedAtRef = useRef<string>("1970-01-01T00:00:00.000Z");
  /** AppData matching serverUpdatedAtRef (common ancestor for merges). */
  const syncedDataRef = useRef<AppData | null>(null);
  const lastLocalEditAtRef = useRef(0);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    redoHistoryRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const adoptServerState = useCallback((next: AppData, updatedAt: string) => {
    syncedDataRef.current = next;
    serverUpdatedAtRef.current = updatedAt;
    dataRef.current = next;
    setData(next);
  }, []);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await fetch("/api/data");
        if (!res.ok) throw new Error("Błąd wczytywania");
        const json = (await res.json()) as ApiDataResponse | AppData;

        const payload: ApiDataResponse =
          json && typeof json === "object" && "data" in json && "updatedAt" in json
            ? (json as ApiDataResponse)
            : { data: json as AppData, updatedAt: new Date().toISOString() };

        if (options?.silent) {
          if (saveInFlightRef.current || pendingSaveRef.current) return;
          if (Date.now() - lastLocalEditAtRef.current < LOCAL_EDIT_QUIET_MS) return;
          if (payload.updatedAt === serverUpdatedAtRef.current) return;
          // Another client changed data — only adopt if our UI matches last sync
          // (no unsaved local drift beyond quiet window).
          if (
            syncedDataRef.current &&
            dataRef.current &&
            !deepEqual(dataRef.current, syncedDataRef.current)
          ) {
            return;
          }
        }

        adoptServerState(payload.data, payload.updatedAt);
        if (!options?.silent) {
          clearHistory();
        }
      } catch {
        if (!options?.silent) {
          setError("Nie udało się wczytać danych");
        }
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [adoptServerState, clearHistory]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      if (saveInFlightRef.current || pendingSaveRef.current) return;
      if (Date.now() - lastLocalEditAtRef.current < LOCAL_EDIT_QUIET_MS) return;
      void refresh({ silent: true });
    };
    const interval = setInterval(tick, REMOTE_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [refresh]);

  /** Network write only — never overwrite newer optimistic UI. */
  const persist = useCallback(async (newData: AppData): Promise<PersistResult> => {
    setError(null);
    try {
      let attemptData = newData;
      let baseUpdatedAt = serverUpdatedAtRef.current;
      let baseData = syncedDataRef.current;

      for (let attempt = 0; attempt < 5; attempt++) {
        // Fold any newer clicks that arrived while we waited into this write.
        if (pendingSaveRef.current && baseData) {
          attemptData = mergeAppData(baseData, pendingSaveRef.current, attemptData);
          pendingSaveRef.current = null;
        } else if (pendingSaveRef.current) {
          attemptData = pendingSaveRef.current;
          pendingSaveRef.current = null;
        }

        const res = await fetch("/api/data", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: attemptData,
            baseUpdatedAt,
          }),
        });

        if (res.status === 409) {
          const conflict = (await res.json()) as {
            data: AppData;
            updatedAt: string;
          };
          if (!baseData) {
            syncedDataRef.current = conflict.data;
            serverUpdatedAtRef.current = conflict.updatedAt;
            return {
              ok: false,
              conflict: true,
              data: conflict.data,
              updatedAt: conflict.updatedAt,
            };
          }

          const localIntent = pendingSaveRef.current ?? dataRef.current ?? attemptData;
          attemptData = mergeAppData(baseData, localIntent, conflict.data);
          baseUpdatedAt = conflict.updatedAt;
          baseData = conflict.data;
          syncedDataRef.current = conflict.data;
          serverUpdatedAtRef.current = conflict.updatedAt;
          continue;
        }

        if (!res.ok) throw new Error("Błąd zapisu");

        const body = (await res.json()) as { ok: true; updatedAt: string };
        syncedDataRef.current = attemptData;
        serverUpdatedAtRef.current = body.updatedAt;

        // Keep showing the newest optimistic state; only sync UI if it still
        // matches what we just wrote (no newer clicks waiting).
        if (!pendingSaveRef.current) {
          const ui = dataRef.current;
          if (!ui || deepEqual(ui, newData) || deepEqual(ui, attemptData)) {
            dataRef.current = attemptData;
            setData(attemptData);
          }
        }

        return { ok: true, updatedAt: body.updatedAt, data: attemptData };
      }

      setError("Konflikt zapisu — odśwież stronę i spróbuj ponownie");
      return { ok: false };
    } catch {
      setError("Nie udało się zapisać danych");
      return { ok: false };
    }
  }, []);

  const recordUndoEntry = useCallback((before: AppData, after: AppData) => {
    if (deepEqual(before, after)) return;
    const hist = historyRef.current;
    const last = hist[hist.length - 1];
    // Coalesce rapid edits that share the same baseline into one undo step.
    if (last && deepEqual(last.before, before)) {
      hist[hist.length - 1] = { before, after };
    } else {
      hist.push({ before, after });
    }
    historyRef.current = hist.slice(-MAX_UNDO_HISTORY);
    setCanUndo(historyRef.current.length > 0);
    // A new edit invalidates the redo chain.
    redoHistoryRef.current = [];
    setCanRedo(false);
  }, []);

  const flushSaveQueue = useCallback(async () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);

    try {
      while (pendingSaveRef.current) {
        const next = pendingSaveRef.current;
        pendingSaveRef.current = null;

        const result = await persist(next);
        if (!result.ok) {
          if (result.conflict) {
            // Only hard-replace UI when we have nothing newer queued.
            if (!pendingSaveRef.current) {
              dataRef.current = result.data;
              setData(result.data);
              undoBaselineRef.current = null;
              clearHistory();
            }
            break;
          }
          if (!pendingSaveRef.current) {
            pendingSaveRef.current = next;
          }
          break;
        }

        // Keep optimistic undo entry in sync with what was actually persisted.
        const baseline = undoBaselineRef.current;
        if (baseline) {
          recordUndoEntry(baseline, result.data);
        }

        if (!pendingSaveRef.current) {
          undoBaselineRef.current = null;
        }
      }
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
      if (pendingSaveRef.current) {
        void flushSaveQueue();
      }
    }
  }, [clearHistory, persist, recordUndoEntry]);

  const save = useCallback(
    async (newData: AppData) => {
      const current = dataRef.current;
      lastLocalEditAtRef.current = Date.now();

      // Optimistic UI — always immediate, never waits for network.
      dataRef.current = newData;
      setData(newData);

      if (!current) {
        pendingSaveRef.current = newData;
        void flushSaveQueue();
        return;
      }

      // Fresh edit burst when idle; keep baseline when coalescing onto an in-flight save.
      if (!saveInFlightRef.current && !pendingSaveRef.current) {
        undoBaselineRef.current = current;
      } else if (!undoBaselineRef.current) {
        undoBaselineRef.current = current;
      }

      const baseline = undoBaselineRef.current ?? current;
      recordUndoEntry(baseline, newData);

      pendingSaveRef.current = newData;

      // Do not await the full network round-trip on every click.
      void flushSaveQueue();
    },
    [flushSaveQueue, recordUndoEntry]
  );

  const undo = useCallback(async () => {
    const entry = historyRef.current.pop();
    if (!entry) return;

    setCanUndo(historyRef.current.length > 0);
    redoHistoryRef.current = [...redoHistoryRef.current, entry].slice(-MAX_UNDO_HISTORY);
    setCanRedo(true);

    pendingSaveRef.current = null;
    undoBaselineRef.current = null;
    lastLocalEditAtRef.current = Date.now();

    // Restore the pre-edit snapshot directly so added vacations/ranges fully revert.
    // Merge only when the server moved past the edited revision.
    const remote = syncedDataRef.current;
    const restored =
      remote && !deepEqual(remote, entry.after) && !deepEqual(remote, entry.before)
        ? mergeAppData(entry.after, entry.before, remote)
        : entry.before;

    dataRef.current = restored;
    setData(restored);
    pendingSaveRef.current = restored;
    void flushSaveQueue();
  }, [flushSaveQueue]);

  const redo = useCallback(async () => {
    const entry = redoHistoryRef.current.pop();
    if (!entry) return;

    setCanRedo(redoHistoryRef.current.length > 0);
    historyRef.current = [...historyRef.current, entry].slice(-MAX_UNDO_HISTORY);
    setCanUndo(true);

    pendingSaveRef.current = null;
    undoBaselineRef.current = null;
    lastLocalEditAtRef.current = Date.now();

    const remote = syncedDataRef.current;
    const restored =
      remote && !deepEqual(remote, entry.before) && !deepEqual(remote, entry.after)
        ? mergeAppData(entry.before, entry.after, remote)
        : entry.after;

    dataRef.current = restored;
    setData(restored);
    pendingSaveRef.current = restored;
    void flushSaveQueue();
  }, [flushSaveQueue]);

  return (
    <DataContext.Provider
      value={{ data, loading, saving, error, canUndo, canRedo, save, undo, redo, refresh }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
