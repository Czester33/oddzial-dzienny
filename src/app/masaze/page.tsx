"use client";

import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { useData } from "@/context/DataContext";
import { useTheme } from "@/context/ThemeContext";
import type { AppData, MassagePatient, MassageWaiting } from "@/lib/types";
import { LoadingState, ErrorBanner, Input } from "@/components/ui";
import { DatePickerCell } from "@/components/DatePickerCell";
import { TimePickerCell } from "@/components/TimePickerCell";
import { FormattedEditor } from "@/components/FormattedEditor";
import { FloatingTodayCalendar } from "@/components/FloatingTodayCalendar";
import { FitWidthScale } from "@/components/FitWidthScale";
import { stripHtml, adaptHtmlColorsForTheme } from "@/lib/text-format";
import { formatDatePL } from "@/lib/date-utils";
import { resolvePhysioRowColor } from "@/lib/physio-utils";
import {
  applyMassageSync,
  formatFreePlacesLabel,
  getNearestFreeMassageSlots,
  hasMassageSyncChanges,
  MAX_MASSAGES_PER_DAY,
  sortMassagePatientsByHour,
} from "@/lib/massage-schedule";
import { applyVacationNotes, hasVacationNoteChanges } from "@/lib/vacation-utils";
import { applyDutyNotes, hasDutyNoteChanges } from "@/lib/duty-utils";
import { DEFAULT_FONT_SIZE } from "@/lib/text-format";

const MAX_ACTIVE = MAX_MASSAGES_PER_DAY;
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
const ACTIVE_COL_WIDTHS = [48, 520, 144, 144, 160] as const;
const TABLE_WIDTH = ACTIVE_COL_WIDTHS.reduce((sum, w) => sum + w, 0);
/** Waiting: same total width, with extra "dodaj" column */
const WAITING_COL_WIDTHS = [48, 448, 120, 120, 140, 140] as const;
const INPUT_CLASS_LIGHT =
  `w-full border-0 bg-transparent px-1 py-1 text-center ${MASSAGE_TABLE_TEXT} focus:bg-white/70`;
const INPUT_CLASS_DARK =
  `w-full border-0 bg-transparent px-1 py-1 text-center ${MASSAGE_TABLE_TEXT} text-slate-100 focus:bg-slate-800/80`;
const TIME_INPUT_CLASS = `w-full border-0 bg-transparent px-0.5 py-0.5 text-center ${MASSAGE_TABLE_TEXT} tabular-nums text-inherit focus:bg-black/10 focus:outline-none`;

function physioOptions(data: AppData) {
  return data.physiotherapists.map((p) => ({
    value: p.id,
    label: p.name.split(" ")[0] || p.name,
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
  options: { value: string; label: string; color: string; rowColor: string }[];
}) {
  const { theme } = useTheme();
  const selected = options.find((o) => o.value === value);
  const inputClass = theme === "dark" ? INPUT_CLASS_DARK : INPUT_CLASS_LIGHT;
  const bg = selected
    ? resolvePhysioRowColor(selected.color, selected.rowColor, theme)
    : undefined;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} cursor-pointer tabular-nums`}
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
  );
}

function displayActiveRows(active: MassagePatient[]): MassagePatient[] {
  if (active.length >= MAX_ACTIVE) return active.slice(0, MAX_ACTIVE);
  return [
    ...active,
    ...Array.from({ length: MAX_ACTIVE - active.length }, (_, i) => ({
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
}: {
  active: MassagePatient[];
  waiting: MassageWaiting[];
}) {
  const slots = getNearestFreeMassageSlots(active, waiting);

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

function MasazeContent({ data }: { data: AppData }) {
  const { error, save } = useData();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const ROW_BG = isDark ? ROW_BG_DARK : ROW_BG_LIGHT;
  const ROW_BG_ALT = isDark ? ROW_BG_DARK_ALT : ROW_BG_LIGHT_ALT;
  const CELL = isDark ? CELL_DARK : CELL_LIGHT;
  const TH = isDark ? TH_DARK : TH_LIGHT;
  const dataRef = useRef(data);
  const activeCountRef = useRef(data.massages.active.length);
  dataRef.current = data;

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
  const activeRows = displayActiveRows(sortedActive);
  const scheduleHours = massages.scheduleHours ?? "7:45-13:45";
  const headerNote = massages.headerNote ?? "";
  const hasHeaderNote = Boolean(stripHtml(headerNote));
  const headerNoteIsHtml = /<[a-z][\s\S]*>/i.test(headerNote);

  const updateMassages = (patch: Partial<typeof massages>) => {
    save({ ...data, massages: { ...massages, ...patch } });
  };

  const persistActive = (next: MassagePatient[], sort = true) => {
    const filled = next.filter((p) => isRowFilled(p));
    updateMassages({ active: sort ? sortMassagePatientsByHour(filled) : filled });
  };

  const updateActiveAt = (index: number, patient: MassagePatient, sort = true) => {
    let next = [...massages.active];

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

  const deleteActiveAt = (index: number) => {
    const patient = activeRows[index];
    if (!patient || patient.id.startsWith("empty-")) return;
    persistActive(massages.active.filter((p) => p.id !== patient.id));
  };

  const addWaiting = () => {
    const patient: MassageWaiting = {
      id: uuidv4(),
      name: "",
      startDate: "",
      lastTreatmentDate: "",
      physiotherapistId: "",
    };
    updateMassages({ waiting: [...massages.waiting, patient] });
  };

  const updateWaiting = (patient: MassageWaiting) => {
    updateMassages({
      waiting: massages.waiting.map((p) => (p.id === patient.id ? patient : p)),
    });
  };

  const deleteWaiting = (id: string) => {
    updateMassages({ waiting: massages.waiting.filter((p) => p.id !== id) });
  };

  const moveToActive = (waiting: MassageWaiting) => {
    if (massages.active.length >= MAX_ACTIVE) return;
    const active: MassagePatient = {
      id: uuidv4(),
      name: waiting.name,
      hour: "",
      lastTreatmentDate: waiting.lastTreatmentDate,
      physiotherapistId: waiting.physiotherapistId,
    };
    updateMassages({
      active: sortMassagePatientsByHour([...massages.active, active]),
      waiting: massages.waiting.filter((p) => p.id !== waiting.id),
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
        {headerNoteIsHtml ? (
          <div
            className="mx-auto mt-1 max-w-2xl text-center text-[19px] font-bold text-red-600 underline decoration-red-600 dark:text-red-400 dark:decoration-red-400"
            dangerouslySetInnerHTML={{
              __html: adaptHtmlColorsForTheme(headerNote, theme),
            }}
          />
        ) : (
          <Input
            value={headerNote}
            onChange={(headerNote) => updateMassages({ headerNote })}
            className={`mx-auto mt-1 max-w-2xl !border-0 !bg-transparent text-center text-[19px] focus:!ring-0 ${
              hasHeaderNote
                ? "font-bold text-red-600 underline decoration-red-600 dark:text-red-400 dark:decoration-red-400"
                : "text-slate-400"
            }`}
          />
        )}
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
                      key={`row-${index}`}
                      className="group/row"
                      style={{ backgroundColor: index % 2 === 0 ? ROW_BG : ROW_BG_ALT }}
                    >
                      <td className={`${CELL} text-center font-medium`}>
                        <div className="flex items-center justify-center gap-0.5">
                          <span>{index + 1}</span>
                          {isRowFilled(p) && !p.id.startsWith("empty-") && (
                            <button
                              type="button"
                              onClick={() => deleteActiveAt(index)}
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
                          onChange={(name) => updateActiveAt(index, { ...p, name }, false)}
                        />
                      </td>
                      <td className={CELL}>
                        <TimePickerCell
                          value={p.hour}
                          onChange={(hour) => updateActiveAt(index, { ...p, hour }, true)}
                          scheduleHours={scheduleHours}
                          className={TIME_INPUT_CLASS}
                        />
                      </td>
                      <td className={CELL}>
                        <DatePickerCell
                          value={p.lastTreatmentDate}
                          onChange={(lastTreatmentDate) =>
                            updateActiveAt(index, { ...p, lastTreatmentDate }, false)
                          }
                          title="Do kiedy"
                          textClassName={MASSAGE_TABLE_TEXT}
                        />
                      </td>
                      <td className={CELL}>
                        <PhysioSelect
                          value={p.physiotherapistId}
                          onChange={(physiotherapistId) =>
                            updateActiveAt(index, { ...p, physiotherapistId }, false)
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
          <div className="absolute left-full top-0 ml-4 hidden lg:block">
            <FreeMassageSlotsPanel active={sortedActive} waiting={massages.waiting} />
          </div>
        </div>
      </div>

      <p className="mb-2 mt-6 text-center text-[24px] font-bold italic underline">
        Lista oczekujących
      </p>

      <FitWidthScale className="mx-auto" contentWidthPx={TABLE_WIDTH}>
        <div className="border border-black bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900">
          <table
            className={`table-fixed border-collapse ${MASSAGE_TABLE_TEXT} ${
              isDark ? "text-slate-100" : "text-slate-900"
            }`}
            style={{ width: TABLE_WIDTH }}
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
                    colSpan={6}
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
                          onClick={() => deleteWaiting(p.id)}
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
                        disabled={massages.active.length >= MAX_ACTIVE}
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
