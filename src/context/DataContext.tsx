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
import { withRemovedPatientIds } from "@/lib/physio-utils";

const MAX_UNDO_HISTORY = 50;
const REMOTE_POLL_MS = 8_000;
/** Ignore silent remote refresh briefly after local edits so the UI does not jump. */
const LOCAL_EDIT_QUIET_MS = 12_000;
const PENDING_SAVE_RETRY_MS = 15_000;

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

export type SaveIssue = "network" | "conflict" | null;

interface DataContextValue {
  data: AppData | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  isOnline: boolean;
  lastSyncedAt: string | null;
  remoteUpdateAvailable: boolean;
  hasPendingSave: boolean;
  saveIssue: SaveIssue;
  save: (data: AppData) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
  applyRemoteUpdate: () => Promise<void>;
  retrySave: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return error instanceof TypeError;
}

function markSyncedNow(): string {
  return new Date().toISOString();
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [remoteUpdateAvailable, setRemoteUpdateAvailable] = useState(false);
  const [hasPendingSave, setHasPendingSave] = useState(false);
  const [saveIssue, setSaveIssue] = useState<SaveIssue>(null);

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
  const remotePendingRef = useRef<ApiDataResponse | null>(null);
  const flushSaveQueueRef = useRef<() => Promise<void>>(async () => {});

  const syncPendingFlag = useCallback(() => {
    setHasPendingSave(Boolean(pendingSaveRef.current));
  }, []);

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
    setLastSyncedAt(markSyncedNow());
    setRemoteUpdateAvailable(false);
    remotePendingRef.current = null;
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
          if (
            syncedDataRef.current &&
            dataRef.current &&
            !deepEqual(dataRef.current, syncedDataRef.current)
          ) {
            remotePendingRef.current = payload;
            setRemoteUpdateAvailable(true);
            return;
          }
        }

        const incoming = withRemovedPatientIds(
          payload.data,
          dataRef.current?.removedPatientIds
        );
        const droppedRevived =
          Object.values(incoming.currentPatients ?? {}).reduce((n, list) => n + list.length, 0) <
          Object.values(payload.data.currentPatients ?? {}).reduce((n, list) => n + list.length, 0);

        adoptServerState(incoming, payload.updatedAt);
        if (droppedRevived) {
          pendingSaveRef.current = incoming;
          syncPendingFlag();
          void flushSaveQueueRef.current();
        }
        if (!options?.silent) {
          clearHistory();
        }
      } catch (err) {
        if (!options?.silent) {
          setError(isNetworkError(err) ? "Brak połączenia z serwerem" : "Nie udało się wczytać danych");
        }
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [adoptServerState, clearHistory, syncPendingFlag]
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

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);

    const handleOnline = () => {
      updateOnline();
      setSaveIssue((issue) => (issue === "network" ? null : issue));
      if (pendingSaveRef.current) {
        void flushSaveQueueRef.current();
      }
    };

    const handleOffline = () => {
      updateOnline();
      if (pendingSaveRef.current) {
        setSaveIssue("network");
        setError("Brak połączenia — zmiany nie zostały zapisane.");
      }
    };

    updateOnline();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  /** Network write only — never overwrite newer optimistic UI. */
  const persist = useCallback(async (newData: AppData): Promise<PersistResult> => {
    setError(null);
    try {
      const originBase = undoBaselineRef.current ?? syncedDataRef.current;
      let attemptData = newData;
      let baseUpdatedAt = serverUpdatedAtRef.current;
      let remoteSnapshot = syncedDataRef.current;

      for (let attempt = 0; attempt < 5; attempt++) {
        if (pendingSaveRef.current) {
          const pending = pendingSaveRef.current;
          pendingSaveRef.current = null;
          syncPendingFlag();
          attemptData = originBase
            ? mergeAppData(originBase, pending, attemptData)
            : pending;
        }

        if (originBase && remoteSnapshot) {
          attemptData = mergeAppData(originBase, attemptData, remoteSnapshot);
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
          if (!originBase) {
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
          attemptData = mergeAppData(originBase, localIntent, conflict.data);
          remoteSnapshot = conflict.data;
          baseUpdatedAt = conflict.updatedAt;
          continue;
        }

        if (!res.ok) throw new Error("Błąd zapisu");

        const body = (await res.json()) as { ok: true; updatedAt: string };
        syncedDataRef.current = attemptData;
        serverUpdatedAtRef.current = body.updatedAt;
        setLastSyncedAt(markSyncedNow());
        setSaveIssue(null);
        setRemoteUpdateAvailable(false);
        remotePendingRef.current = null;

        if (!pendingSaveRef.current) {
          const ui = dataRef.current;
          if (!ui || deepEqual(ui, newData) || deepEqual(ui, attemptData)) {
            dataRef.current = attemptData;
            setData(attemptData);
          }
        }

        return { ok: true, updatedAt: body.updatedAt, data: attemptData };
      }

      setSaveIssue("conflict");
      setError("Konflikt zapisu — odśwież stronę i spróbuj ponownie");
      return { ok: false };
    } catch (err) {
      if (isNetworkError(err)) {
        setSaveIssue("network");
        setError("Brak połączenia — zmiany nie zostały zapisane.");
      } else {
        setSaveIssue(null);
        setError("Nie udało się zapisać danych");
      }
      return { ok: false };
    }
  }, [syncPendingFlag]);

  const recordUndoEntry = useCallback((before: AppData, after: AppData) => {
    if (deepEqual(before, after)) return;
    const hist = historyRef.current;
    const last = hist[hist.length - 1];
    if (last && deepEqual(last.before, before)) {
      hist[hist.length - 1] = { before, after };
    } else {
      hist.push({ before, after });
    }
    historyRef.current = hist.slice(-MAX_UNDO_HISTORY);
    setCanUndo(historyRef.current.length > 0);
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
        syncPendingFlag();

        const result = await persist(next);
        if (!result.ok) {
          if (result.conflict) {
            setSaveIssue("conflict");
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
            syncPendingFlag();
          }
          break;
        }

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
      syncPendingFlag();
      if (pendingSaveRef.current) {
        void flushSaveQueueRef.current();
      }
    }
  }, [clearHistory, persist, recordUndoEntry, syncPendingFlag]);

  flushSaveQueueRef.current = flushSaveQueue;

  useEffect(() => {
    if (!hasPendingSave || !isOnline || saving) return;
    const interval = setInterval(() => {
      if (pendingSaveRef.current && !saveInFlightRef.current) {
        void flushSaveQueue();
      }
    }, PENDING_SAVE_RETRY_MS);
    return () => clearInterval(interval);
  }, [flushSaveQueue, hasPendingSave, isOnline, saving]);

  const save = useCallback(
    async (newData: AppData) => {
      const current = dataRef.current;

      if (current) {
        if (!saveInFlightRef.current && !pendingSaveRef.current) {
          undoBaselineRef.current = current;
        } else if (!undoBaselineRef.current) {
          undoBaselineRef.current = current;
        }
      }

      const base = syncedDataRef.current ?? undoBaselineRef.current ?? current;
      const merged =
        current && base ? mergeAppData(base, newData, current) : newData;

      if (current && deepEqual(merged, current)) {
        return;
      }

      lastLocalEditAtRef.current = Date.now();
      dataRef.current = merged;
      setData(merged);

      if (!current) {
        pendingSaveRef.current = merged;
        syncPendingFlag();
        void flushSaveQueue();
        return;
      }

      const baseline = undoBaselineRef.current ?? current;
      recordUndoEntry(baseline, merged);

      pendingSaveRef.current = merged;
      syncPendingFlag();
      void flushSaveQueue();
    },
    [flushSaveQueue, recordUndoEntry, syncPendingFlag]
  );

  const applyRemoteUpdate = useCallback(async () => {
    const remote = remotePendingRef.current;
    const base = syncedDataRef.current;
    const local = dataRef.current;

    if (!remote || !base || !local) {
      await refresh();
      return;
    }

    const merged = mergeAppData(base, local, remote.data);
    setRemoteUpdateAvailable(false);
    remotePendingRef.current = null;
    await save(merged);
  }, [refresh, save]);

  const retrySave = useCallback(async () => {
    if (!pendingSaveRef.current) return;
    setSaveIssue(null);
    setError(null);
    await flushSaveQueue();
  }, [flushSaveQueue]);

  const undo = useCallback(async () => {
    const entry = historyRef.current.pop();
    if (!entry) return;

    setCanUndo(historyRef.current.length > 0);
    redoHistoryRef.current = [...redoHistoryRef.current, entry].slice(-MAX_UNDO_HISTORY);
    setCanRedo(true);

    pendingSaveRef.current = null;
    syncPendingFlag();
    undoBaselineRef.current = null;
    lastLocalEditAtRef.current = Date.now();

    const remote = syncedDataRef.current;
    const restored =
      remote && !deepEqual(remote, entry.after) && !deepEqual(remote, entry.before)
        ? mergeAppData(entry.after, entry.before, remote)
        : entry.before;

    dataRef.current = restored;
    setData(restored);
    pendingSaveRef.current = restored;
    syncPendingFlag();
    void flushSaveQueue();
  }, [flushSaveQueue, syncPendingFlag]);

  const redo = useCallback(async () => {
    const entry = redoHistoryRef.current.pop();
    if (!entry) return;

    setCanRedo(redoHistoryRef.current.length > 0);
    historyRef.current = [...historyRef.current, entry].slice(-MAX_UNDO_HISTORY);
    setCanUndo(true);

    pendingSaveRef.current = null;
    syncPendingFlag();
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
    syncPendingFlag();
    void flushSaveQueue();
  }, [flushSaveQueue, syncPendingFlag]);

  return (
    <DataContext.Provider
      value={{
        data,
        loading,
        saving,
        error,
        canUndo,
        canRedo,
        isOnline,
        lastSyncedAt,
        remoteUpdateAvailable,
        hasPendingSave,
        saveIssue,
        save,
        undo,
        redo,
        refresh,
        applyRemoteUpdate,
        retrySave,
      }}
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
