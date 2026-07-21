"use client";

import { useMemo } from "react";
import type { AdmissionSession, AppData, ArchivedAdmissionMonth } from "@/lib/types";
import {
  getPlannedDischargeDate,
  formatDatePL,
  formatMonthLabel,
  parseMonthKey,
} from "@/lib/date-utils";
import { getDoctorName } from "@/lib/admission-utils";
import { getPhysioName } from "@/lib/physio-utils";
import {
  resolveAdmissionTheme,
  resolveAdmissionThemeColors,
} from "@/lib/admission-themes";
import { adaptHtmlColorsForTheme, stripHtml } from "@/lib/text-format";
import { useTheme } from "@/context/ThemeContext";
import { sortAdmissionSlotsByHour } from "@/lib/admission-utils";
import { FitWidthScale } from "@/components/FitWidthScale";

const ADMISSION_TEXT = "text-[25px]";
const CELL_BORDER = "border border-black dark:border-slate-600";
const HEADER_TEXT = "font-bold text-black dark:text-slate-100";
const BODY_TEXT = "text-black dark:text-slate-100";

function ArchivedSessionTable({
  session,
  data,
  themeId,
  monthKeyValue,
}: {
  session: AdmissionSession;
  data: AppData;
  themeId?: string;
  monthKeyValue: string;
}) {
  const { theme: colorMode } = useTheme();
  const { month } = parseMonthKey(monthKeyValue);
  const doctor = data.doctors.find((d) => d.id === session.doctorId);
  const resolvedTheme = resolveAdmissionTheme(doctor?.themeId ?? themeId, month);
  const colors = resolveAdmissionThemeColors(resolvedTheme, colorMode);
  const dischargeDate = getPlannedDischargeDate(session.admissionDate);
  const patients = useMemo(
    () => sortAdmissionSlotsByHour(session.patients),
    [session.patients]
  );

  return (
    <FitWidthScale>
      <div className="admission-table-wrap w-[58rem] max-w-none overflow-hidden rounded-sm shadow-md ring-1 ring-black/20 dark:ring-slate-600/50">
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

      <div className="overflow-x-auto">
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
                className={`w-48 ${CELL_BORDER} px-3 py-2.5 text-left ${HEADER_TEXT}`}
                style={{ backgroundColor: colors.header }}
              >
                Fizjoterapeuta
              </th>
            </tr>
          </thead>
          <tbody>
            {patients.map((slot, index) => {
              const bg = index % 2 === 0 ? colors.rowEven : colors.zebra;
              const name = stripHtml(slot.patientName).trim();
              const admitted = slot.admissionStatus === "admitted";
              const disqualified = slot.admissionStatus === "disqualified";

              return (
                <tr key={slot.id}>
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
      </div>
    </FitWidthScale>
  );
}

export function ArchivedAdmissionMonthPanel({
  entry,
  data,
  open,
  onToggle,
}: {
  entry: ArchivedAdmissionMonth;
  data: AppData;
  open: boolean;
  onToggle: () => void;
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
