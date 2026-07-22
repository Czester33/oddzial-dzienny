"use client";

import { Suspense, useEffect, useState, useMemo, useRef, useLayoutEffect, useCallback, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useData } from "@/context/DataContext";
import type { AdmissionSession, AdmissionSlot, AppData, Doctor } from "@/lib/types";
import {
  LoadingState,
  ErrorBanner,
  Card,
  Btn,
  Input,
} from "@/components/ui";
import { DatePickerCell } from "@/components/DatePickerCell";
import { TimePickerCell } from "@/components/TimePickerCell";
import { FormattedEditor } from "@/components/FormattedEditor";
import { PhysioSelect } from "@/components/PhysioSelect";
import { FitWidthScale, tableRemPx } from "@/components/FitWidthScale";
import {
  currentMonthKey,
  getPlannedDischargeDate,
  todayIsoDate,
  parseMonthKey,
  toDateInputValue,
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
} from "@/lib/admission-utils";
import { placePatientInFreeSlot, clearPatientSlot } from "@/lib/physio-utils";
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
  if (admitted) {
    const name = stripHtml(value).trim();
    return (
      <div className="flex justify-center pr-[5.75rem]">
        <span
          className={`inline-block max-w-full rounded-md bg-green-600 px-1.5 py-0.5 text-center font-bold leading-snug text-white dark:bg-green-700 ${ADMISSION_TEXT} ${
            lineThrough ? "line-through" : ""
          }`}
          style={{ fontSize: ADMISSION_FONT_PX }}
        >
          {name}
        </span>
      </div>
    );
  }

  return (
    <FormattedEditor
      value={value}
      onChange={onChange}
      placeholder="Imię i nazwisko pacjenta"
      fontSize={ADMISSION_FONT_PX}
      compact
      className={`w-full border-0 bg-transparent px-1 py-0.5 text-center ${ADMISSION_TEXT} leading-snug pr-[5.75rem] ${
        lineThrough ? "line-through" : ""
      } ${disabled ? "pointer-events-none opacity-70" : ""} focus:bg-white/60 dark:focus:bg-slate-700/60`}
    />
  );
}

function shortName(name: string): string {
  return name.split(" ")[0] || name;
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

export default function PrzyjeciaPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PrzyjeciaPageContent />
    </Suspense>
  );
}

function PrzyjeciaPageContent() {
  const { data, loading, error, save } = useData();
  const searchParams = useSearchParams();
  const dataRef = useRef(data);
  dataRef.current = data;
  const deepLinkHandledRef = useRef<string | null>(null);

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
  const [todayTick, setTodayTick] = useState(() => todayIsoDate());
  const userPickedMonthRef = useRef(false);

  const monthOptions = useMemo(() => {
    const base = admissionMonthOptions(todayTick, 14);
    const restored = data?.autoArchiveSkip?.admissions ?? [];
    return [...new Set([...restored, ...base])].sort();
  }, [todayTick, data?.autoArchiveSkip?.admissions]);

  const selectMonth = (key: string) => {
    userPickedMonthRef.current = true;
    setMonthKeyValue(key);
  };

  const rawSessions = data?.admissions[monthKeyValue] ?? [];
  const sessions = useMemo(
    () => orderAdmissionSessionsWithPastAtBottom(rawSessions, todayTick),
    [rawSessions, todayTick]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDoctorsPanelOpen(false);
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
    if (loading || !data || userPickedMonthRef.current) return;
    const preferred = preferredAdmissionMonthKey(data.admissions, todayTick);
    setMonthKeyValue((current) => (current === preferred ? current : preferred));
  }, [loading, data, todayTick]);

  useEffect(() => {
    if (loading || !data) return;
    const raw = data.admissions[monthKeyValue] ?? [];
    const ordered = orderAdmissionSessionsWithPastAtBottom(raw, todayTick);
    if (!admissionSessionsSameOrder(raw, ordered)) {
      save({
        ...data,
        admissions: { ...data.admissions, [monthKeyValue]: ordered },
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

    const timer = window.setTimeout(() => {
      const el = document.getElementById(
        slotId ? `admission-slot-${slotId}` : `admission-session-${sessionId}`
      );
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-4", "ring-blue-500", "ring-offset-2");
      window.setTimeout(() => {
        el.classList.remove("ring-4", "ring-blue-500", "ring-offset-2");
      }, 3500);
      deepLinkHandledRef.current = linkKey;
    }, 120);

    return () => window.clearTimeout(timer);
  }, [loading, data, searchParams, monthKeyValue, sessions]);

  useEffect(() => {
    if (loading || !data) return;
    const next = applyAutoArchiveAdmissions(data);
    if (hasAutoArchiveAdmissionChanges(data, next)) {
      save(next);
    }
  }, [loading, data, save]);

  if (loading || !data) return <LoadingState />;

  const { month: monthIndex } = parseMonthKey(monthKeyValue);

  const applySessionUpdate = (updated: AdmissionSession, patch: Partial<AppData> = {}) => {
    const next = { ...data.admissions };

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
    commitSave({ ...data, ...patch, admissions: next });
  };

  const replaceSession = (updated: AdmissionSession) => {
    applySessionUpdate(updated);
  };

  const admitSlot = (session: AdmissionSession, slotId: string) => {
    const slot = session.patients.find((s) => s.id === slotId);
    if (!slot) return;

    if (slot.admissionStatus === "admitted") {
      let currentPatients = data.currentPatients;
      if (slot.linkedPatientId && slot.physiotherapistId) {
        const list = currentPatients[slot.physiotherapistId] ?? [];
        currentPatients = {
          ...currentPatients,
          [slot.physiotherapistId]: clearPatientSlot(list, slot.linkedPatientId),
        };
      }

      applySessionUpdate(
        {
          ...session,
          patients: session.patients.map((s) =>
            s.id === slotId
              ? { ...s, admissionStatus: undefined, linkedPatientId: undefined }
              : s
          ),
        },
        { currentPatients }
      );
      return;
    }

    if (slot.admissionStatus) return;

    const name = stripHtml(slot.patientName).trim();
    const dischargeDate = resolveSessionPlannedDischarge(session);
    if (!name || !slot.physiotherapistId || !dischargeDate) return;

    const physioId = slot.physiotherapistId;
    const placed = placePatientInFreeSlot(
      data.currentPatients[physioId] ?? [],
      name,
      dischargeDate
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
        ...data.currentPatients,
        [physioId]: placed.patients,
      },
    });
  };

  const disqualifySlot = (session: AdmissionSession, slotId: string) => {
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

    let currentPatients = data.currentPatients;
    if (
      slot.admissionStatus === "admitted" &&
      slot.linkedPatientId &&
      slot.physiotherapistId
    ) {
      const list = currentPatients[slot.physiotherapistId] ?? [];
      currentPatients = {
        ...currentPatients,
        [slot.physiotherapistId]: clearPatientSlot(list, slot.linkedPatientId),
      };
    }

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
    commitSave({ ...data, admissions });
  };

  const saveMonthSessions = (list: AdmissionSession[]) => {
    saveAdmissions({
      ...data.admissions,
      [monthKeyValue]: orderAdmissionSessionsWithPastAtBottom(list, todayTick),
    });
  };

  const removeSession = (sessionId: string) => {
    saveMonthSessions(rawSessions.filter((s) => s.id !== sessionId));
  };

  const addSession = () => {
    saveMonthSessions([...rawSessions, createAdmissionSession()]);
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    });
  };

  const addDoctor = () => {
    save({
      ...data,
      doctors: [...data.doctors, createDoctor()],
    });
  };

  const updateDoctor = (doctor: Doctor) => {
    save({
      ...data,
      doctors: data.doctors.map((d) => (d.id === doctor.id ? doctor : d)),
    });
  };

  const deleteDoctor = (id: string) => {
    if (!confirm("Usunąć lekarza? Przypisane przyjęcia stracą powiązanie.")) return;
    commitSave({
      ...data,
      doctors: data.doctors.filter((d) => d.id !== id),
      admissions: Object.fromEntries(
        Object.entries(data.admissions).map(([key, list]) => [
          key,
          list.map((s) => (s.doctorId === id ? { ...s, doctorId: "" } : s)),
        ])
      ),
    });
  };

  const monthIndexInOptions = monthOptions.indexOf(monthKeyValue);
  const shiftMonth = (delta: number) => {
    const next = monthOptions[monthIndexInOptions + delta];
    if (next) selectMonth(next);
  };

  const monthRestoredFromArchive = (data.autoArchiveSkip?.admissions ?? []).includes(
    monthKeyValue
  );

  const archiveCurrentMonth = () => {
    if (!monthRestoredFromArchive) return;
    if (!confirm("Zarchiwizować ponownie ten miesiąc przyjęć?")) return;
    commitSave(archiveAdmissionMonth(data, monthKeyValue));
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
            <select
              value={monthKeyValue}
              onChange={(e) => selectMonth(e.target.value)}
              className={`rounded-md border border-slate-300 bg-white px-3 py-1.5 ${ADMISSION_TEXT} text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100`}
            >
              {monthOptions.map((key) => {
                const { year, month } = parseMonthKey(key);
                const months = [
                  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
                  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
                ];
                return (
                  <option key={key} value={key}>
                    {months[month]} {year}
                  </option>
                );
              })}
            </select>
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

        {sessions.length === 0 ? (
          <Card className={`px-6 py-12 text-center ${ADMISSION_TEXT} text-slate-500 dark:text-slate-400`}>
            Brak przyjęć w tym miesiącu. Kliknij „+ Przyjęcie” z lewej strony, aby dodać.
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <AdmissionSessionTable
                key={session.id}
                session={session}
                data={data}
                theme={resolveSessionAdmissionTheme(
                  data,
                  session,
                  monthKeyValue,
                  monthIndex
                )}
                onChange={replaceSession}
                onAdmitSlot={(slotId) => admitSlot(session, slotId)}
                onDisqualifySlot={(slotId) => disqualifySlot(session, slotId)}
                onDelete={() => removeSession(session.id)}
                onDoctorThemeChange={(doctorId, themeId) => {
                  const doctor = data.doctors.find((d) => d.id === doctorId);
                  if (doctor) updateDoctor({ ...doctor, themeId });
                }}
                monthKeyValue={monthKeyValue}
                monthIndex={monthIndex}
              />
            ))}
          </div>
        )}
      </div>

      <div className="fixed left-0 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2">
        <SideToolButton
          label="+ Przyjęcie"
          side="left"
          onClick={addSession}
        />
      </div>

      <div className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2">
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
  onDelete: (id: string) => void;
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
                <Input
                  value={doctor.name}
                  onChange={(name) => onUpdate({ ...doctor, name })}
                  placeholder="Imię i nazwisko lekarza"
                  fontSize={ADMISSION_FONT_PX}
                  className={ADMISSION_TEXT}
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
                  onClick={() => onDelete(doctor.id)}
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

function AdmissionSessionTable({
  session,
  data,
  theme,
  monthKeyValue,
  monthIndex,
  onChange,
  onAdmitSlot,
  onDisqualifySlot,
  onDelete,
  onDoctorThemeChange,
}: {
  session: AdmissionSession;
  data: AppData;
  theme: AdmissionTableTheme;
  monthKeyValue: string;
  monthIndex: number;
  onChange: (session: AdmissionSession) => void;
  onAdmitSlot: (slotId: string) => void;
  onDisqualifySlot: (slotId: string) => void;
  onDelete: () => void;
  onDoctorThemeChange: (doctorId: string, themeId: string) => void;
}) {
  const { theme: colorMode } = useTheme();
  const colors = resolveAdmissionThemeColors(theme, colorMode);
  const dischargeDate = resolveSessionPlannedDischarge(session);
  const doctor = data.doctors.find((d) => d.id === session.doctorId);
  const doctorThemeId = doctor?.themeId ?? "";

  const updateSession = (patch: Partial<AdmissionSession>) => {
    onChange({ ...session, ...patch });
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
    const slot = session.patients.find((p) => p.id === slotId);
    if (
      slot?.admissionStatus &&
      ("patientName" in patch || "physiotherapistId" in patch)
    ) {
      return;
    }

    let patients = session.patients.map((p) => (p.id === slotId ? { ...p, ...patch } : p));
    if ("admissionHour" in patch) {
      patients = sortAdmissionSlotsByHour(patients);
    }

    updateSession({ patients });
  };

  const patients = useMemo(
    () => sortAdmissionSlotsByHour(session.patients),
    [session.patients]
  );

  const addSlot = () => {
    updateSession({ patients: [...session.patients, createAdmissionSlot()] });
  };

  const removeSlot = (slotId: string) => {
    if (session.patients.length <= 1) return;
    updateSession({ patients: session.patients.filter((p) => p.id !== slotId) });
  };

  return (
    <FitWidthScale contentWidthPx={tableRemPx(58)}>
      <div
        id={`admission-session-${session.id}`}
        className="admission-table-wrap mx-auto w-[58rem] max-w-none overflow-hidden rounded-sm shadow-md ring-1 ring-black/20 dark:ring-slate-600/50"
      >
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
                  {d.name || "Bez nazwy"}
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
            <Btn variant="secondary" onClick={addSlot} className={ADMISSION_TEXT}>
              + Pacjent
            </Btn>
            <button
              type="button"
              onClick={onDelete}
              className={`${ADMISSION_TEXT} text-red-700 hover:underline dark:text-red-400`}
            >
              Usuń przyjęcie
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className={`admission-table w-full border-collapse ${ADMISSION_TEXT}`}>
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
                className={`duty-col-header w-48 ${CELL_BORDER} px-3 py-2.5 text-left ${HEADER_TEXT}`}
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
                      disabled={locked}
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
                      options={data.physiotherapists.map((p) => ({
                        value: p.id,
                        label: shortName(p.name),
                        color: p.color,
                        rowColor: p.rowColor,
                      }))}
                    />
                  </td>
                  <td
                    className={`${CELL_BORDER} px-3 py-2 text-center align-middle`}
                    style={{ backgroundColor: bg }}
                  >
                    <button
                      type="button"
                      onClick={() => removeSlot(slot.id)}
                      disabled={patients.length <= 1}
                      className={`${ADMISSION_TEXT} text-red-700 hover:underline disabled:opacity-30 dark:text-red-400`}
                    >
                      Usuń
                    </button>
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
