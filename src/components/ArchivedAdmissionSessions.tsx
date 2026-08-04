"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AdmissionSession, AppData, ArchivedAdmissionMonth } from "@/lib/types";
import {
  formatDatePL,
  formatMonthLabel,
  parseMonthKey,
  plannedDischargeWorkingDaysNote,
} from "@/lib/date-utils";
import {
  getDoctorName,
  resolveSessionPlannedDischarge,
  searchArchivedAdmissionPatients,
} from "@/lib/admission-utils";
import { getPhysioName } from "@/lib/physio-utils";
import {
  resolveAdmissionTheme,
  resolveAdmissionThemeColors,
} from "@/lib/admission-themes";
import { adaptHtmlColorsForTheme, stripHtml } from "@/lib/text-format";
import { useTheme } from "@/context/ThemeContext";
import { sortAdmissionSlotsByHour } from "@/lib/admission-utils";
import {
  ADMISSION_TABLE_REM,
  FitWidthScale,
  tableRemPx,
} from "@/components/FitWidthScale";
import { Btn } from "@/components/ui";

const ADMISSION_TEXT = "text-[25px]";
const CELL_BORDER = "border border-black dark:border-slate-600";
const HEADER_TEXT = "font-bold text-black dark:text-slate-100";
const BODY_TEXT = "text-black dark:text-slate-100";

function ArchivedSessionTable({
  session,
  data,
  themeId,
  monthKeyValue,
  highlightSlotId,
}: {
  session: AdmissionSession;
  data: AppData;
  themeId?: string;
  monthKeyValue: string;
  highlightSlotId?: string | null;
}) {
  const { theme: colorMode } = useTheme();
  const { month } = parseMonthKey(monthKeyValue);
  const doctor = data.doctors.find((d) => d.id === session.doctorId);
  const resolvedTheme = resolveAdmissionTheme(doctor?.themeId ?? themeId, month);
  const colors = resolveAdmissionThemeColors(resolvedTheme, colorMode);
  const dischargeDate = resolveSessionPlannedDischarge(session);
  const dischargeWorkingDaysNote = plannedDischargeWorkingDaysNote(
    session.admissionDate,
    dischargeDate
  );
  const patients = useMemo(
    () => sortAdmissionSlotsByHour(session.patients),
    [session.patients]
  );
  const highlightRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (!highlightSlotId || !patients.some((slot) => slot.id === highlightSlotId)) return;
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightSlotId, patients]);

  function rowBackground(index: number, slotId: string): string {
    if (slotId === highlightSlotId) {
      return colorMode === "dark" ? "#1e3a8a" : "#bfdbfe";
    }
    return index % 2 === 0 ? colors.rowEven : colors.zebra;
  }

  return (
    <FitWidthScale contentWidthPx={tableRemPx(ADMISSION_TABLE_REM)}>
      <div
        className="admission-table-wrap max-w-none overflow-hidden rounded-sm shadow-md ring-1 ring-black/20 dark:ring-slate-600/50"
        style={{ width: `${ADMISSION_TABLE_REM}rem` }}
      >
      <div
        className={`${CELL_BORDER} border-b px-4 py-3`}
        style={{ backgroundColor: colors.panel }}
      >
        <div className={ADMISSION_TEXT}>
          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
            Lekarz prowadzący
          </span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {getDoctorName(data, session.doctorId) || "—"}
          </span>
        </div>
      </div>

        <table className={`admission-table w-full border-collapse ${ADMISSION_TEXT}`}>
          <thead>
            <tr>
              <th
                className={`w-44 ${CELL_BORDER} px-2 py-2.5 text-center ${HEADER_TEXT}`}
                style={{ backgroundColor: colors.header }}
              >
                Daty
              </th>
              <th
                className={`w-12 ${CELL_BORDER} px-2 py-2.5 text-center ${HEADER_TEXT}`}
                style={{ backgroundColor: colors.header }}
              >
                Lp.
              </th>
              <th
                className={`w-28 ${CELL_BORDER} px-3 py-2.5 text-left ${HEADER_TEXT}`}
                style={{ backgroundColor: colors.header }}
              >
                Godzina
              </th>
              <th
                className={`${CELL_BORDER} px-3 py-2.5 text-center ${HEADER_TEXT}`}
                style={{ backgroundColor: colors.header }}
              >
                Pacjent
              </th>
              <th
                className={`w-56 ${CELL_BORDER} px-3 py-2.5 text-left ${HEADER_TEXT}`}
                style={{ backgroundColor: colors.header }}
              >
                Fizjoterapeuta
              </th>
            </tr>
          </thead>
          <tbody>
            {patients.map((slot, index) => {
              const bg = rowBackground(index, slot.id);
              const name = stripHtml(slot.patientName).trim();
              const admitted = slot.admissionStatus === "admitted";
              const disqualified = slot.admissionStatus === "disqualified";
              const isHighlighted = slot.id === highlightSlotId;

              return (
                <tr
                  key={slot.id}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={isHighlighted ? "ring-2 ring-inset ring-blue-500" : undefined}
                >
                  {index === 0 && (
                    <td
                      rowSpan={patients.length}
                      className={`${CELL_BORDER} px-2 py-2 align-middle ${BODY_TEXT}`}
                      style={{ backgroundColor: colors.rowEven }}
                    >
                      <div className="flex flex-col gap-3 text-center">
                        <div>
                          <span className="mb-1 block text-[23px] font-medium text-slate-700 dark:text-slate-300">
                            Data przyjęcia
                          </span>
                          <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {formatDatePL(session.admissionDate) || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="mb-1 block text-[23px] font-medium text-slate-700 dark:text-slate-300">
                            Planowany wypis
                          </span>
                          <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {formatDatePL(dischargeDate) || "—"}
                          </span>
                          {dischargeWorkingDaysNote ? (
                            <span className="mt-1 block text-[21px] tabular-nums text-slate-600 dark:text-slate-400">
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
                    className={`${CELL_BORDER} px-3 py-2 align-middle tabular-nums ${BODY_TEXT}`}
                    style={{ backgroundColor: bg }}
                  >
                    {slot.admissionHour || "—"}
                  </td>
                  <td
                    className={`${CELL_BORDER} px-3 py-2 align-middle ${BODY_TEXT} ${
                      disqualified ? "opacity-60" : ""
                    }`}
                    style={{ backgroundColor: bg }}
                  >
                    <div className="flex justify-center">
                      {admitted && name ? (
                        <span className="inline-block max-w-full rounded-md bg-green-600 px-1.5 py-0.5 text-center font-bold text-white dark:bg-green-700">
                          <span
                            dangerouslySetInnerHTML={{
                              __html: adaptHtmlColorsForTheme(slot.patientName, colorMode),
                            }}
                          />
                        </span>
                      ) : (
                        <span
                          className={`text-center ${disqualified ? "line-through" : ""}`}
                          dangerouslySetInnerHTML={{
                            __html: adaptHtmlColorsForTheme(
                              slot.patientName || "—",
                              colorMode
                            ),
                          }}
                        />
                      )}
                    </div>
                  </td>
                  <td
                    className={`${CELL_BORDER} px-3 py-2 align-middle ${BODY_TEXT}`}
                    style={{ backgroundColor: bg }}
                  >
                    {getPhysioName(data, slot.physiotherapistId) || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </FitWidthScale>
  );
}

export function ArchivedAdmissionMonthPanel({
  entry,
  data,
  open,
  onToggle,
  highlightSlotId,
}: {
  entry: ArchivedAdmissionMonth;
  data: AppData;
  open: boolean;
  onToggle: () => void;
  highlightSlotId?: string | null;
}) {
  const sessions = orderSessions(entry.sessions);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/80"
      >
        <span className="text-[19px] font-semibold text-slate-800 dark:text-slate-100">
          {formatMonthLabel(entry.monthKey)}
        </span>
        <span className="text-[19px] text-slate-500 dark:text-slate-400">
          {sessions.length} {sessions.length === 1 ? "przyjęcie" : "przyjęć"} ·{" "}
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-200 px-4 py-4 dark:border-slate-700">
          {sessions.length === 0 ? (
            <p className="text-center text-[19px] text-slate-400">Brak tabel w tym miesiącu</p>
          ) : (
            sessions.map((session) => (
              <ArchivedSessionTable
                key={session.id}
                session={session}
                data={data}
                themeId={entry.themeId}
                monthKeyValue={entry.monthKey}
                highlightSlotId={highlightSlotId}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function orderSessions(sessions: AdmissionSession[]): AdmissionSession[] {
  return [...sessions].sort((a, b) => {
    const da = a.admissionDate || "";
    const db = b.admissionDate || "";
    if (da && db && da !== db) return da.localeCompare(db);
    if (da && !db) return -1;
    if (!da && db) return 1;
    return 0;
  });
}

const SEARCH_INPUT_CLASS =
  "w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-[19px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";

export function ArchivedAdmissionPatientSearch({
  archive,
  data,
  onShowPatient,
}: {
  archive: ArchivedAdmissionMonth[];
  data: AppData;
  onShowPatient: (monthKey: string, sessionId: string, slotId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const hits = useMemo(
    () => searchArchivedAdmissionPatients(archive, query),
    [archive, query]
  );
  const trimmedQuery = query.trim();

  return (
    <div className="space-y-4">
      <label className="block space-y-2">
        <span className="text-[19px] text-slate-700 dark:text-slate-300">
          Imię i nazwisko
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="np. Kowalski Jan"
          className={SEARCH_INPUT_CLASS}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      {trimmedQuery.length === 0 ? (
        <p className="text-[17px] text-slate-500 dark:text-slate-400">
          Wpisz imię, nazwisko lub oba — przeszukamy całe archiwum przyjęć.
        </p>
      ) : hits.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-[19px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Brak wyników dla „{trimmedQuery}”.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <p className="border-b border-slate-200 px-4 py-2 text-[17px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {hits.length} {hits.length === 1 ? "wynik" : hits.length < 5 ? "wyniki" : "wyników"}
          </p>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {hits.map((hit) => {
              const patientName = stripHtml(hit.slot.patientName).trim();
              const disqualified = hit.slot.admissionStatus === "disqualified";
              return (
                <li
                  key={`${hit.monthKey}-${hit.session.id}-${hit.slot.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p
                      className={`text-[19px] font-semibold text-slate-900 dark:text-slate-100 ${
                        disqualified ? "line-through opacity-60" : ""
                      }`}
                    >
                      {patientName}
                      {disqualified ? (
                        <span className="ml-2 text-[15px] font-medium text-slate-500 dark:text-slate-400">
                          (dyskwalifikacja)
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[17px] text-slate-600 dark:text-slate-400">
                      {formatMonthLabel(hit.monthKey)} · przyjęcie{" "}
                      {formatDatePL(hit.session.admissionDate) || "—"}
                      {hit.slot.admissionHour ? ` · ${hit.slot.admissionHour}` : ""}
                    </p>
                    <p className="text-[16px] text-slate-500 dark:text-slate-500">
                      {getDoctorName(data, hit.session.doctorId) || "—"}
                      {" · "}
                      {getPhysioName(data, hit.slot.physiotherapistId) || "—"}
                    </p>
                  </div>
                  <Btn
                    variant="secondary"
                    onClick={() =>
                      onShowPatient(hit.monthKey, hit.session.id, hit.slot.id)
                    }
                  >
                    Pokaż miesiąc
                  </Btn>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
