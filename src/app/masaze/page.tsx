"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useData } from "@/context/DataContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useTheme } from "@/context/ThemeContext";
import type { AppData, MassagePatient, MassageWaiting } from "@/lib/types";
import { LoadingState, ErrorBanner, Input, Btn } from "@/components/ui";
import { DatePickerCell } from "@/components/DatePickerCell";
import { TimePickerCell } from "@/components/TimePickerCell";
import { FormattedEditor } from "@/components/FormattedEditor";
import { FloatingTodayCalendar } from "@/components/FloatingTodayCalendar";
import { FitWidthScale } from "@/components/FitWidthScale";
import { stripHtml } from "@/lib/text-format";
import { formatDatePL, toDateInputValue } from "@/lib/date-utils";
import { resolvePhysioRowColor, physioPlanningDisplayLabel, physioPlanningOptionLabel, physiosForPlanningSelect } from "@/lib/physio-utils";
import {
  applyMassageSync,
  buildPlannedHourChange,
  clampMaxMassagesPerDay,
  formatFreePlacesLabel,
  formatPlannedHourChangeLabel,
  getNearestFreeMassageSlots,
  hasMassageSyncChanges,
  MAX_MAX_MASSAGES_PER_DAY,
  MIN_MAX_MASSAGES_PER_DAY,
  resolveMaxMassagesPerDay,
  plannedHourChangeTooltip,
  sortMassagePatientsByHour,
} from "@/lib/massage-schedule";
import { applyVacationNotes, hasVacationNoteChanges } from "@/lib/vacation-utils";
import { applyDutyNotes, hasDutyNoteChanges } from "@/lib/duty-utils";
import { DEFAULT_FONT_SIZE } from "@/lib/text-format";

/** Two font-size steps above app default (19 → 23 px). */
const MASSAGE_TABLE_FONT_PX = DEFAULT_FONT_SIZE + 4;
const MASSAGE_TABLE_TEXT = "text-[23px]";
const ROW_BG_LIGHT = "#ffc98a";
const ROW_BG_LIGHT_ALT = "#ffe6c4";
const ROW_BG_DARK = "#3d2a1f";
const ROW_BG_DARK_ALT = "#4a3426";
const CELL_LIGHT = "border border-black px-2 py-1.5";
const CELL_DARK = "border border-slate-600 px-2 py-1.5";
const TH_LIGHT = `${CELL_LIGHT} bg-[#ff8c2a] text-center font-bold text-slate-900 select-none`;
const TH_DARK = `${CELL_DARK} bg-[#7a4a2e] text-center font-bold text-amber-50 select-none`;
/** Active: lp + pacjent + godzina + do kiedy + od kogo */
const ACTIVE_COL_WIDTHS = [48, 520, 220, 144, 160] as const;
const TABLE_WIDTH = ACTIVE_COL_WIDTHS.reduce((sum, w) => sum + w, 0);
/** Waiting: lp + pacjent + godzina + od kiedy + do kiedy + od kogo + dodaj */
const WAITING_COL_WIDTHS = [48, 304, 220, 120, 120, 140, 140] as const;
const WAITING_TABLE_WIDTH = WAITING_COL_WIDTHS.reduce((sum, w) => sum + w, 0);
const INPUT_CLASS_LIGHT =
  `w-full border-0 bg-transparent px-1 py-1 text-center ${MASSAGE_TABLE_TEXT} focus:bg-white/70`;
const INPUT_CLASS_DARK =
  `w-full border-0 bg-transparent px-1 py-1 text-center ${MASSAGE_TABLE_TEXT} text-slate-100 focus:bg-slate-800/80`;
const TIME_INPUT_CLASS = `w-full border-0 bg-transparent px-0.5 py-0.5 text-center ${MASSAGE_TABLE_TEXT} tabular-nums text-inherit focus:bg-black/10 focus:outline-none`;
const PLANNED_HOUR_GLOW =
  "rounded shadow-[inset_0_0_8px_2px_rgba(250,204,21,0.75)] ring-2 ring-inset ring-yellow-400/70";
const PLANNED_HOUR_LABEL_CLASS = `${TIME_INPUT_CLASS} whitespace-nowrap px-1 tracking-tight`;

type HourChangeList = "active" | "waiting";

type HourChangeDialogState = {
  list: HourChangeList;
  patientId: string;
  patientName: string;
  currentHour: string;
  effectiveDate: string;
  newHour: string;
  hasExistingPlan: boolean;
};

function MassageHourCell({
  patient,
  scheduleHours,
  hourChangeMode,
  editable,
  onPlanClick,
  onHourChange,
}: {
  patient: { hour: string; plannedHourChange?: MassagePatient["plannedHourChange"] };
  scheduleHours: string;
  hourChangeMode: boolean;
  editable: boolean;
  onPlanClick: () => void;
  onHourChange: (hour: string) => void;
}) {
  const [editingCurrentHour, setEditingCurrentHour] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const label = formatPlannedHourChangeLabel(patient);
  const tooltip = plannedHourChangeTooltip(patient);
  const glowWrap = label ? PLANNED_HOUR_GLOW : "";

  useEffect(() => {
    if (!editingCurrentHour) return;
    const onPointerDown = (event: PointerEvent) => {
      if (cellRef.current?.contains(event.target as Node)) return;
      setEditingCurrentHour(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [editingCurrentHour]);

  if (hourChangeMode && editable) {
    return (
      <button
        type="button"
        onClick={onPlanClick}
        title={tooltip}
        className={`w-full cursor-pointer ${PLANNED_HOUR_LABEL_CLASS} ${glowWrap}`}
      >
        {label ?? (patient.hour || "—")}
      </button>
    );
  }

  if (label && !editingCurrentHour) {
    return (
      <button
        type="button"
        title={tooltip}
        onClick={() => setEditingCurrentHour(true)}
        className={`w-full cursor-text ${PLANNED_HOUR_LABEL_CLASS} ${glowWrap}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      ref={cellRef}
      title={tooltip}
      className={glowWrap}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setEditingCurrentHour(false);
        }
      }}
    >
      <TimePickerCell
        value={patient.hour}
        onChange={onHourChange}
        scheduleHours={scheduleHours}
        className={TIME_INPUT_CLASS}
        autoFocus={Boolean(label && editingCurrentHour)}
      />
    </div>
  );
}

function PlanHourChangeDialog({
  dialog,
  onClose,
  onSave,
  onRemove,
}: {
  dialog: HourChangeDialogState;
  onClose: () => void;
  onSave: (effectiveDate: string, newHour: string) => void;
  onRemove: () => void;
}) {
  const [effectiveDate, setEffectiveDate] = useState(dialog.effectiveDate);
  const [newHour, setNewHour] = useState(dialog.newHour);
  const canSave = Boolean(buildPlannedHourChange(toDateInputValue(effectiveDate) ?? "", newHour));

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/25"
        aria-label="Zamknij"
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-[min(100vw-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        role="dialog"
        aria-label="Zaplanuj zmianę godziny"
      >
        <h3 className="mb-1 text-[20px] font-semibold text-slate-800 dark:text-slate-100">
          Zaplanuj zmianę godziny
        </h3>
        <p className="mb-4 text-[16px] text-slate-600 dark:text-slate-400">{dialog.patientName}</p>
        <p className="mb-3 text-[15px] text-slate-500 dark:text-slate-500">
          Obecna godzina: <span className="font-medium tabular-nums">{dialog.currentHour || "—"}</span>
        </p>

        <label className="mb-3 block">
          <span className="mb-1 block text-[16px] font-medium text-slate-700 dark:text-slate-300">
            Od dnia
          </span>
          <div className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800">
            <DatePickerCell
              value={effectiveDate}
              onChange={setEffectiveDate}
              title="Od dnia"
              textClassName="text-[19px]"
            />
          </div>
        </label>

        <label className="mb-5 block">
          <span className="mb-1 block text-[16px] font-medium text-slate-700 dark:text-slate-300">
            Nowa godzina
          </span>
          <div className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800">
            <TimePickerCell value={newHour} onChange={setNewHour} className="text-[19px]" />
          </div>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Btn onClick={() => onSave(effectiveDate, newHour)} disabled={!canSave}>
            Zapisz
          </Btn>
          <Btn variant="secondary" onClick={onClose}>
            Anuluj
          </Btn>
          {dialog.hasExistingPlan && (
            <Btn variant="danger" onClick={onRemove} className="ml-auto">
              Usuń plan
            </Btn>
          )}
        </div>
      </div>
    </>
  );
}

function physioOptions(data: AppData) {
  return physiosForPlanningSelect(data).map((p) => ({
    value: p.id,
    label: physioPlanningOptionLabel(p, true),
    displayLabel: physioPlanningDisplayLabel(p, true),
    color: p.color,
    rowColor: p.rowColor,
  }));
}

function PhysioSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: {
    value: string;
    label: string;
    displayLabel?: string;
    color: string;
    rowColor: string;
  }[];
}) {
  const { theme } = useTheme();
  const selected = options.find((o) => o.value === value);
  const inputClass = theme === "dark" ? INPUT_CLASS_DARK : INPUT_CLASS_LIGHT;
  const bg = selected
    ? resolvePhysioRowColor(selected.color, selected.rowColor, theme)
    : undefined;
  const closedLabel = selected
    ? (selected.displayLabel ?? selected.label.replace(/ \(ukryty\)$/, ""))
    : "—";

  return (
    <div
      className={`relative ${inputClass}`}
      style={
        selected
          ? {
              backgroundColor: bg,
              color: theme === "dark" ? "#e2e8f0" : "#0f172a",
              fontWeight: 700,
            }
          : undefined
      }
    >
      <span
        className="pointer-events-none block truncate pr-5 text-center font-bold tabular-nums"
        aria-hidden="true"
      >
        {closedLabel}
      </span>
      <span
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] opacity-60"
        aria-hidden="true"
      >
        ▼
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            style={{
              backgroundColor: resolvePhysioRowColor(opt.color, opt.rowColor, theme),
              color: theme === "dark" ? "#e2e8f0" : "#0f172a",
            }}
          >
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function displayActiveRows(active: MassagePatient[], maxActive: number): MassagePatient[] {
  const targetRows = Math.max(maxActive, active.length);
  if (active.length >= targetRows) return active.slice(0, targetRows);
  return [
    ...active,
    ...Array.from({ length: targetRows - active.length }, (_, i) => ({
      id: `empty-${i}`,
      name: "",
      hour: "",
      lastTreatmentDate: "",
      physiotherapistId: "",
    })),
  ];
}

function isRowFilled(p: MassagePatient) {
  return Boolean(
    stripHtml(p.name).trim() ||
      p.hour.trim() ||
      p.lastTreatmentDate.trim() ||
      p.physiotherapistId
  );
}

function PatientNameCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <FormattedEditor
      value={value}
      onChange={onChange}
      multiline
      compact
      fontSize={MASSAGE_TABLE_FONT_PX}
      className={
        theme === "dark"
          ? `w-full border-0 bg-transparent px-1 py-1 text-center ${MASSAGE_TABLE_TEXT} leading-snug text-slate-100 focus:bg-slate-800/80`
          : `w-full border-0 bg-transparent px-1 py-1 text-center ${MASSAGE_TABLE_TEXT} leading-snug focus:bg-white/70`
      }
    />
  );
}

function FreeMassageSlotsPanel({
  active,
  waiting,
  todaySlotPeak,
  maxPerDay,
}: {
  active: MassagePatient[];
  waiting: MassageWaiting[];
  todaySlotPeak?: { date: string; count: number };
  maxPerDay: number;
}) {
  const slots = getNearestFreeMassageSlots(
    active,
    waiting,
    new Date(),
    maxPerDay,
    8,
    todaySlotPeak
  );

  return (
    <aside className="w-[300px] shrink-0 rounded-lg border border-black bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-900">
      <h3 className="mb-3 text-center text-[20px] font-bold leading-snug text-slate-800 dark:text-slate-100">
        Najbliższe wolne miejsca
      </h3>
      {slots.length === 0 ? (
        <p className="text-center text-[19px] text-slate-400 dark:text-slate-500">Brak wolnych terminów</p>
      ) : (
        <ul className="space-y-3">
          {slots.map(({ date, count }) => (
            <li
              key={date}
              className="rounded border border-[#ff8c2a]/70 bg-[#ffc98a]/70 px-3 py-2.5 text-center dark:border-[#7a4a2e]/80 dark:bg-[#3d2a1f]/80"
            >
              <div className="text-[20px] font-semibold tabular-nums text-slate-800 dark:text-amber-100">
                {formatDatePL(date)}
              </div>
              <div className="text-[16px] text-slate-600 dark:text-slate-400">{formatFreePlacesLabel(count)}</div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function ActiveMassageToolsPanel({
  hourChangeMode,
  onToggleHourChangeMode,
  active,
  waiting,
  todaySlotPeak,
  maxPerDay,
  onMaxPerDayChange,
}: {
  hourChangeMode: boolean;
  onToggleHourChangeMode: () => void;
  active: MassagePatient[];
  waiting: MassageWaiting[];
  todaySlotPeak?: { date: string; count: number };
  maxPerDay: number;
  onMaxPerDayChange: (maxPerDay: number) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Btn
          variant={hourChangeMode ? "primary" : "secondary"}
          onClick={onToggleHourChangeMode}
          className="w-full text-[16px]"
        >
          {hourChangeMode ? "Anuluj planowanie" : "Zaplanuj zmianę godziny"}
        </Btn>
        {hourChangeMode && (
          <p className="text-center text-[14px] leading-snug text-slate-500 dark:text-slate-400">
            Kliknij godzinę pacjenta, aby ustawić zmianę
          </p>
        )}
      </div>
      <FreeMassageSlotsPanel
        active={active}
        waiting={waiting}
        todaySlotPeak={todaySlotPeak}
        maxPerDay={maxPerDay}
      />
      <div className="flex justify-center px-2 opacity-60 transition-opacity hover:opacity-100">
        <div
          className="flex items-center gap-1.5 text-[12px] text-slate-400 dark:text-slate-500"
          title="Maksymalna liczba aktywnych masaży dziennie"
        >
          <span>Miejsc/dzień</span>
          <button
            type="button"
            onClick={() => onMaxPerDayChange(clampMaxMassagesPerDay(maxPerDay - 1))}
            disabled={maxPerDay <= MIN_MAX_MASSAGES_PER_DAY}
            className="min-w-[1.25rem] rounded px-1 py-0.5 disabled:opacity-30"
            aria-label="Mniej miejsc dziennie"
          >
            −
          </button>
          <span className="min-w-[1rem] text-center tabular-nums">{maxPerDay}</span>
          <button
            type="button"
            onClick={() => onMaxPerDayChange(clampMaxMassagesPerDay(maxPerDay + 1))}
            disabled={maxPerDay >= MAX_MAX_MASSAGES_PER_DAY}
            className="min-w-[1.25rem] rounded px-1 py-0.5 disabled:opacity-30"
            aria-label="Więcej miejsc dziennie"
          >
            +
          </button>
        </div>
      </div>
    </>
  );
}

function MasazeContent({ data }: { data: AppData }) {
  const { error, save } = useData();
  const askConfirm = useConfirm();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const ROW_BG = isDark ? ROW_BG_DARK : ROW_BG_LIGHT;
  const ROW_BG_ALT = isDark ? ROW_BG_DARK_ALT : ROW_BG_LIGHT_ALT;
  const CELL = isDark ? CELL_DARK : CELL_LIGHT;
  const TH = isDark ? TH_DARK : TH_LIGHT;
  const dataRef = useRef(data);
  const activeCountRef = useRef(data.massages.active.length);
  dataRef.current = data;
  const [hourChangeMode, setHourChangeMode] = useState(false);
  const [hourChangeDialog, setHourChangeDialog] = useState<HourChangeDialogState | null>(null);

  // Auto-clear finished actives and promote waiting when a slot frees.
  // Do not depend on waiting[] — editing the reservation form must not trigger promote.
  useEffect(() => {
    const sync = () => {
      const current = dataRef.current;
      let next = applyMassageSync(current);
      next = applyVacationNotes(next);
      next = applyDutyNotes(next);
      if (
        hasMassageSyncChanges(current, next) ||
        hasVacationNoteChanges(current, next) ||
        hasDutyNoteChanges(current, next)
      ) {
        save(next);
      }
    };

    sync();
    const interval = setInterval(sync, 30_000);
    return () => clearInterval(interval);
  }, [save]);

  useEffect(() => {
    const prev = activeCountRef.current;
    const nextCount = data.massages.active.length;
    activeCountRef.current = nextCount;

    if (nextCount >= prev) return;

    const current = dataRef.current;
    const next = applyMassageSync(current);
    if (hasMassageSyncChanges(current, next)) {
      save(next);
    }
  }, [data.massages.active.length, save]);

  const { massages } = data;
  const sortedActive = sortMassagePatientsByHour(massages.active);
  const scheduleHours = massages.scheduleHours ?? "7:45-13:45";
  const headerNote = massages.headerNote ?? "";
  const maxPerDay = resolveMaxMassagesPerDay(massages);
  const activeRows = displayActiveRows(sortedActive, maxPerDay);

  const updateMassages = (patch: Partial<typeof massages>) => {
    const current = dataRef.current;
    const next: AppData = {
      ...current,
      massages: { ...current.massages, ...patch },
    };
    dataRef.current = next;
    save(next);
  };

  const persistActive = (next: MassagePatient[], sort = true) => {
    const filled = next.filter((p) => isRowFilled(p));
    updateMassages({ active: sort ? sortMassagePatientsByHour(filled) : filled });
  };

  const updateActivePatient = (patient: MassagePatient, sort = false) => {
    const current = dataRef.current;
    const next = [...current.massages.active];

    if (patient.id.startsWith("empty-")) {
      if (!isRowFilled(patient)) return;
      next.push({ ...patient, id: uuidv4() });
    } else {
      const idx = next.findIndex((p) => p.id === patient.id);
      if (idx === -1) return;
      if (!isRowFilled(patient)) {
        next.splice(idx, 1);
      } else {
        next[idx] = patient;
      }
    }

    persistActive(next, sort);
  };

  const sortActiveRows = () => {
    persistActive(dataRef.current.massages.active, true);
  };

  const deleteActivePatient = async (id: string) => {
    if (id.startsWith("empty-")) return;
    if (
      !(await askConfirm({
        title: "Usunąć wiersz?",
        message: "Pacjent zostanie usunięty z listy aktywnych masaży.",
        variant: "danger",
      }))
    ) {
      return;
    }
    persistActive(dataRef.current.massages.active.filter((p) => p.id !== id), true);
  };

  const addWaiting = () => {
    const patient: MassageWaiting = {
      id: uuidv4(),
      name: "",
      hour: "",
      startDate: "",
      lastTreatmentDate: "",
      physiotherapistId: "",
    };
    updateMassages({ waiting: [...dataRef.current.massages.waiting, patient] });
  };

  const updateWaiting = (patient: MassageWaiting) => {
    updateMassages({
      waiting: dataRef.current.massages.waiting.map((p) => (p.id === patient.id ? patient : p)),
    });
  };

  const deleteWaiting = async (id: string) => {
    if (
      !(await askConfirm({
        title: "Usunąć z rezerwacji?",
        message: "Pacjent zostanie usunięty z listy oczekujących.",
        variant: "danger",
      }))
    ) {
      return;
    }
    updateMassages({ waiting: dataRef.current.massages.waiting.filter((p) => p.id !== id) });
  };

  const moveToActive = (waiting: MassageWaiting) => {
    const current = dataRef.current;
    const limit = resolveMaxMassagesPerDay(current.massages);
    if (current.massages.active.length >= limit) return;
    const active: MassagePatient = {
      id: uuidv4(),
      name: waiting.name,
      hour: waiting.hour ?? "",
      lastTreatmentDate: waiting.lastTreatmentDate,
      physiotherapistId: waiting.physiotherapistId,
      ...(waiting.plannedHourChange ? { plannedHourChange: waiting.plannedHourChange } : {}),
    };
    updateMassages({
      active: sortMassagePatientsByHour([...current.massages.active, active]),
      waiting: current.massages.waiting.filter((p) => p.id !== waiting.id),
    });
  };

  const openHourChangeDialog = (list: HourChangeList, patient: MassagePatient | MassageWaiting) => {
    const existing = patient.plannedHourChange;
    setHourChangeDialog({
      list,
      patientId: patient.id,
      patientName: stripHtml(patient.name).trim() || "Pacjent",
      currentHour: patient.hour ?? "",
      effectiveDate: existing?.effectiveDate ?? "",
      newHour: existing?.hour ?? patient.hour ?? "",
      hasExistingPlan: Boolean(existing),
    });
  };

  const saveHourChangePlan = (effectiveDate: string, newHour: string) => {
    if (!hourChangeDialog) return;
    const plannedHourChange = buildPlannedHourChange(
      toDateInputValue(effectiveDate) ?? "",
      newHour
    );
    if (!plannedHourChange) return;

    const { list, patientId } = hourChangeDialog;
    if (list === "active") {
      const patient = dataRef.current.massages.active.find((p) => p.id === patientId);
      if (!patient) return;
      updateActivePatient({ ...patient, plannedHourChange }, false);
    } else {
      const patient = dataRef.current.massages.waiting.find((p) => p.id === patientId);
      if (!patient) return;
      updateWaiting({ ...patient, plannedHourChange });
    }
    setHourChangeDialog(null);
  };

  const removeHourChangePlan = async () => {
    if (!hourChangeDialog) return;
    if (
      !(await askConfirm({
        title: "Usunąć plan?",
        message: "Zaplanowana zmiana godziny zostanie anulowana.",
        variant: "danger",
      }))
    ) {
      return;
    }
    const { list, patientId } = hourChangeDialog;
    if (list === "active") {
      const patient = dataRef.current.massages.active.find((p) => p.id === patientId);
      if (!patient) return;
      const next = { ...patient };
      delete next.plannedHourChange;
      updateActivePatient(next, false);
    } else {
      const patient = dataRef.current.massages.waiting.find((p) => p.id === patientId);
      if (!patient) return;
      const next = { ...patient };
      delete next.plannedHourChange;
      updateWaiting(next);
    }
    setHourChangeDialog(null);
  };

  const toggleHourChangeMode = () => {
    setHourChangeMode((mode) => {
      if (mode) setHourChangeDialog(null);
      return !mode;
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      {error && <ErrorBanner message={error} />}

      <div className="mb-3 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <h2 className="text-[22px] font-bold underline decoration-2">
            Masaż Krzysztof
          </h2>
          <Input
            value={scheduleHours}
            onChange={(scheduleHours) => updateMassages({ scheduleHours })}
            className="!w-auto min-w-[6rem] !border-0 !bg-transparent !p-0 text-center text-[19px] font-bold underline decoration-2 focus:!ring-0"
          />
          <span aria-hidden="true">💆</span>
        </div>
        <div className="mx-auto mt-1 max-w-2xl">
          <FormattedEditor
            value={headerNote}
            onChange={(headerNote) => updateMassages({ headerNote })}
            placeholder="Notatka (np. urlop)"
            fontSize={19}
            className={`border-0 bg-transparent px-1 py-0.5 text-center text-[19px] focus:outline-none ${
              isDark ? "text-slate-100" : "text-slate-900"
            }`}
          />
        </div>
      </div>

      <div className="relative flex justify-center">
        <div className="relative w-full max-w-full">
          <FitWidthScale contentWidthPx={TABLE_WIDTH}>
            <div className="border border-black bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900">
              <table
                className={`table-fixed border-collapse ${MASSAGE_TABLE_TEXT} ${
                  isDark ? "text-slate-100" : "text-slate-900"
                }`}
                style={{ width: TABLE_WIDTH }}
              >
                <colgroup>
                  {ACTIVE_COL_WIDTHS.map((width, i) => (
                    <col key={i} style={{ width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className={TH}>lp.</th>
                    <th className={TH}>Pacjent</th>
                    <th className={TH}>Godzina</th>
                    <th className={TH}>Do kiedy</th>
                    <th className={TH}>Od kogo</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map((p, index) => (
                    <tr
                      key={p.id.startsWith("empty-") ? `empty-${index}-${sortedActive.length}` : p.id}
                      className="group/row"
                      style={{ backgroundColor: index % 2 === 0 ? ROW_BG : ROW_BG_ALT }}
                    >
                      <td className={`${CELL} text-center font-medium`}>
                        <div className="flex items-center justify-center gap-0.5">
                          <span>{index + 1}</span>
                          {isRowFilled(p) && !p.id.startsWith("empty-") && (
                            <button
                              type="button"
                              onClick={() => void deleteActivePatient(p.id)}
                              className="text-red-600 opacity-0 transition-opacity hover:text-red-800 focus:opacity-100 group-hover/row:opacity-100 dark:text-red-400 dark:hover:text-red-300"
                              title="Usuń wiersz"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={CELL}>
                        <PatientNameCell
                          value={p.name}
                          onChange={(name) => updateActivePatient({ ...p, name }, false)}
                        />
                      </td>
                      <td className={CELL}>
                        <MassageHourCell
                          patient={p}
                          scheduleHours={scheduleHours}
                          hourChangeMode={hourChangeMode}
                          editable={isRowFilled(p) && !p.id.startsWith("empty-")}
                          onPlanClick={() => openHourChangeDialog("active", p)}
                          onHourChange={(hour) => updateActivePatient({ ...p, hour }, false)}
                        />
                      </td>
                      <td className={CELL}>
                        <DatePickerCell
                          value={p.lastTreatmentDate}
                          onChange={(lastTreatmentDate) =>
                            updateActivePatient({ ...p, lastTreatmentDate }, false)
                          }
                          onPickerClose={sortActiveRows}
                          title="Do kiedy"
                          textClassName={MASSAGE_TABLE_TEXT}
                        />
                      </td>
                      <td className={CELL}>
                        <PhysioSelect
                          value={p.physiotherapistId}
                          onChange={(physiotherapistId) =>
                            updateActivePatient({ ...p, physiotherapistId }, false)
                          }
                          options={physioOptions(data)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FitWidthScale>
          <div className="absolute left-full top-0 ml-4 hidden w-[300px] flex-col gap-3 lg:flex">
            <ActiveMassageToolsPanel
              hourChangeMode={hourChangeMode}
              onToggleHourChangeMode={toggleHourChangeMode}
              active={sortedActive}
              waiting={massages.waiting}
              todaySlotPeak={massages.todaySlotPeak}
              maxPerDay={maxPerDay}
              onMaxPerDayChange={(value) => updateMassages({ maxPerDay: value })}
            />
          </div>
          <div className="mx-auto mt-4 flex w-full max-w-[300px] flex-col gap-3 lg:hidden">
            <ActiveMassageToolsPanel
              hourChangeMode={hourChangeMode}
              onToggleHourChangeMode={toggleHourChangeMode}
              active={sortedActive}
              waiting={massages.waiting}
              todaySlotPeak={massages.todaySlotPeak}
              maxPerDay={maxPerDay}
              onMaxPerDayChange={(value) => updateMassages({ maxPerDay: value })}
            />
          </div>
        </div>
      </div>

      <p className="mb-2 mt-6 text-center text-[24px] font-bold italic underline">
        Lista oczekujących
      </p>

      <FitWidthScale className="mx-auto" contentWidthPx={WAITING_TABLE_WIDTH}>
        <div className="border border-black bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900">
          <table
            className={`table-fixed border-collapse ${MASSAGE_TABLE_TEXT} ${
              isDark ? "text-slate-100" : "text-slate-900"
            }`}
            style={{ width: WAITING_TABLE_WIDTH }}
          >
            <colgroup>
              {WAITING_COL_WIDTHS.map((width, i) => (
                <col key={i} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className={TH}>Lp.</th>
                <th className={TH}>Pacjent</th>
                <th className={TH}>Godzina</th>
                <th className={TH}>OD kiedy</th>
                <th className={TH}>Do kiedy</th>
                <th className={TH}>Od kogo</th>
                <th className={TH}>dodaj</th>
              </tr>
            </thead>
            <tbody>
              {massages.waiting.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className={`${CELL} py-4 text-center text-slate-400 dark:bg-slate-900 dark:text-slate-500`}
                  >
                    Brak oczekujących
                  </td>
                </tr>
              ) : (
                massages.waiting.map((p, index) => (
                  <tr key={p.id} className="group/row bg-white dark:bg-slate-900">
                    <td className={`${CELL} text-center font-medium`}>
                      <div className="flex items-center justify-center gap-0.5">
                        <span>{index + 1}</span>
                        <button
                          type="button"
                          onClick={() => void deleteWaiting(p.id)}
                          className="text-red-600 opacity-0 transition-opacity hover:text-red-800 focus:opacity-100 group-hover/row:opacity-100 dark:text-red-400 dark:hover:text-red-300"
                          title="Usuń"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                    <td className={CELL}>
                      <PatientNameCell
                        value={p.name}
                        onChange={(name) => updateWaiting({ ...p, name })}
                      />
                    </td>
                    <td className={CELL}>
                      <MassageHourCell
                        patient={p}
                        scheduleHours={scheduleHours}
                        hourChangeMode={hourChangeMode}
                        editable={Boolean(stripHtml(p.name).trim() || (p.hour ?? "").trim())}
                        onPlanClick={() => openHourChangeDialog("waiting", p)}
                        onHourChange={(hour) => updateWaiting({ ...p, hour })}
                      />
                    </td>
                    <td className={CELL}>
                      <DatePickerCell
                        value={p.startDate}
                        onChange={(startDate) => updateWaiting({ ...p, startDate })}
                        title="OD kiedy"
                        textClassName={MASSAGE_TABLE_TEXT}
                      />
                    </td>
                    <td className={CELL}>
                      <DatePickerCell
                        value={p.lastTreatmentDate}
                        onChange={(lastTreatmentDate) => updateWaiting({ ...p, lastTreatmentDate })}
                        title="Do kiedy"
                        textClassName={MASSAGE_TABLE_TEXT}
                      />
                    </td>
                    <td className={CELL}>
                      <PhysioSelect
                        value={p.physiotherapistId}
                        onChange={(physiotherapistId) => updateWaiting({ ...p, physiotherapistId })}
                        options={physioOptions(data)}
                      />
                    </td>
                    <td className={`${CELL} text-center`}>
                      <button
                        type="button"
                        onClick={() => moveToActive(p)}
                        disabled={massages.active.length >= maxPerDay}
                        className={`${MASSAGE_TABLE_TEXT} font-bold text-blue-700 hover:underline disabled:text-slate-400 dark:text-blue-400 dark:disabled:text-slate-500`}
                        title="Dodaj do aktywnych"
                      >
                        +
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="border-t border-black bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900">
            <button
              type="button"
              onClick={addWaiting}
              className={`${MASSAGE_TABLE_TEXT} font-medium text-slate-700 hover:underline dark:text-slate-300`}
            >
              + Dodaj oczekującego
            </button>
          </div>
        </div>
      </FitWidthScale>

      {hourChangeDialog && (
        <PlanHourChangeDialog
          dialog={hourChangeDialog}
          onClose={() => setHourChangeDialog(null)}
          onSave={saveHourChangePlan}
          onRemove={() => void removeHourChangePlan()}
        />
      )}
    </div>
  );
}

export default function MasazePage() {
  const { data, loading } = useData();

  if (loading || !data) return <LoadingState />;

  return (
    <>
      <MasazeContent data={data} />
      <FloatingTodayCalendar variant="peach" storageKey="masaze-floating-calendar" />
    </>
  );
}
