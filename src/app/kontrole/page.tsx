"use client";

import { useMemo, useRef, Fragment } from "react";
import { useData } from "@/context/DataContext";
import { useTheme } from "@/context/ThemeContext";
import type { AppData } from "@/lib/types";
import { PageHeader, LoadingState, ErrorBanner, Card } from "@/components/ui";
import { DatePickerCell } from "@/components/DatePickerCell";
import { FormattedEditor } from "@/components/FormattedEditor";
import { groupCheckupPatientsByDoctor, withCheckupDate, withCheckupDoneFlag, withCheckupDoctor, withCheckupPatientName } from "@/lib/checkup-utils";
import {
  resolveAdmissionTheme,
  resolveAdmissionThemeColors,
} from "@/lib/admission-themes";
import { getPhysioById, physioDisplayName } from "@/lib/physio-utils";
import { formatDatePL, todayIsoDate } from "@/lib/date-utils";
import { stripHtml } from "@/lib/text-format";
import { FloatingTodayCalendar } from "@/components/FloatingTodayCalendar";
import { MobileCollapsible } from "@/components/MobileCollapsible";
import { TodayCalendar } from "@/components/TodayCalendar";

function KontroleContent({ data }: { data: AppData }) {
  const { error, save } = useData();
  const { theme: colorMode } = useTheme();
  const dataRef = useRef(data);
  dataRef.current = data;
  const monthIndex = new Date().getMonth();
  const groups = useMemo(() => groupCheckupPatientsByDoctor(data), [data]);

  const setCheckupDate = (physioId: string, patientId: string, date: string) => {
    const snapshot = dataRef.current;
    const list = snapshot.currentPatients[physioId] ?? [];
    const idx = list.findIndex((p) => p.id === patientId);
    if (idx < 0) return;
    const updated = [...list];
    updated[idx] = withCheckupDate(list[idx], date);
    save({
      ...snapshot,
      currentPatients: {
        ...snapshot.currentPatients,
        [physioId]: updated,
      },
    });
  };

  const setCheckupDone = (physioId: string, patientId: string, done: boolean) => {
    const snapshot = dataRef.current;
    const list = snapshot.currentPatients[physioId] ?? [];
    const idx = list.findIndex((p) => p.id === patientId);
    if (idx < 0) return;
    const updated = [...list];
    updated[idx] = withCheckupDoneFlag(list[idx], done);
    save({
      ...snapshot,
      currentPatients: {
        ...snapshot.currentPatients,
        [physioId]: updated,
      },
    });
  };

  const setPatientName = (physioId: string, patientId: string, name: string) => {
    const snapshot = dataRef.current;
    save(withCheckupPatientName(snapshot, physioId, patientId, name));
  };

  const setCheckupDoctor = (physioId: string, patientId: string, doctorId: string) => {
    if (!doctorId) return;
    const snapshot = dataRef.current;
    save(withCheckupDoctor(snapshot, physioId, patientId, doctorId));
  };

  const setDoctorName = (doctorId: string, name: string) => {
    const snapshot = dataRef.current;
    save({
      ...snapshot,
      doctors: snapshot.doctors.map((d) => (d.id === doctorId ? { ...d, name } : d)),
    });
  };

  return (
    <div>
      <PageHeader title="Kontrole" />
      {error && <ErrorBanner message={error} />}

      <div className="mb-4">
        <MobileCollapsible summary={`Kalendarz · ${formatDatePL(todayIsoDate())}`}>
          <TodayCalendar variant="slate" className="mx-auto" />
        </MobileCollapsible>
      </div>

      {groups.length === 0 ? (
        <Card className="px-6 py-12 text-center text-[19px] text-slate-500 dark:text-slate-400">
          Brak przyjętych pacjentów na liście obecnych.
        </Card>
      ) : (
        <div className="columns-1 gap-4 md:columns-2">
          {groups.map((group) => {
            const doctor = data.doctors.find((d) => d.id === group.doctorId);
            const theme = resolveAdmissionTheme(doctor?.themeId, monthIndex);
            const colors = resolveAdmissionThemeColors(theme, colorMode);

            return (
              <div
                key={group.doctorId || "no-doctor"}
                className="mb-4 w-full break-inside-avoid overflow-hidden rounded-sm shadow-md ring-1 ring-black/20 dark:ring-slate-600/50"
              >
                <div
                  className="border-b border-black px-2 py-1.5 text-[17px] font-semibold text-black dark:border-slate-600 dark:text-slate-100"
                  style={{ backgroundColor: colors.panel }}
                >
                  {doctor ? (
                    <FormattedEditor
                      value={(doctor.name ?? "").replace(/ +$/g, (spaces) =>
                        "&nbsp;".repeat(spaces.length)
                      )}
                      onChange={(name) => setDoctorName(doctor.id, name)}
                      compact
                      className="w-full border-0 bg-transparent px-1 py-0.5 text-[17px] font-semibold leading-snug focus:bg-white/70 dark:focus:bg-black/25"
                    />
                  ) : (
                    "Bez lekarza prowadzącego"
                  )}
                </div>
                <table className="w-full table-fixed border-collapse text-[16px] text-black dark:text-slate-100">
                  <colgroup>
                    <col className="w-[46%]" />
                    <col className="w-[30%]" />
                    <col className="w-[24%]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th
                        className="border border-black px-2 py-1.5 text-left font-bold dark:border-slate-600"
                        style={{ backgroundColor: colors.header }}
                      >
                        Pacjent
                      </th>
                      <th
                        className="border border-black px-2 py-1.5 text-center font-bold dark:border-slate-600"
                        style={{ backgroundColor: colors.header }}
                      >
                        Fizjoterapeuta
                      </th>
                      <th
                        className="border border-black px-2 py-1.5 text-center font-bold dark:border-slate-600"
                        style={{ backgroundColor: colors.header }}
                      >
                        Data kontroli
                      </th>
                    </tr>
                  </thead>
                    <tbody>
                    {group.dates.map((dateGroup) => (
                      <Fragment key={`${group.doctorId}-${dateGroup.admissionDate || "none"}`}>
                        <tr>
                          <td
                            colSpan={3}
                            className="border border-black px-2 py-1 text-center text-[15px] font-semibold dark:border-slate-600"
                            style={{ backgroundColor: colors.panel }}
                          >
                            {dateGroup.admissionDate
                              ? `Przyjęcie ${formatDatePL(dateGroup.admissionDate)}`
                              : "Bez daty przyjęcia"}
                          </td>
                        </tr>
                        {dateGroup.rows.map((row, index) => {
                          const physio = getPhysioById(data, row.physioId);
                          return (
                            <tr
                              key={row.patientId}
                              style={{
                                backgroundColor:
                                  index % 2 === 0 ? colors.rowEven : colors.zebra,
                              }}
                            >
                              <td className="border border-black px-1 py-0.5 align-top font-medium dark:border-slate-600">
                                <FormattedEditor
                                  value={row.patientName.replace(/ +$/g, (spaces) =>
                                    "&nbsp;".repeat(spaces.length)
                                  )}
                                  onChange={(name) =>
                                    setPatientName(row.physioId, row.patientId, name)
                                  }
                                  compact
                                  multiline
                                  className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-[16px] leading-snug break-words focus:bg-white/70 dark:focus:bg-black/25"
                                />
                                {!doctor ? (
                                  <select
                                    value=""
                                    onChange={(e) =>
                                      setCheckupDoctor(
                                        row.physioId,
                                        row.patientId,
                                        e.target.value
                                      )
                                    }
                                    className="mt-1 w-full rounded-md border border-black/20 bg-white/90 px-2 py-1 text-[14px] text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100"
                                    aria-label="Przypisz lekarza prowadzącego"
                                  >
                                    <option value="">— przypisz lekarza —</option>
                                    {data.doctors.map((d) => (
                                      <option key={d.id} value={d.id}>
                                        {stripHtml(d.name).trim() || "Bez nazwy"}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                              </td>
                              <td className="border border-black px-2 py-1.5 text-center dark:border-slate-600">
                                {physio ? (
                                  <span
                                    className="inline-block max-w-[9rem] truncate rounded px-2 py-0.5 text-[15px] font-semibold text-white"
                                    style={{ backgroundColor: physio.color }}
                                    title={physioDisplayName(physio.name)}
                                  >
                                    {physioDisplayName(physio.name)}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="border border-black px-1 py-1 dark:border-slate-600">
                                <div className="flex items-center justify-center gap-1">
                                  {row.checkupDate ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCheckupDone(
                                          row.physioId,
                                          row.patientId,
                                          !row.checkupDone
                                        )
                                      }
                                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[15px] font-bold text-white ${
                                        row.checkupDone
                                          ? "bg-emerald-800 ring-2 ring-white/70 hover:bg-emerald-700"
                                          : "bg-emerald-600 hover:bg-emerald-500"
                                      }`}
                                      title={
                                        row.checkupDone
                                          ? "Kliknij, aby cofnąć (kliknięte przez przypadek)"
                                          : "Kliknij, jeśli kontrola się odbyła"
                                      }
                                      aria-label={
                                        row.checkupDone
                                          ? "Cofnij oznaczenie kontroli"
                                          : "Oznacz kontrolę jako odbytą"
                                      }
                                    >
                                      K
                                    </button>
                                  ) : null}
                                  <DatePickerCell
                                    value={row.checkupDate}
                                    onChange={(date) =>
                                      setCheckupDate(row.physioId, row.patientId, date)
                                    }
                                    readOnly={row.checkupDone}
                                    title={
                                      row.checkupDone ? "Kontrola odbyła się" : "Data kontroli"
                                    }
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function KontrolePage() {
  const { data, loading } = useData();

  if (loading || !data) return <LoadingState />;

  return (
    <>
      <KontroleContent data={data} />
      <FloatingTodayCalendar variant="slate" storageKey="kontrole-floating-calendar" />
    </>
  );
}
