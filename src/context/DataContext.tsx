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
const REMOTE_POLL_MS = 5_000;

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
  save: (data: AppData) => Promise<void>;
  undo: () => Promise<void>;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  const dataRef = useRef<AppData | null>(null);
  const historyRef = useRef<UndoEntry[]>([]);
  const pendingSaveRef = useRef<AppData | null>(null);
  const saveInFlightRef = useRef(false);
  const undoBaselineRef = useRef<AppData | null>(null);
  /** Last known server revision this client synced from / wrote. */
  const serverUpdatedAtRef = useRef<string>("1970-01-01T00:00:00.000Z");
  /** AppData matching serverUpdatedAtRef (common ancestor for merges). */
  const syncedDataRef = useRef<AppData | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    setCanUndo(false);
  }, []);

  const adoptServerState = useCallback((next: AppData, updatedAt: string) => {
    syncedDataRef.current = next;
    serverUpdatedAtRef.current = updatedAt;
    setData(next);
    dataRef.current = next;
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

        // Support legacy raw AppData responses during rollout.
        const payload: ApiDataResponse =
          json && typeof json === "object" && "data" in json && "updatedAt" in json
            ? (json as ApiDataResponse)
            : { data: json as AppData, updatedAt: new Date().toISOString() };

        if (options?.silent && (saveInFlightRef.current || pendingSaveRef.current)) {
          return;
        }

        const remoteChanged = payload.updatedAt !== serverUpdatedAtRef.current;
        if (options?.silent && !remoteChanged) {
          return;
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

  // Keep multiple open clients in sync without relying only on announcements polling.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      if (saveInFlightRef.current || pendingSaveRef.current) return;
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

  const persist = useCallback(async (newData: AppData): Promise<PersistResult> => {
    setSaving(true);
    setError(null);
    try {
      let attemptData = newData;
      let baseUpdatedAt = serverUpdatedAtRef.current;
      let baseData = syncedDataRef.current;

      for (let attempt = 0; attempt < 5; attempt++) {
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
            // No ancestor — adopt remote and ask caller to retry later.
            syncedDataRef.current = conflict.data;
            serverUpdatedAtRef.current = conflict.updatedAt;
            return {
              ok: false,
              conflict: true,
              data: conflict.data,
              updatedAt: conflict.updatedAt,
            };
          }

          const merged = mergeAppData(baseData, attemptData, conflict.data);
          attemptData = merged;
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
        setData(attemptData);
        dataRef.current = attemptData;
        return { ok: true, updatedAt: body.updatedAt, data: attemptData };
      }

      setError("Konflikt zapisu — odśwież stronę i spróbuj ponownie");
      return { ok: false };
    } catch {
      setError("Nie udało się zapisać danych");
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, []);

  const flushSaveQueue = useCallback(async () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;

    try {
      while (pendingSaveRef.current) {
        const next = pendingSaveRef.current;
        pendingSaveRef.current = null;
        const baseline = undoBaselineRef.current;
        undoBaselineRef.current = null;

        const result = await persist(next);
        if (!result.ok) {
          if (result.conflict) {
            // Remote won a hard conflict without merge base — show server data.
            setData(result.data);
            dataRef.current = result.data;
            clearHistory();
            break;
          }
          if (!pendingSaveRef.current) {
            pendingSaveRef.current = next;
            undoBaselineRef.current = baseline;
          }
          break;
        }

        if (baseline && !deepEqual(baseline, result.data)) {
          historyRef.current = [
            ...historyRef.current,
            { before: baseline, after: result.data },
          ].slice(-MAX_UNDO_HISTORY);
          setCanUndo(historyRef.current.length > 0);
        }
      }
    } finally {
      saveInFlightRef.current = false;
      if (pendingSaveRef.current) {
        void flushSaveQueue();
      }
    }
  }, [clearHistory, persist]);

  const save = useCallback(
    async (newData: AppData) => {
      const current = dataRef.current;
      setData(newData);
      dataRef.current = newData;

      if (!pendingSaveRef.current && !saveInFlightRef.current && current) {
        undoBaselineRef.current = current;
      }
      pendingSaveRef.current = newData;
      await flushSaveQueue();
    },
    [flushSaveQueue]
  );

  const undo = useCallback(async () => {
    const entry = historyRef.current.pop();
    if (!entry) return;

    setCanUndo(historyRef.current.length > 0);
    pendingSaveRef.current = null;
    undoBaselineRef.current = null;

    // Merge undo target with latest server so other users' edits are kept.
    const base = entry.after;
    const local = entry.before;
    const remote = syncedDataRef.current ?? dataRef.current ?? entry.before;
    const restored = mergeAppData(base, local, remote);

    setData(restored);
    dataRef.current = restored;

    const result = await persist(restored);
    if (!result.ok) {
      historyRef.current.push(entry);
      setCanUndo(true);
      if (result.conflict) {
        setData(result.data);
        dataRef.current = result.data;
      }
    }
  }, [persist]);

  return (
    <DataContext.Provider value={{ data, loading, saving, error, canUndo, save, undo, refresh }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
