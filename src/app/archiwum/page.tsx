"use client";

import { useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { PageHeader, LoadingState, ErrorBanner } from "@/components/ui";
import { parseMonthKey } from "@/lib/date-utils";
import { ArchivedAdmissionMonthPanel } from "@/components/ArchivedAdmissionSessions";
import { ArchivedVacationYearPanel } from "@/components/ArchivedVacationYear";
import { ArchivedDutyMonthPanel } from "@/components/ArchivedDutyMonth";
import type {
  ArchivedAdmissionMonth,
  ArchivedDutyMonth,
  ArchivedVacationYear,
} from "@/lib/types";

const MONTHS_PL = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

export default function ArchiwumPage() {
  const { data, loading, error } = useData();
  const [openAdmissionKey, setOpenAdmissionKey] = useState<string | null>(null);
  const [openVacationYear, setOpenVacationYear] = useState<string | null>(null);
  const [openDutyKey, setOpenDutyKey] = useState<string | null>(null);

  const admissionMonths = useMemo(() => {
    if (!data) return [] as ArchivedAdmissionMonth[];
    return [...(data.admissionArchive ?? [])].sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    );
  }, [data]);

  const admissionsByYear = useMemo(() => {
    const map = new Map<number, ArchivedAdmissionMonth[]>();
    for (const entry of admissionMonths) {
      const { year } = parseMonthKey(entry.monthKey);
      const list = map.get(year) ?? [];
      list.push(entry);
      map.set(year, list);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [admissionMonths]);

  const vacationYears = useMemo(() => {
    if (!data) return [] as ArchivedVacationYear[];
    return [...(data.vacationArchive ?? [])].sort((a, b) =>
      b.yearKey.localeCompare(a.yearKey)
    );
  }, [data]);

  const dutyMonths = useMemo(() => {
    if (!data) return [] as ArchivedDutyMonth[];
    return [...(data.dutyArchive ?? [])].sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    );
  }, [data]);

  const dutiesByYear = useMemo(() => {
    const map = new Map<number, ArchivedDutyMonth[]>();
    for (const entry of dutyMonths) {
      const { year } = parseMonthKey(entry.monthKey);
      const list = map.get(year) ?? [];
      list.push(entry);
      map.set(year, list);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [dutyMonths]);

  if (loading || !data) return <LoadingState />;

  const empty =
    admissionsByYear.length === 0 &&
    vacationYears.length === 0 &&
    dutiesByYear.length === 0;

  return (
    <div>
      <PageHeader title="Archiwum" />
      <p className="-mt-4 mb-6 text-[16px] text-slate-500 dark:text-slate-400">
        Przyjęcia i dyżury archiwizują się w ostatni dzień roboczy miesiąca.
        Urlopy — w ostatni dzień roboczy grudnia (cały rok).
      </p>
      {error && <ErrorBanner message={error} />}

      {empty ? (
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-[19px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Brak zarchiwizowanych danych.
        </div>
      ) : (
        <div className="space-y-10">
          {admissionsByYear.length > 0 && (
            <section>
              <h2 className="mb-4 text-[24px] font-bold text-slate-800 dark:text-slate-100">
                Przyjęcia
              </h2>
              <div className="space-y-8">
                {admissionsByYear.map(([year, entries]) => (
                  <div key={year}>
                    <h3 className="mb-3 text-[22px] font-bold text-slate-800 dark:text-slate-100">
                      {year}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {entries.map((entry) => {
                        const { month } = parseMonthKey(entry.monthKey);
                        const isOpen = openAdmissionKey === entry.monthKey;
                        return (
                          <button
                            key={entry.monthKey}
                            type="button"
                            onClick={() =>
                              setOpenAdmissionKey((cur) =>
                                cur === entry.monthKey ? null : entry.monthKey
                              )
                            }
                            className={`rounded-md border px-4 py-2 text-[19px] font-medium transition-colors ${
                              isOpen
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                            }`}
                          >
                            {MONTHS_PL[month]}
                          </button>
                        );
                      })}
                    </div>

                    {entries.map((entry) =>
                      openAdmissionKey === entry.monthKey ? (
                        <div key={`panel-${entry.monthKey}`} className="mt-4">
                          <ArchivedAdmissionMonthPanel
                            entry={entry}
                            data={data}
                            open
                            onToggle={() => setOpenAdmissionKey(null)}
                          />
                        </div>
                      ) : null
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {dutiesByYear.length > 0 && (
            <section>
              <h2 className="mb-4 text-[24px] font-bold text-slate-800 dark:text-slate-100">
                Dyżury
              </h2>
              <div className="space-y-8">
                {dutiesByYear.map(([year, entries]) => (
                  <div key={year}>
                    <h3 className="mb-3 text-[22px] font-bold text-slate-800 dark:text-slate-100">
                      {year}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {entries.map((entry) => {
                        const { month } = parseMonthKey(entry.monthKey);
                        const isOpen = openDutyKey === entry.monthKey;
                        return (
                          <button
                            key={entry.monthKey}
                            type="button"
                            onClick={() =>
                              setOpenDutyKey((cur) =>
                                cur === entry.monthKey ? null : entry.monthKey
                              )
                            }
                            className={`rounded-md border px-4 py-2 text-[19px] font-medium transition-colors ${
                              isOpen
                                ? "border-amber-600 bg-amber-600 text-white"
                                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                            }`}
                          >
                            {MONTHS_PL[month]}
                          </button>
                        );
                      })}
                    </div>

                    {entries.map((entry) =>
                      openDutyKey === entry.monthKey ? (
                        <div key={`duty-${entry.monthKey}`} className="mt-4">
                          <ArchivedDutyMonthPanel entry={entry} data={data} />
                        </div>
                      ) : null
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {vacationYears.length > 0 && (
            <section>
              <h2 className="mb-4 text-[24px] font-bold text-slate-800 dark:text-slate-100">
                Urlopy
              </h2>
              <div className="flex flex-wrap gap-2">
                {vacationYears.map((entry) => {
                  const isOpen = openVacationYear === entry.yearKey;
                  return (
                    <button
                      key={entry.yearKey}
                      type="button"
                      onClick={() =>
                        setOpenVacationYear((cur) =>
                          cur === entry.yearKey ? null : entry.yearKey
                        )
                      }
                      className={`rounded-md border px-4 py-2 text-[19px] font-medium transition-colors ${
                        isOpen
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      Urlopy {entry.yearKey}
                    </button>
                  );
                })}
              </div>

              {vacationYears.map((entry) =>
                openVacationYear === entry.yearKey ? (
                  <div key={`vac-${entry.yearKey}`} className="mt-4">
                    <ArchivedVacationYearPanel entry={entry} data={data} />
                  </div>
                ) : null
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
