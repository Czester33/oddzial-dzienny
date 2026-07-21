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

const MAX_UNDO_HISTORY = 50;

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

function dataSnapshotEqual(a: AppData, b: AppData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const dataRef = useRef<AppData | null>(null);
  const historyRef = useRef<AppData[]>([]);
  const pendingSaveRef = useRef<AppData | null>(null);
  const saveInFlightRef = useRef(false);
  const undoBaselineRef = useRef<AppData | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    setCanUndo(false);
  }, []);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch("/api/data");
      if (!res.ok) throw new Error("Błąd wczytywania");
      const json = (await res.json()) as AppData;
      // Do not clobber in-flight local edits with a silent poll.
      if (options?.silent && (saveInFlightRef.current || pendingSaveRef.current)) {
        return;
      }
      setData(json);
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
  }, [clearHistory]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = useCallback(async (newData: AppData): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newData),
      });
      if (!res.ok) throw new Error("Błąd zapisu");
      return true;
    } catch {
      setError("Nie udało się zapisać danych");
      return false;
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

        const ok = await persist(next);
        if (!ok) {
          // Keep latest failed payload so a later save can retry with fresher data.
          if (!pendingSaveRef.current) {
            pendingSaveRef.current = next;
            undoBaselineRef.current = baseline;
          }
          break;
        }

        if (baseline && !dataSnapshotEqual(baseline, next)) {
          historyRef.current = [...historyRef.current, baseline].slice(-MAX_UNDO_HISTORY);
          setCanUndo(historyRef.current.length > 0);
        }
      }
    } finally {
      saveInFlightRef.current = false;
      if (pendingSaveRef.current) {
        void flushSaveQueue();
      }
    }
  }, [persist]);

  const save = useCallback(
    async (newData: AppData) => {
      const current = dataRef.current;
      // Optimistic UI update; queue serializes the actual disk write.
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
    const previous = historyRef.current.pop();
    if (!previous) return;

    setCanUndo(historyRef.current.length > 0);
    pendingSaveRef.current = null;
    undoBaselineRef.current = null;
    setData(previous);
    dataRef.current = previous;

    const ok = await persist(previous);
    if (!ok) {
      historyRef.current.push(previous);
      setCanUndo(true);
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
