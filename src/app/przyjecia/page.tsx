"use client";

import { Suspense, useEffect, useState, useMemo, useRef, useLayoutEffect, useCallback, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useData } from "@/context/DataContext";
import { useConfirm } from "@/context/ConfirmContext";
import type { AdmissionSession, AdmissionSlot, AppData, Doctor } from "@/lib/types";
import {
  LoadingState,
  ErrorBanner,
  Card,
  Btn,
} from "@/components/ui";
import { DatePickerCell } from "@/components/DatePickerCell";
import { TimePickerCell } from "@/components/TimePickerCell";
import { FormattedEditor } from "@/components/FormattedEditor";
import { PhysioSelect } from "@/components/PhysioSelect";
import {
  ADMISSION_TABLE_REM,
  FitWidthScale,
  tableRemPx,
} from "@/components/FitWidthScale";
import {
  currentMonthKey,
  getPlannedDischargeDate,
  plannedDischargeWorkingDaysNote,
  todayIsoDate,
  parseMonthKey,
  toDateInputValue,
  formatMonthLabel,
  nextMonthKey as monthKeyAfter,
} from "@/lib/date-utils";
import {
  createAdmissionSession,
  createAdmissionSlot,
  createDoctor,
  applyAutoArchiveAdmissions,
  archiveAdmissionMonth,
  hasAutoArchiveAdmissionChanges,
  orderAdmissionSessionsWithPastAtBottom,
  admissionSessionsSameOrder,
  sortAdmissionSlotsByHour,
  admissionMonthOptions,
  preferredAdmissionMonthKey,
  resolveSessionPlannedDischarge,
  moveAdmissionSessionToMonth,
  DEFAULT_ADMISSION_MONTH_COUNT,
} from "@/lib/admission-utils";
import {
  placePatientInFreeSlot,
  clearPatientSlot,
  findPhysioIdForPatient,
  physioPlanningDisplayLabel,
  physioPlanningOptionLabel,
  physioShortName,
  physiosForPlanningSelect,
} from "@/lib/physio-utils";
import { isPhysioOnVacationOnDate } from "@/lib/vacation-utils";
import { shouldShowAdmissionDutyBadge } from "@/lib/duty-utils";
import { stripHtml } from "@/lib/text-format";
import {
  ADMISSION_TABLE_THEMES,
  resolveAdmissionTheme,
  resolveAdmissionThemeColors,
  resolveSessionAdmissionTheme,
  type AdmissionTableTheme,
} from "@/lib/admission-themes";
import { applyAdmissionChangeAnnouncements } from "@/lib/admission-announcement-utils";
import { useTheme } from "@/context/ThemeContext";

const ADMISSION_TEXT = "text-[25px]";
const ADMISSION_TEXT_SM = "text-[23px]";
const ADMISSION_FONT_PX = 25;

const FIELD_BOX =
  "rounded-md border border-black/20 px-2 py-0.5 dark:border-slate-600";
const FIELD_SELECT =
  `min-w-[14rem] rounded-md border border-black/20 bg-white/90 px-3 py-1.5 ${ADMISSION_TEXT} text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100`;
const CELL_BORDER = "border border-black dark:border-slate-600";
const HEADER_TEXT = "font-bold text-black dark:text-slate-100";
const BODY_TEXT = "text-black dark:text-slate-100";

const ADMISSION_CELL_INPUT =
  `w-full border-0 bg-transparent px-1 py-0.5 text-center ${ADMISSION_TEXT} leading-snug focus:bg-white/60 dark:focus:bg-slate-700/60`;

function splitAdmissionPatientLines(html: string): { name: string; note: string } {
  const text = html ?? "";
  const breakRe = /<br\s*\/?>|<\/div>\s*<div[^>]*>|<\/p>\s*<p[^>]*>/i;
  const match = text.match(breakRe);
  if (!match || match.index == null) return { name: text, note: "" };
  return {
    name: text.slice(0, match.index),
    note: text.slice(match.index + match[0].length),
  };
}

function joinAdmissionPatientLines(name: string, note: string): string {
  const rest = note.replace(/^<br\s*\/?>/i, "").trim();
  if (!rest) return name;
  return `${name}<br>${note.replace(/^<br\s*\/?>/i, "")}`;
}

function AdmissionPatientCell({
  value,
  onChange,
  disabled,
  lineThrough,
  admitted,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  lineThrough?: boolean;
  admitted?: boolean;
}) {
  const { name, note } = splitAdmissionPatientLines(value);

  if (admitted) {
    return (
      <div
        className={`pr-[5.75rem] text-center ${disabled ? "pointer-events-none opacity-70" : ""}`}
      >
        <div className="flex justify-center">
          <div
            className={`inline-block w-fit max-w-full rounded-md bg-green-600 px-1.5 py-0.5 text-center font-bold leading-snug text-white dark:bg-green-700 ${ADMISSION_TEXT} ${
              lineThrough ? "line-through" : ""
            }`}
            style={{ fontSize: ADMISSION_FONT_PX }}
          >
            <FormattedEditor
              value={name}
              onChange={(nextName) => onChange(joinAdmissionPatientLines(nextName, note))}
              fontSize={ADMISSION_FONT_PX}
              compact
              color="#ffffff"
              className="border-0 bg-transparent px-0 py-0 text-center font-bold leading-snug text-white"
            />
          </div>
        </div>
        <FormattedEditor
          value={note}
          onChange={(nextNote) => onChange(joinAdmissionPatientLines(name, nextNote))}
          fontSize={ADMISSION_FONT_PX}
          compact
          multiline
          className={`w-full border-0 bg-transparent px-1 py-0.5 text-center ${ADMISSION_TEXT} leading-snug focus:bg-white/60 dark:focus:bg-slate-700/60`}
        />
      </div>
    );
  }

  return (
    <FormattedEditor
      value={value}
      onChange={onChange}
      fontSize={ADMISSION_FONT_PX}
      compact
      className={`w-full border-0 bg-transparent px-1 py-0.5 text-center ${ADMISSION_TEXT} leading-snug pr-[5.75rem] ${
        lineThrough ? "line-through" : ""
      } ${disabled ? "pointer-events-none opacity-70" : ""} focus:bg-white/60 dark:focus:bg-slate-700/60`}
    />
  );
}

function shortName(name: string): string {
  return physioShortName(name);
}

/** Scroll using visual rect — needed when the target sits inside FitWidthScale transform. */
function scrollScaledElementIntoView(el: HTMLElement) {
  const stickyOffset = window.matchMedia("(max-width: 768px)").matches ? 130 : 24;
  const top = window.scrollY + el.getBoundingClientRect().top - stickyOffset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function SideToolButton({
  label,
  active,
  onClick,
  side = "right",
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  side?: "left" | "right";
}) {
  const rounded =
    side === "left"
      ? "rounded-r-lg border border-l-0"
      : "rounded-l-lg border border-r-0";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${rounded} px-2.5 py-3 ${ADMISSION_TEXT_SM} font-medium shadow-md transition-colors ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      }`}
      style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
    >
      {label}
    </button>
  );
}

function AdmissionTopToolButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-0 flex-1 rounded-md border px-3 py-2 ${ADMISSION_TEXT_SM} font-medium shadow-sm transition-colors ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

export default function PrzyjeciaPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PrzyjeciaPageContent />
    </Suspense>
  );
}

function PrzyjeciaPageContent() {
  const { data, loading, error, save } = useData();
  const askConfirm = useConfirm();
  const searchParams = useSearchParams();
  const dataRef = useRef(data);
  dataRef.current = data;
  const deepLinkHandledRef = useRef<string | null>(null);
  const scrollToSessionIdRef = useRef<string | null>(null);

  const commitSave = useCallback(
    (next: AppData) => {
      if (!dataRef.current) {
        save(next);
        return;
      }
      save(applyAdmissionChangeAnnouncements(dataRef.current, next));
    },
    [save]
  );
  const [monthKeyValue, setMonthKeyValue] = useState(currentMonthKey());
  const [doctorsPanelOpen, setDoctorsPanelOpen] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [todayTick, setTodayTick] = useState(() => todayIsoDate());
  const [manualMonths, setManualMonths] = useState<string[]>([]);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const monthMenuRef = useRef<HTMLDivElement>(null);
  const userPickedMonthRef = useRef(false);

  const monthOptions = useMemo(() => {
    const base = admissionMonthOptions(todayTick, DEFAULT_ADMISSION_MONTH_COUNT);
    const restored = new Set(data?.autoArchiveSkip?.admissions ?? []);
    const archived = new Set((data?.admissionArchive ?? []).map((m) => m.monthKey));
    const keys = new Set<string>();
    for (const key of base) {
      if (archived.has(key) && !restored.has(key)) continue;
      keys.add(key);
    }
    for (const key of manualMonths) {
      if (archived.has(key) && !restored.has(key)) continue;
      keys.add(key);
    }
    for (const key of restored) keys.add(key);
    // Keep months that already have planned sessions.
    for (const [key, sessions] of Object.entries(data?.admissions ?? {})) {
      if (!sessions?.length) continue;
      if (archived.has(key) && !restored.has(key)) continue;
      keys.add(key);
    }
    return [...keys].sort();
  }, [
    todayTick,
    manualMonths,
    data?.autoArchiveSkip?.admissions,
    data?.admissionArchive,
    data?.admissions,
  ]);

  const selectMonth = (key: string) => {
    userPickedMonthRef.current = true;
    setMonthKeyValue(key);
    setMonthMenuOpen(false);
  };

  const addNextVisibleMonth = () => {
    const last = monthOptions[monthOptions.length - 1] ?? todayTick.slice(0, 7);
    const next = monthKeyAfter(last);
    setManualMonths((prev) => (prev.includes(next) ? prev : [...prev, next]));
    selectMonth(next);
  };

  useEffect(() => {
    if (!monthMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!monthMenuRef.current?.contains(e.target as Node)) {
        setMonthMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMonthMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [monthMenuOpen]);

  const rawSessions = useMemo(
    () => data?.admissions[monthKeyValue] ?? [],
    [data?.admissions, monthKeyValue]
  );
  const sessions = useMemo(
    () => orderAdmissionSessionsWithPastAtBottom(rawSessions, todayTick),
    [rawSessions, todayTick]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDoctorsPanelOpen(false);
        setMoveMode(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = todayIsoDate();
      setTodayTick((current) => (current === next ? current : next));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (loading || !data) return;
    const archived = new Set((data.admissionArchive ?? []).map((m) => m.monthKey));
    const restored = new Set(data.autoArchiveSkip?.admissions ?? []);
    if (archived.has(monthKeyValue) && !restored.has(monthKeyValue)) {
      const fallback =
        monthOptions.find((key) => key >= todayTick.slice(0, 7)) ??
        monthOptions[monthOptions.length - 1] ??
        currentMonthKey();
      setMonthKeyValue(fallback);
    }
  }, [loading, data, monthKeyValue, monthOptions, todayTick]);

  useEffect(() => {
    if (loading || !data || userPickedMonthRef.current) return;
    const preferred = preferredAdmissionMonthKey(data.admissions, todayTick);
    setMonthKeyValue((current) => (current === preferred ? current : preferred));
  }, [loading, data, todayTick]);

  useEffect(() => {
    if (loading || !data) return;
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const raw = snapshot.admissions[monthKeyValue] ?? [];
    const ordered = orderAdmissionSessionsWithPastAtBottom(raw, todayTick);
    if (!admissionSessionsSameOrder(raw, ordered)) {
      save({
        ...snapshot,
        admissions: { ...snapshot.admissions, [monthKeyValue]: ordered },
      });
    }
  }, [loading, data, monthKeyValue, todayTick, save]);

  useEffect(() => {
    if (loading || !data) return;
    const month = searchParams.get("month");
    const sessionId = searchParams.get("session");
    const slotId = searchParams.get("slot");
    if (!month && !sessionId) return;

    const linkKey = `${month ?? ""}|${sessionId ?? ""}|${slotId ?? ""}`;
    if (deepLinkHandledRef.current === linkKey) return;

    if (month && month !== monthKeyValue) {
      selectMonth(month);
      return;
    }

    if (!sessionId) {
      deepLinkHandledRef.current = linkKey;
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;

    const tryFocus = () => {
      if (cancelled) return;
      const el = document.getElementById(
        slotId ? `admission-slot-${slotId}` : `admission-session-${sessionId}`
      );
      if (!el) {
        attempts += 1;
        if (attempts < maxAttempts) {
          window.setTimeout(tryFocus, 100);
          return;
        }
        deepLinkHandledRef.current = linkKey;
        return;
      }
      // FitWidthScale uses transform on phones — scrollIntoView misses the visual row.
      scrollScaledElementIntoView(el);
      el.classList.add("ring-4", "ring-blue-500", "ring-offset-2");
      window.setTimeout(() => {
        el.classList.remove("ring-4", "ring-blue-500", "ring-offset-2");
      }, 3500);
      deepLinkHandledRef.current = linkKey;
    };

    const timer = window.setTimeout(tryFocus, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loading, data, searchParams, monthKeyValue, sessions]);

  useEffect(() => {
    const sessionId = scrollToSessionIdRef.current;
    if (!sessionId || !sessions.some((s) => s.id === sessionId)) return;

    let cancelled = false;
    let attempts = 0;

    const tryScroll = () => {
      if (cancelled) return;
      const el = document.getElementById(`admission-session-${sessionId}`);
      if (!el) {
        attempts += 1;
        if (attempts < 20) window.setTimeout(tryScroll, 100);
        else scrollToSessionIdRef.current = null;
        return;
      }
      scrollScaledElementIntoView(el);
      scrollToSessionIdRef.current = null;
    };

    const timer = window.setTimeout(tryScroll, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sessions]);

  useEffect(() => {
    if (loading || !data) return;
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const next = applyAutoArchiveAdmissions(snapshot);
    if (hasAutoArchiveAdmissionChanges(snapshot, next)) {
      save(next);
    }
  }, [loading, data, save]);

  if (loading || !data) return <LoadingState />;

  const { month: monthIndex } = parseMonthKey(monthKeyValue);

  const applySessionUpdate = (updated: AdmissionSession, patch: Partial<AppData> = {}) => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const next = { ...snapshot.admissions };

    let sourceKey: string | null = null;
    let sourceIndex = -1;
    for (const key of Object.keys(next)) {
      const idx = (next[key] ?? []).findIndex((s) => s.id === updated.id);
      if (idx >= 0) {
        sourceKey = key;
        sourceIndex = idx;
        break;
      }
    }

    // Keep session in the month where it was created (date may be end of previous month)
    const targetKey = sourceKey ?? monthKeyValue;

    for (const key of Object.keys(next)) {
      next[key] = (next[key] ?? []).filter((s) => s.id !== updated.id);
    }

    const targetList = [...(next[targetKey] ?? [])];
    if (sourceIndex >= 0 && sourceKey === targetKey) {
      targetList.splice(sourceIndex, 0, updated);
    } else {
      targetList.push(updated);
    }

    next[targetKey] = orderAdmissionSessionsWithPastAtBottom(targetList, todayTick);
    commitSave({ ...snapshot, ...patch, admissions: next });
  };

  const findSessionInData = (
    snapshot: AppData,
    sessionId: string
  ): AdmissionSession | null => {
    for (const list of Object.values(snapshot.admissions ?? {})) {
      const found = (list ?? []).find((s) => s.id === sessionId);
      if (found) return found;
    }
    return null;
  };

  const patchSession = (sessionId: string, patch: Partial<AdmissionSession>) => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const latest = findSessionInData(snapshot, sessionId);
    if (!latest) return;
    applySessionUpdate({ ...latest, ...patch });
  };

  const patchSessionSlot = (
    sessionId: string,
    slotId: string,
    patch: Partial<AdmissionSlot>
  ) => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const latest = findSessionInData(snapshot, sessionId);
    if (!latest) return;
    const slot = latest.patients.find((p) => p.id === slotId);
    if (
      slot?.admissionStatus &&
      ("physiotherapistId" in patch || "substitutePhysiotherapistId" in patch)
    ) {
      return;
    }
    if (slot?.admissionStatus === "disqualified" && "patientName" in patch) {
      return;
    }

    let patients = latest.patients.map((p) => {
      if (p.id !== slotId) return p;
      const merged = { ...p, ...patch };
      if (
        "physiotherapistId" in patch &&
        patch.physiotherapistId !== p.physiotherapistId
      ) {
        delete merged.substitutePhysiotherapistId;
      }
      return merged;
    });
    if ("admissionHour" in patch) {
      patients = sortAdmissionSlotsByHour(patients);
    }
    applySessionUpdate({ ...latest, patients });
  };

  const addSessionPatient = (sessionId: string) => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const latest = findSessionInData(snapshot, sessionId);
    if (!latest) return;
    applySessionUpdate({
      ...latest,
      patients: [...latest.patients, createAdmissionSlot()],
    });
  };

  const removeSessionPatient = async (sessionId: string, slotId: string) => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const latest = findSessionInData(snapshot, sessionId);
    if (!latest || latest.patients.length <= 1) return;
    if (
      !(await askConfirm({
        title: "Usunąć pacjenta z listy?",
        message: "Wiersz zostanie usunięty z tego przyjęcia.",
        variant: "danger",
      }))
    ) {
      return;
    }
    applySessionUpdate({
      ...latest,
      patients: latest.patients.filter((p) => p.id !== slotId),
    });
  };

  const clearLinkedPatient = (
    slot: AdmissionSlot,
    admissionDate: string
  ): AppData["currentPatients"] => {
    const snapshot = dataRef.current;
    if (!snapshot) return {};
    if (!slot.linkedPatientId) return snapshot.currentPatients;
    const hostId =
      findPhysioIdForPatient(snapshot, slot.linkedPatientId) ||
      (slot.substitutePhysiotherapistId &&
      slot.physiotherapistId &&
      isPhysioOnVacationOnDate(snapshot, slot.physiotherapistId, admissionDate)
        ? slot.substitutePhysiotherapistId
        : slot.physiotherapistId);
    if (!hostId) return snapshot.currentPatients;
    const list = snapshot.currentPatients[hostId] ?? [];
    return {
      ...snapshot.currentPatients,
      [hostId]: clearPatientSlot(list, slot.linkedPatientId),
    };
  };

  const admitSlot = (sessionId: string, slotId: string) => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const session = findSessionInData(snapshot, sessionId);
    if (!session) return;
    const slot = session.patients.find((s) => s.id === slotId);
    if (!slot) return;

    if (slot.admissionStatus === "admitted") {
      applySessionUpdate(
        {
          ...session,
          patients: session.patients.map((s) =>
            s.id === slotId
              ? { ...s, admissionStatus: undefined, linkedPatientId: undefined }
              : s
          ),
        },
        { currentPatients: clearLinkedPatient(slot, session.admissionDate) }
      );
      return;
    }

    if (slot.admissionStatus) return;

    const name = stripHtml(slot.patientName).trim();
    const dischargeDate = resolveSessionPlannedDischarge(session);
    if (!name || !slot.physiotherapistId || !dischargeDate) return;

    const onVacation = isPhysioOnVacationOnDate(
      snapshot,
      slot.physiotherapistId,
      session.admissionDate
    );
    const substituteId = slot.substitutePhysiotherapistId ?? "";
    const targetPhysioId = onVacation && substituteId ? substituteId : slot.physiotherapistId;
    const ownerId =
      onVacation && substituteId && substituteId !== slot.physiotherapistId
        ? slot.physiotherapistId
        : undefined;

    const placed = placePatientInFreeSlot(
      snapshot.currentPatients[targetPhysioId] ?? [],
      name,
      dischargeDate,
      ownerId
    );

    const updatedSession: AdmissionSession = {
      ...session,
      patients: session.patients.map((s) =>
        s.id === slotId
          ? { ...s, admissionStatus: "admitted", linkedPatientId: placed.patientId }
          : s
      ),
    };

    applySessionUpdate(updatedSession, {
      currentPatients: {
        ...snapshot.currentPatients,
        [targetPhysioId]: placed.patients,
      },
    });
  };

  const assignSubstitute = (
    sessionId: string,
    slotId: string,
    substitutePhysiotherapistId: string
  ) => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const session = findSessionInData(snapshot, sessionId);
    if (!session) return;
    const slot = session.patients.find((s) => s.id === slotId);
    if (!slot || slot.admissionStatus) return;

    const substituteId = substitutePhysiotherapistId.trim();
    applySessionUpdate({
      ...session,
      patients: session.patients.map((s) => {
        if (s.id !== slotId) return s;
        if (!substituteId) {
          const { substitutePhysiotherapistId: _drop, ...rest } = s;
          return rest;
        }
        return { ...s, substitutePhysiotherapistId: substituteId };
      }),
    });
  };

  const disqualifySlot = (sessionId: string, slotId: string) => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const session = findSessionInData(snapshot, sessionId);
    if (!session) return;
    const slot = session.patients.find((s) => s.id === slotId);
    if (!slot) return;

    if (slot.admissionStatus === "disqualified") {
      applySessionUpdate({
        ...session,
        patients: session.patients.map((s) =>
          s.id === slotId
            ? { ...s, admissionStatus: undefined, linkedPatientId: undefined }
            : s
        ),
      });
      return;
    }

    const currentPatients =
      slot.admissionStatus === "admitted"
        ? clearLinkedPatient(slot, session.admissionDate)
        : snapshot.currentPatients;

    const updatedSession: AdmissionSession = {
      ...session,
      patients: session.patients.map((s) =>
        s.id === slotId
          ? { ...s, admissionStatus: "disqualified", linkedPatientId: undefined }
          : s
      ),
    };

    applySessionUpdate(updatedSession, { currentPatients });
  };

  const saveAdmissions = (admissions: AppData["admissions"]) => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    commitSave({ ...snapshot, admissions });
  };

  const saveMonthSessions = (list: AdmissionSession[]) => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    saveAdmissions({
      ...snapshot.admissions,
      [monthKeyValue]: orderAdmissionSessionsWithPastAtBottom(list, todayTick),
    });
  };

  const removeSession = async (sessionId: string) => {
    if (
      !(await askConfirm({
        title: "Usunąć przyjęcie?",
        message: "Całe przyjęcie wraz z listą pacjentów zostanie usunięte.",
        variant: "danger",
      }))
    ) {
      return;
    }
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const raw = snapshot.admissions[monthKeyValue] ?? [];
    saveMonthSessions(raw.filter((s) => s.id !== sessionId));
  };

  const moveSessionToMonth = (sessionId: string, targetMonthKey: string) => {
    if (targetMonthKey === monthKeyValue) return;
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const next = moveAdmissionSessionToMonth(
      snapshot,
      sessionId,
      monthKeyValue,
      targetMonthKey,
      todayTick
    );
    if (!next) return;
    commitSave(next);
  };

  const addSession = () => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    const session = createAdmissionSession();
    scrollToSessionIdRef.current = session.id;
    const raw = snapshot.admissions[monthKeyValue] ?? [];
    saveMonthSessions([...raw, session]);
  };

  const addDoctor = () => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    save({
      ...snapshot,
      doctors: [...snapshot.doctors, createDoctor()],
    });
  };

  const updateDoctor = (doctor: Doctor) => {
    const snapshot = dataRef.current;
    if (!snapshot) return;
    save({
      ...snapshot,
      doctors: snapshot.doctors.map((d) => (d.id === doctor.id ? doctor : d)),
    });
  };

  const deleteDoctor = async (id: string) => {
    if (
      !(await askConfirm({
        title: "Usunąć lekarza?",
        message: "Przypisane przyjęcia stracą powiązanie z tym lekarzem.",
        variant: "danger",
      }))
    ) {
      return;
    }
    const snapshot = dataRef.current;
    if (!snapshot) return;
    commitSave({
      ...snapshot,
      doctors: snapshot.doctors.filter((d) => d.id !== id),
      admissions: Object.fromEntries(
        Object.entries(snapshot.admissions).map(([key, list]) => [
          key,
          list.map((s) => (s.doctorId === id ? { ...s, doctorId: "" } : s)),
        ])
      ),
    });
  };

  const monthIndexInOptions = monthOptions.indexOf(monthKeyValue);
  const prevMonthKey = monthIndexInOptions > 0 ? monthOptions[monthIndexInOptions - 1] : null;
  const nextMonthKey =
    monthIndexInOptions >= 0 && monthIndexInOptions < monthOptions.length - 1
      ? monthOptions[monthIndexInOptions + 1]
      : null;
  const shiftMonth = (delta: number) => {
    const next = monthOptions[monthIndexInOptions + delta];
    if (next) selectMonth(next);
  };

  const monthRestoredFromArchive = (data.autoArchiveSkip?.admissions ?? []).includes(
    monthKeyValue
  );

  const archiveCurrentMonth = async () => {
    if (!monthRestoredFromArchive) return;
    if (
      !(await askConfirm({
        title: "Zarchiwizować ponownie?",
        message: "Ten miesiąc przyjęć zostanie przeniesiony z powrotem do archiwum.",
        confirmLabel: "Archiwizuj",
      }))
    ) {
      return;
    }
    const snapshot = dataRef.current;
    if (!snapshot) return;
    commitSave(archiveAdmissionMonth(snapshot, monthKeyValue));
    const nextMonth = monthOptions.find((key) => key !== monthKeyValue) ?? currentMonthKey();
    selectMonth(nextMonth);
  };

  return (
    <>
      <div className="space-y-6">
        <div className="relative mb-6">
          <h2 className={`${ADMISSION_TEXT} text-center font-semibold text-slate-800 dark:text-slate-100`}>
            Przyjęcia nowych pacjentów
          </h2>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:absolute sm:right-0 sm:top-0 sm:mt-0">
            {monthRestoredFromArchive ? (
              <Btn
                variant="secondary"
                onClick={archiveCurrentMonth}
                className={ADMISSION_TEXT}
              >
                Archiwizuj
              </Btn>
            ) : null}
            <Btn
              variant="secondary"
              onClick={() => shiftMonth(-1)}
              disabled={monthIndexInOptions <= 0}
              className={ADMISSION_TEXT}
            >
              ‹
            </Btn>
            <div ref={monthMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setMonthMenuOpen((open) => !open)}
                className={`inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 ${ADMISSION_TEXT} text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100`}
                aria-haspopup="listbox"
                aria-expanded={monthMenuOpen}
              >
                {formatMonthLabel(monthKeyValue)}
                <span aria-hidden className="text-slate-500 dark:text-slate-400">
                  ▾
                </span>
              </button>
              {monthMenuOpen ? (
                <div
                  role="listbox"
                  className="absolute left-1/2 z-30 mt-1 max-h-72 min-w-full -translate-x-1/2 overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
                >
                  {monthOptions.map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={key === monthKeyValue}
                      onClick={() => selectMonth(key)}
                      className={`block w-full whitespace-nowrap px-3 py-1.5 text-left ${ADMISSION_TEXT} ${
                        key === monthKeyValue
                          ? "bg-blue-600 text-white"
                          : "text-slate-900 hover:bg-blue-50 dark:text-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {formatMonthLabel(key)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={addNextVisibleMonth}
                    className={`block w-full border-t border-slate-200 px-3 py-1.5 text-left ${ADMISSION_TEXT} font-medium text-blue-700 hover:bg-blue-50 dark:border-slate-600 dark:text-blue-300 dark:hover:bg-slate-700`}
                  >
                    + Następny miesiąc
                  </button>
                </div>
              ) : null}
            </div>
            <Btn
              variant="secondary"
              onClick={() => shiftMonth(1)}
              disabled={monthIndexInOptions < 0 || monthIndexInOptions >= monthOptions.length - 1}
              className={ADMISSION_TEXT}
            >
              ›
            </Btn>
          </div>
        </div>
        {error && <ErrorBanner message={error} className={ADMISSION_TEXT} />}

        <div className="sticky top-0 z-40 -mx-3 mb-3 flex gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 md:hidden">
          <AdmissionTopToolButton label="+ Przyjęcie" onClick={addSession} />
          <AdmissionTopToolButton
            label="Lekarze"
            active={doctorsPanelOpen}
            onClick={() => setDoctorsPanelOpen((open) => !open)}
          />
        </div>

        {sessions.length === 0 ? (
          <Card className={`px-6 py-12 text-center ${ADMISSION_TEXT} text-slate-500 dark:text-slate-400`}>
            Brak przyjęć w tym miesiącu. Kliknij „+ Przyjęcie”, aby dodać.
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-center gap-1 overflow-visible sm:gap-2">
                {moveMode ? (
                  <button
                    type="button"
                    onClick={() => prevMonthKey && moveSessionToMonth(session.id, prevMonthKey)}
                    disabled={!prevMonthKey}
                    className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-3 text-[23px] leading-none text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    title="Przenieś do poprzedniego miesiąca"
                    aria-label="Przenieś do poprzedniego miesiąca"
                  >
                    ‹
                  </button>
                ) : null}
                <div className="min-w-0 flex-1 overflow-visible">
                  <AdmissionSessionTable
                    session={session}
                    data={data}
                    theme={resolveSessionAdmissionTheme(
                      data,
                      session,
                      monthKeyValue,
                      monthIndex
                    )}
                    onPatchSession={(patch) => patchSession(session.id, patch)}
                    onPatchSlot={(slotId, patch) =>
                      patchSessionSlot(session.id, slotId, patch)
                    }
                    onAddSlot={() => addSessionPatient(session.id)}
                    onRemoveSlot={(slotId) => void removeSessionPatient(session.id, slotId)}
                    onAdmitSlot={(slotId) => admitSlot(session.id, slotId)}
                    onAssignSubstitute={(slotId, substituteId) =>
                      assignSubstitute(session.id, slotId, substituteId)
                    }
                    onDisqualifySlot={(slotId) => disqualifySlot(session.id, slotId)}
                    onDelete={() => void removeSession(session.id)}
                    onDoctorThemeChange={(doctorId, themeId) => {
                      const snapshot = dataRef.current;
                      const doctor = snapshot?.doctors.find((d) => d.id === doctorId);
                      if (doctor) updateDoctor({ ...doctor, themeId });
                    }}
                    monthKeyValue={monthKeyValue}
                    monthIndex={monthIndex}
                  />
                </div>
                {moveMode ? (
                  <button
                    type="button"
                    onClick={() => nextMonthKey && moveSessionToMonth(session.id, nextMonthKey)}
                    disabled={!nextMonthKey}
                    className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-3 text-[23px] leading-none text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    title="Przenieś do następnego miesiąca"
                    aria-label="Przenieś do następnego miesiąca"
                  >
                    ›
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {sessions.length > 0 ? (
          <div className="flex justify-end pt-3 pb-1">
            <button
              type="button"
              onClick={() => setMoveMode((open) => !open)}
              title={moveMode ? "Gotowe przenoszenie" : "Przenieś tabele do innego miesiąca"}
              aria-label={moveMode ? "Gotowe przenoszenie" : "Przenieś tabele do innego miesiąca"}
              aria-pressed={moveMode}
              className={`rounded border px-1.5 py-1 font-mono text-[12px] leading-none tracking-tight shadow-sm transition-colors ${
                moveMode
                  ? "border-blue-500 bg-blue-600 text-white hover:bg-blue-500"
                  : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              &lt;-&gt;
            </button>
          </div>
        ) : null}
      </div>

      <div className="fixed left-0 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-2 md:flex">
        <SideToolButton
          label="+ Przyjęcie"
          side="left"
          onClick={addSession}
        />
      </div>

      <div className="fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-2 md:flex">
        <SideToolButton
          label="Lekarze"
          side="right"
          active={doctorsPanelOpen}
          onClick={() => setDoctorsPanelOpen((open) => !open)}
        />
      </div>

      {doctorsPanelOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/25"
            aria-label="Zamknij panel"
            onClick={() => setDoctorsPanelOpen(false)}
          />
          <aside
            className="fixed right-0 top-0 z-50 flex h-full w-[min(100vw,22rem)] flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
            role="dialog"
            aria-label="Lekarze"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h3 className={`${ADMISSION_TEXT} font-semibold text-slate-800 dark:text-slate-100`}>
                Lekarze
              </h3>
              <button
                type="button"
                onClick={() => setDoctorsPanelOpen(false)}
                className={`rounded-md px-2 py-1 ${ADMISSION_TEXT} text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800`}
                aria-label="Zamknij"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <DoctorsPanel
                doctors={data.doctors}
                monthIndex={monthIndex}
                onAdd={addDoctor}
                onUpdate={updateDoctor}
                onDelete={deleteDoctor}
              />
            </div>
          </aside>
        </>
      )}
    </>
  );
}

const THEME_PANEL_WIDTH = 200;
const THEME_PANEL_HEIGHT = 132;

function TableThemePicker({
  theme,
  selectedId,
  disabled,
  onSelect,
  title = "Zmień motyw tabeli",
}: {
  theme: AdmissionTableTheme;
  selectedId: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
  title?: string;
}) {
  const { theme: colorMode } = useTheme();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const preview = resolveAdmissionThemeColors(theme, colorMode);

  const updatePanelPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    let left = rect.right - THEME_PANEL_WIDTH;
    let top = rect.bottom + 4;

    if (left < 8) left = 8;
    if (left + THEME_PANEL_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - THEME_PANEL_WIDTH - 8;
    }
    if (top + THEME_PANEL_HEIGHT > window.innerHeight - 8) {
      top = rect.top - THEME_PANEL_HEIGHT - 4;
    }
    if (top < 8) top = 8;

    setPanelStyle({
      position: "fixed",
      left,
      top,
      width: THEME_PANEL_WIDTH,
      zIndex: 10000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePanelPosition, true);
    window.addEventListener("resize", updatePanelPosition);
    return () => {
      window.removeEventListener("scroll", updatePanelPosition, true);
      window.removeEventListener("resize", updatePanelPosition);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-black/20 bg-white/90 shadow-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800/90 dark:hover:bg-slate-700"
        aria-label="Zmień motyw tabeli"
        aria-expanded={open}
        title={disabled ? "Wybierz lekarza" : title}
      >
        <span
          className="h-7 w-7 rounded-full border-2 border-white shadow-sm dark:border-slate-500"
          style={{
            background: `linear-gradient(135deg, ${preview.header} 50%, ${preview.zebra} 50%)`,
          }}
        />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-600 dark:bg-slate-900"
          >
            <ThemeSwatches
              size="sm"
              selectedId={selectedId}
              onSelect={(id) => {
                onSelect(id);
                setOpen(false);
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}

function ThemeSwatches({
  selectedId,
  onSelect,
  size = "md",
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  size?: "sm" | "md";
}) {
  const dot = size === "sm" ? "h-7 w-7" : "h-10 w-10";
  const gap = size === "sm" ? "gap-1.5" : "gap-2";

  return (
    <div className={`grid grid-cols-5 ${gap}`}>
      {ADMISSION_TABLE_THEMES.map((theme) => {
        const active = selectedId === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => onSelect(theme.id)}
            className={`flex items-center justify-center rounded-lg p-1 transition-colors ${
              active
                ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900"
                : "hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            aria-label="Wybierz motyw"
            aria-pressed={active}
          >
            <span
              className={`${dot} rounded-full border-2 ${
                active ? "border-slate-800 dark:border-slate-200" : "border-white"
              } shadow-sm`}
              style={{
                background: `linear-gradient(135deg, ${theme.header} 50%, ${theme.zebra} 50%)`,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

function DoctorsPanel({
  doctors,
  monthIndex,
  onAdd,
  onUpdate,
  onDelete,
}: {
  doctors: Doctor[];
  monthIndex: number;
  onAdd: () => void;
  onUpdate: (doctor: Doctor) => void;
  onDelete: (id: string) => void | Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <p className={`${ADMISSION_TEXT} text-slate-600 dark:text-slate-400`}>
        Każde przyjęcie prowadzi jeden lekarz z tej listy. Motyw ustawia domyślne kolory jego
        tabel.
      </p>
      <Btn variant="secondary" onClick={onAdd} className={ADMISSION_TEXT}>
        + Dodaj lekarza
      </Btn>
      {doctors.length === 0 ? (
        <p className={`py-4 text-center ${ADMISSION_TEXT} text-slate-400 dark:text-slate-500`}>
          Brak lekarzy
        </p>
      ) : (
        <div className="space-y-3">
          {doctors.map((doctor) => {
            const theme = resolveAdmissionTheme(doctor.themeId, monthIndex);
            return (
              <div
                key={doctor.id}
                className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
              >
                <input
                  type="text"
                  value={stripHtml(doctor.name)}
                  onChange={(e) => onUpdate({ ...doctor, name: e.target.value })}
                  placeholder="Imię i nazwisko lekarza"
                  className={`w-full ${FIELD_SELECT}`}
                />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span
                    className={`${ADMISSION_TEXT_SM} font-medium text-slate-700 dark:text-slate-300`}
                  >
                    Domyślny motyw
                  </span>
                  <TableThemePicker
                    theme={theme}
                    selectedId={doctor.themeId ?? ""}
                    title="Zmień domyślny motyw lekarza"
                    onSelect={(themeId) => onUpdate({ ...doctor, themeId })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void onDelete(doctor.id)}
                  className={`mt-3 ${ADMISSION_TEXT} text-red-600 hover:underline dark:text-red-400`}
                >
                  Usuń
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const SUBSTITUTE_SIDE_REM = 15;

function AdmissionSessionTable({
  session,
  data,
  theme,
  monthKeyValue,
  monthIndex,
  onPatchSession,
  onPatchSlot,
  onAddSlot,
  onRemoveSlot,
  onAdmitSlot,
  onAssignSubstitute,
  onDisqualifySlot,
  onDelete,
  onDoctorThemeChange,
}: {
  session: AdmissionSession;
  data: AppData;
  theme: AdmissionTableTheme;
  monthKeyValue: string;
  monthIndex: number;
  onPatchSession: (patch: Partial<AdmissionSession>) => void;
  onPatchSlot: (slotId: string, patch: Partial<AdmissionSlot>) => void;
  onAddSlot: () => void;
  onRemoveSlot: (slotId: string) => void;
  onAdmitSlot: (slotId: string) => void;
  onAssignSubstitute: (slotId: string, substitutePhysiotherapistId: string) => void;
  onDisqualifySlot: (slotId: string) => void;
  onDelete: () => void | Promise<void>;
  onDoctorThemeChange: (doctorId: string, themeId: string) => void;
}) {
  const { theme: colorMode } = useTheme();
  const colors = resolveAdmissionThemeColors(theme, colorMode);
  const dischargeDate = resolveSessionPlannedDischarge(session);
  const dischargeWorkingDaysNote = plannedDischargeWorkingDaysNote(
    session.admissionDate,
    dischargeDate
  );
  const doctor = data.doctors.find((d) => d.id === session.doctorId);
  const doctorThemeId = doctor?.themeId ?? "";

  const updateSession = (patch: Partial<AdmissionSession>) => {
    onPatchSession(patch);
  };

  const setAdmissionDate = (admissionDate: string) => {
    const suggested = getPlannedDischargeDate(admissionDate);
    updateSession({
      admissionDate,
      plannedDischargeDate: suggested,
      plannedDischargeDateManual: false,
    });
  };

  const setPlannedDischargeDate = (plannedDischargeDate: string) => {
    const suggested = getPlannedDischargeDate(session.admissionDate);
    const iso = toDateInputValue(plannedDischargeDate);
    updateSession({
      plannedDischargeDate: iso,
      plannedDischargeDateManual: Boolean(iso) && iso !== suggested,
    });
  };

  const updateSlot = (slotId: string, patch: Partial<AdmissionSlot>) => {
    onPatchSlot(slotId, patch);
  };

  const patients = useMemo(
    () => sortAdmissionSlotsByHour(session.patients),
    [session.patients]
  );

  return (
    <FitWidthScale contentWidthPx={tableRemPx(ADMISSION_TABLE_REM)}>
      <div
        id={`admission-session-${session.id}`}
        className="relative mx-auto max-w-none"
        style={{ width: `${ADMISSION_TABLE_REM}rem` }}
      >
      <div className="admission-table-wrap overflow-visible rounded-sm shadow-md ring-1 ring-black/20 dark:ring-slate-600/50">
      <div
        className={`${CELL_BORDER} border-b px-4 py-3`}
        style={{ backgroundColor: colors.panel }}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <label className={`mb-1 block ${ADMISSION_TEXT} font-medium text-slate-800 dark:text-slate-200`}>
              Lekarz prowadzący
            </label>
            <select
              value={session.doctorId}
              onChange={(e) => updateSession({ doctorId: e.target.value })}
              className={FIELD_SELECT}
            >
              <option value="">— wybierz lekarza —</option>
              {data.doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {stripHtml(d.name).trim() || "Bez nazwy"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <TableThemePicker
              theme={theme}
              selectedId={
                doctorThemeId ||
                resolveAdmissionTheme(
                  data.admissionTableThemes?.[monthKeyValue],
                  monthIndex
                ).id
              }
              disabled={!session.doctorId}
              onSelect={(themeId) => onDoctorThemeChange(session.doctorId, themeId)}
            />
            <Btn variant="secondary" onClick={onAddSlot} className={ADMISSION_TEXT}>
              + Pacjent
            </Btn>
            <button
              type="button"
              onClick={() => void onDelete()}
              className={`${ADMISSION_TEXT} text-red-700 hover:underline dark:text-red-400`}
            >
              Usuń przyjęcie
            </button>
          </div>
        </div>
      </div>

        <table className={`admission-table w-full border-collapse overflow-visible ${ADMISSION_TEXT}`}>
          <thead>
            <tr>
              <th
                className={`duty-col-header w-44 ${CELL_BORDER} px-2 py-2.5 text-center ${HEADER_TEXT}`}
                style={{ backgroundColor: colors.header }}
              >
                Daty
              </th>
              <th
                className={`duty-col-header w-12 ${CELL_BORDER} px-2 py-2.5 text-center ${HEADER_TEXT}`}
                style={{ backgroundColor: colors.header }}
              >
                Lp.
              </th>
              <th
                className={`duty-col-header w-28 ${CELL_BORDER} px-3 py-2.5 text-left ${HEADER_TEXT}`}
                style={{ backgroundColor: colors.header }}
              >
                Godzina
              </th>
              <th
                className={`duty-col-header ${CELL_BORDER} px-3 py-2.5 text-center ${HEADER_TEXT}`}
                style={{ backgroundColor: colors.header }}
              >
                Pacjent
              </th>
              <th
                className={`duty-col-header w-56 ${CELL_BORDER} px-3 py-2.5 text-left ${HEADER_TEXT}`}
                style={{ backgroundColor: colors.header }}
              >
                Fizjoterapeuta
              </th>
              <th
                className={`duty-col-header w-16 ${CELL_BORDER} px-3 py-2.5`}
                style={{ backgroundColor: colors.header }}
              />
            </tr>
          </thead>
          <tbody>
            {patients.map((slot, index) => {
              const bg = index % 2 === 0 ? colors.rowEven : colors.zebra;
              const locked = Boolean(slot.admissionStatus);
              const name = stripHtml(slot.patientName).trim();
              const physioOnVacation = Boolean(
                slot.physiotherapistId &&
                  isPhysioOnVacationOnDate(
                    data,
                    slot.physiotherapistId,
                    session.admissionDate
                  )
              );
              const needsSubstitute =
                physioOnVacation && slot.admissionStatus !== "disqualified";
              const showDutyBadge = shouldShowAdmissionDutyBadge(
                data,
                slot.physiotherapistId,
                session.admissionDate,
                slot.admissionHour
              );
              const admitDisabled =
                slot.admissionStatus === "disqualified" ||
                (slot.admissionStatus !== "admitted" &&
                  !Boolean(name && slot.physiotherapistId && dischargeDate));
              return (
                <tr key={slot.id} id={`admission-slot-${slot.id}`}>
                  {index === 0 && (
                    <td
                      rowSpan={patients.length}
                      className={`${CELL_BORDER} px-2 py-2 align-middle ${BODY_TEXT}`}
                      style={{ backgroundColor: colors.rowEven }}
                    >
                      <div className="flex flex-col gap-3">
                        <div>
                          <span className={`mb-1 block text-center ${ADMISSION_TEXT_SM} font-medium text-slate-800 dark:text-slate-200`}>
                            Data przyjęcia
                          </span>
                          <div
                            className={FIELD_BOX}
                            style={{ backgroundColor: colors.zebra }}
                          >
                            <DatePickerCell
                              value={session.admissionDate}
                              onChange={setAdmissionDate}
                              title="Data przyjęcia"
                              textClassName={ADMISSION_TEXT}
                              defaultMonthKey={monthKeyValue}
                            />
                          </div>
                        </div>
                        <div>
                          <span className={`mb-1 block text-center ${ADMISSION_TEXT_SM} font-medium text-slate-800 dark:text-slate-200`}>
                            Planowany wypis
                          </span>
                          <div
                            className={FIELD_BOX}
                            style={{ backgroundColor: colors.zebra }}
                          >
                            <DatePickerCell
                              value={dischargeDate}
                              onChange={setPlannedDischargeDate}
                              title="Planowany wypis (sugerowane: 15 dni roboczych)"
                              textClassName={ADMISSION_TEXT}
                              defaultMonthKey={
                                toDateInputValue(dischargeDate)?.slice(0, 7) ||
                                monthKeyValue
                              }
                            />
                          </div>
                          {dischargeWorkingDaysNote ? (
                            <span
                              className={`mt-1 block text-center text-[21px] tabular-nums text-slate-600 dark:text-slate-400`}
                            >
                              {dischargeWorkingDaysNote}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  )}
                  <td
                    className={`${CELL_BORDER} px-2 py-2 text-center align-middle tabular-nums ${BODY_TEXT} ${HEADER_TEXT}`}
                    style={{ backgroundColor: bg }}
                  >
                    {index + 1}
                  </td>
                  <td
                    className={`${CELL_BORDER} px-3 py-2 align-middle ${BODY_TEXT}`}
                    style={{ backgroundColor: bg }}
                  >
                    <TimePickerCell
                      value={slot.admissionHour}
                      onChange={(admissionHour) => updateSlot(slot.id, { admissionHour })}
                      className={`${ADMISSION_CELL_INPUT} tabular-nums text-inherit focus:bg-black/10 dark:focus:bg-white/10`}
                    />
                  </td>
                  <td
                    className={`relative ${CELL_BORDER} px-3 py-2 align-middle ${BODY_TEXT} ${
                      slot.admissionStatus === "disqualified" ? "opacity-60" : ""
                    }`}
                    style={{ backgroundColor: bg }}
                  >
                    <AdmissionPatientCell
                      value={slot.patientName}
                      onChange={(patientName) => updateSlot(slot.id, { patientName })}
                      disabled={slot.admissionStatus === "disqualified"}
                      lineThrough={slot.admissionStatus === "disqualified"}
                      admitted={slot.admissionStatus === "admitted"}
                    />
                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onAdmitSlot(slot.id)}
                        disabled={admitDisabled}
                        title={
                          slot.admissionStatus === "admitted"
                            ? "Cofnij przyjęcie — usuń z obecnych pacjentów"
                            : "Przyjęty — dodaj do obecnych pacjentów"
                        }
                        aria-label={
                          slot.admissionStatus === "admitted" ? "Cofnij przyjęcie" : "Przyjęty"
                        }
                        aria-pressed={slot.admissionStatus === "admitted"}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded border ${ADMISSION_TEXT} font-bold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                          slot.admissionStatus === "admitted"
                            ? "border-green-800 bg-green-600 text-white shadow-md"
                            : "border-green-700 bg-white text-green-700 hover:bg-green-50 dark:border-green-500 dark:bg-slate-800 dark:text-green-400 dark:hover:bg-green-950/40"
                        }`}
                      >
                        {slot.admissionStatus === "admitted" ? "✓" : "+"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDisqualifySlot(slot.id)}
                        title={
                          slot.admissionStatus === "disqualified"
                            ? "Cofnij dyskwalifikację"
                            : "Dyskwalifikacja / nie stawił się"
                        }
                        aria-label={
                          slot.admissionStatus === "disqualified"
                            ? "Cofnij dyskwalifikację"
                            : "Dyskwalifikacja"
                        }
                        aria-pressed={slot.admissionStatus === "disqualified"}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded border ${ADMISSION_TEXT_SM} font-bold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                          slot.admissionStatus === "disqualified"
                            ? "border-red-800 bg-red-600 text-white shadow-md"
                            : "border-red-700 bg-white text-red-700 hover:bg-red-50 dark:border-red-500 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/40"
                        }`}
                      >
                        ×
                      </button>
                    </div>
                  </td>
                  <td
                    className={`${CELL_BORDER} px-3 py-2 align-middle ${BODY_TEXT} ${
                      locked ? "pointer-events-none opacity-70" : ""
                    }`}
                    style={{ backgroundColor: bg }}
                  >
                    <PhysioSelect
                      value={slot.physiotherapistId}
                      onChange={(physiotherapistId) =>
                        updateSlot(slot.id, { physiotherapistId })
                      }
                      className={`w-full cursor-pointer rounded-md border border-black/15 bg-white/90 px-2 py-1.5 ${ADMISSION_TEXT} outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800/90 dark:focus:border-blue-400`}
                      options={physiosForPlanningSelect(data).map((p) => ({
                        value: p.id,
                        label: physioPlanningOptionLabel(p, true),
                        displayLabel: physioPlanningDisplayLabel(p, true),
                        color: p.color,
                        rowColor: p.rowColor,
                      }))}
                    />
                    {physioOnVacation ? (
                      <p className="mt-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-center text-[18px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                        urlop
                      </p>
                    ) : null}
                    {showDutyBadge ? (
                      <p className="mt-1 rounded bg-yellow-400/30 px-1.5 py-0.5 text-center text-[18px] font-bold uppercase tracking-wide text-yellow-950 dark:bg-yellow-300/20 dark:text-yellow-200">
                        dyżur
                      </p>
                    ) : null}
                    {needsSubstitute ? (
                      <div
                        className={`mt-2 md:hidden ${
                          locked ? "pointer-events-none opacity-80" : ""
                        }`}
                      >
                        <PhysioSelect
                          value={slot.substitutePhysiotherapistId ?? ""}
                          onChange={(substituteId) =>
                            onAssignSubstitute(slot.id, substituteId)
                          }
                          emptyLabel="— zastępstwo —"
                          className={`w-full cursor-pointer rounded-md border border-amber-600/40 bg-slate-800/90 px-2 py-1.5 ${ADMISSION_TEXT} text-slate-200 outline-none focus:border-amber-500 dark:border-amber-500/45 dark:bg-slate-800/90`}
                          options={physiosForPlanningSelect(data)
                            .filter((p) => p.id !== slot.physiotherapistId)
                            .map((p) => ({
                              value: p.id,
                              label: physioPlanningOptionLabel(p, true),
                              displayLabel: physioPlanningDisplayLabel(p, true),
                              color: p.color,
                              rowColor: p.rowColor,
                            }))}
                        />
                      </div>
                    ) : null}
                  </td>
                  <td
                    className={`relative ${CELL_BORDER} px-3 py-2 text-center align-middle`}
                    style={{ backgroundColor: bg }}
                  >
                    <button
                      type="button"
                      onClick={() => onRemoveSlot(slot.id)}
                      disabled={patients.length <= 1}
                      className={`${ADMISSION_TEXT} text-red-700 hover:underline disabled:opacity-30 dark:text-red-400`}
                    >
                      Usuń
                    </button>
                    {needsSubstitute ? (
                      <div
                        className={`absolute inset-y-0 left-full z-10 hidden items-center border-y border-r border-l-[3px] border-black border-l-amber-500 px-2 dark:border-slate-600 dark:border-l-amber-400 md:flex ${
                          locked ? "pointer-events-none opacity-80" : ""
                        }`}
                        style={{
                          width: `${SUBSTITUTE_SIDE_REM}rem`,
                          backgroundColor: bg,
                        }}
                      >
                        <PhysioSelect
                          value={slot.substitutePhysiotherapistId ?? ""}
                          onChange={(substituteId) =>
                            onAssignSubstitute(slot.id, substituteId)
                          }
                          emptyLabel="— zastępstwo —"
                          className={`w-full cursor-pointer rounded-md border border-amber-600/40 bg-slate-800/90 px-2 py-1.5 ${ADMISSION_TEXT} text-slate-200 outline-none focus:border-amber-500 dark:border-amber-500/45 dark:bg-slate-800/90`}
                          options={physiosForPlanningSelect(data)
                            .filter((p) => p.id !== slot.physiotherapistId)
                            .map((p) => ({
                              value: p.id,
                              label: physioPlanningOptionLabel(p, true),
                              displayLabel: physioPlanningDisplayLabel(p, true),
                              color: p.color,
                              rowColor: p.rowColor,
                            }))}
                        />
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </FitWidthScale>
  );
}
