"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { PageHeader, LoadingState, ErrorBanner, Btn, MonthSelector } from "@/components/ui";
import { parseMonthKey } from "@/lib/date-utils";
import { restoreAdmissionMonthFromArchive } from "@/lib/admission-utils";
import { restoreDutyMonthFromArchive } from "@/lib/duty-utils";
import { restoreVacationYearFromArchive, restoreVacationMonthFromArchive } from "@/lib/vacation-utils";
import { ArchivedAdmissionMonthPanel, ArchivedAdmissionPatientSearch } from "@/components/ArchivedAdmissionSessions";
import {
  ArchivedVacationMonthPanel,
  ArchivedVacationMonthsYearPanel,
  ArchivedVacationYearPanel,
} from "@/components/ArchivedVacationYear";
import { ArchivedDutyMonthPanel, ArchivedDutyYearPanel } from "@/components/ArchivedDutyMonth";
import type {
  ArchivedAdmissionMonth,
  ArchivedDutyMonth,
  ArchivedVacationMonth,
  ArchivedVacationYear,
} from "@/lib/types";

type ArchiveCategory = "admissions" | "duties" | "vacations";
type PeriodViewMode = "months" | "year";
type AdmissionViewMode = "months" | "search";

const CATEGORY_TABS: { id: ArchiveCategory; label: string }[] = [
  { id: "admissions", label: "Przyjęcia" },
  { id: "duties", label: "Dyżury" },
  { id: "vacations", label: "Urlopy" },
];

const TAB_ACTIVE: Record<ArchiveCategory, string> = {
  admissions: "border-blue-600 bg-blue-600 text-white",
  duties: "border-amber-600 bg-amber-600 text-white",
  vacations: "border-emerald-600 bg-emerald-600 text-white",
};

function pickKey(keys: string[], current: string | null): string | null {
  if (keys.length === 0) return null;
  if (current && keys.includes(current)) return current;
  return keys[0];
}

function yearsFromMonthKeys(keys: string[]): string[] {
  const years = new Set(keys.map((key) => String(parseMonthKey(key).year)));
  return [...years].sort((a, b) => Number(b) - Number(a));
}

function mergeYearKeys(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort((a, b) => Number(b) - Number(a));
}

function ArchiveYearSelector({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[19px] text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
    >
      {options.map((year) => (
        <option key={year} value={year}>
          {year}
        </option>
      ))}
    </select>
  );
}

export default function ArchiwumPage() {
  const { data, loading, error, save, saving } = useData();
  const [category, setCategory] = useState<ArchiveCategory>("admissions");
  const [admissionViewMode, setAdmissionViewMode] = useState<AdmissionViewMode>("months");
  const [dutyViewMode, setDutyViewMode] = useState<PeriodViewMode>("months");
  const [vacationViewMode, setVacationViewMode] = useState<PeriodViewMode>("months");
  const [admissionKey, setAdmissionKey] = useState<string | null>(null);
  const [dutyKey, setDutyKey] = useState<string | null>(null);
  const [dutyYearKey, setDutyYearKey] = useState<string | null>(null);
  const [vacationMonthKey, setVacationMonthKey] = useState<string | null>(null);
  const [vacationYearKey, setVacationYearKey] = useState<string | null>(null);

  const admissionMonths = useMemo(() => {
    if (!data) return [] as ArchivedAdmissionMonth[];
    return [...(data.admissionArchive ?? [])].sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    );
  }, [data]);

  const vacationMonths = useMemo(() => {
    if (!data) return [] as ArchivedVacationMonth[];
    return [...(data.vacationMonthArchive ?? [])].sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    );
  }, [data]);

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

  const admissionKeys = useMemo(
    () => admissionMonths.map((entry) => entry.monthKey),
    [admissionMonths]
  );
  const dutyKeys = useMemo(() => dutyMonths.map((entry) => entry.monthKey), [dutyMonths]);
  const dutyYearKeys = useMemo(() => yearsFromMonthKeys(dutyKeys), [dutyKeys]);
  const vacationMonthKeys = useMemo(
    () => vacationMonths.map((entry) => entry.monthKey),
    [vacationMonths]
  );
  const vacationYearKeys = useMemo(
    () => vacationYears.map((entry) => entry.yearKey),
    [vacationYears]
  );
  const vacationBrowseYearKeys = useMemo(
    () => mergeYearKeys(yearsFromMonthKeys(vacationMonthKeys), vacationYearKeys),
    [vacationMonthKeys, vacationYearKeys]
  );

  const availableCategories = useMemo(() => {
    const categories: ArchiveCategory[] = [];
    if (admissionKeys.length > 0) categories.push("admissions");
    if (dutyKeys.length > 0) categories.push("duties");
    if (vacationMonthKeys.length > 0 || vacationYearKeys.length > 0) {
      categories.push("vacations");
    }
    return categories;
  }, [admissionKeys, dutyKeys, vacationMonthKeys, vacationYearKeys]);

  const effectiveAdmissionKey = pickKey(admissionKeys, admissionKey);
  const effectiveDutyKey = pickKey(dutyKeys, dutyKey);
  const effectiveDutyYearKey = pickKey(dutyYearKeys, dutyYearKey);
  const effectiveVacationMonthKey = pickKey(vacationMonthKeys, vacationMonthKey);
  const effectiveVacationYearKey = pickKey(vacationBrowseYearKeys, vacationYearKey);

  useEffect(() => {
    if (availableCategories.length === 0) return;
    if (!availableCategories.includes(category)) {
      setCategory(availableCategories[0]);
    }
  }, [availableCategories, category]);

  if (loading || !data) return <LoadingState />;

  const empty = availableCategories.length === 0;

  const selectedAdmission = admissionMonths.find(
    (entry) => entry.monthKey === effectiveAdmissionKey
  );
  const selectedDuty = dutyMonths.find((entry) => entry.monthKey === effectiveDutyKey);
  const selectedVacationMonth = vacationMonths.find(
    (entry) => entry.monthKey === effectiveVacationMonthKey
  );
  const selectedVacationYearArchive = vacationYears.find(
    (entry) => entry.yearKey === effectiveVacationYearKey
  );

  async function restoreAdmission(monthKey: string) {
    if (!data) return;
    if (!confirm("Przywrócić ten miesiąc przyjęć z archiwum?")) return;
    await save(restoreAdmissionMonthFromArchive(data, monthKey));
  }

  async function restoreDuty(monthKey: string) {
    if (!data) return;
    if (!confirm("Przywrócić ten miesiąc dyżurów z archiwum?")) return;
    await save(restoreDutyMonthFromArchive(data, monthKey));
  }

  async function restoreVacationMonth(monthKey: string) {
    if (!data) return;
    if (!confirm("Przywrócić ten miesiąc urlopów z archiwum?")) return;
    await save(restoreVacationMonthFromArchive(data, monthKey));
  }

  async function restoreVacation(yearKey: string) {
    if (!data) return;
    if (!confirm("Przywrócić ten rok urlopów z archiwum?")) return;
    await save(restoreVacationYearFromArchive(data, yearKey));
  }

  function tabClass(id: ArchiveCategory, active: boolean): string {
    const base =
      "rounded-md border px-4 py-2 text-[19px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
    if (active) return `${base} ${TAB_ACTIVE[id]}`;
    return `${base} border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700`;
  }

  function subTabClass(active: boolean, accent: "amber" | "emerald" | "blue"): string {
    const base =
      "rounded-md border px-3 py-1.5 text-[17px] font-medium transition-colors";
    if (active) {
      const activeClass =
        accent === "amber"
          ? "border-amber-600 bg-amber-600 text-white"
          : accent === "emerald"
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-blue-600 bg-blue-600 text-white";
      return `${base} ${activeClass}`;
    }
    return `${base} border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`;
  }

  function AdmissionSubTabs({
    mode,
    onModeChange,
  }: {
    mode: AdmissionViewMode;
    onModeChange: (mode: AdmissionViewMode) => void;
  }) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onModeChange("months")}
          className={subTabClass(mode === "months", "blue")}
        >
          Miesiąc
        </button>
        <button
          type="button"
          onClick={() => onModeChange("search")}
          className={subTabClass(mode === "search", "blue")}
        >
          Szukaj pacjenta
        </button>
      </div>
    );
  }

  function PeriodSubTabs({
    mode,
    onModeChange,
    accent,
  }: {
    mode: PeriodViewMode;
    onModeChange: (mode: PeriodViewMode) => void;
    accent: "amber" | "emerald";
  }) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onModeChange("months")}
          className={subTabClass(mode === "months", accent)}
        >
          Miesiące
        </button>
        <button
          type="button"
          onClick={() => onModeChange("year")}
          className={subTabClass(mode === "year", accent)}
        >
          Cały rok
        </button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Archiwum" />
      <p className="-mt-4 mb-6 text-[16px] text-slate-500 dark:text-slate-400">
        Przyjęcia, dyżury i urlopy archiwizują się w ostatni dzień roboczy miesiąca.
        Pełny rok urlopów można też zarchiwizować ręcznie na stronie Urlopy.
      </p>
      {error && <ErrorBanner message={error} />}

      {empty ? (
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-[19px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Brak zarchiwizowanych danych.
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4 dark:border-slate-700">
            {CATEGORY_TABS.map((tab) => {
              const hasData = availableCategories.includes(tab.id);
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={!hasData}
                  onClick={() => setCategory(tab.id)}
                  className={tabClass(tab.id, category === tab.id)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {category === "admissions" && admissionKeys.length > 0 ? (
            <div className="space-y-4">
              <AdmissionSubTabs
                mode={admissionViewMode}
                onModeChange={setAdmissionViewMode}
              />

              {admissionViewMode === "months" && selectedAdmission && effectiveAdmissionKey ? (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-[19px] text-slate-700 dark:text-slate-300">
                      <span>Miesiąc:</span>
                      <MonthSelector
                        value={effectiveAdmissionKey}
                        onChange={setAdmissionKey}
                        options={admissionKeys}
                      />
                    </label>
                    <Btn
                      variant="secondary"
                      disabled={saving}
                      onClick={() => void restoreAdmission(effectiveAdmissionKey)}
                    >
                      Cofnij z archiwum
                    </Btn>
                  </div>
                  <ArchivedAdmissionMonthPanel
                    entry={selectedAdmission}
                    data={data}
                    open
                    onToggle={() => {}}
                  />
                </>
              ) : null}

              {admissionViewMode === "search" ? (
                <ArchivedAdmissionPatientSearch
                  archive={admissionMonths}
                  data={data}
                  onShowMonth={(monthKey) => {
                    setAdmissionKey(monthKey);
                    setAdmissionViewMode("months");
                  }}
                />
              ) : null}
            </div>
          ) : null}

          {category === "duties" && dutyKeys.length > 0 ? (
            <div className="space-y-4">
              <PeriodSubTabs
                mode={dutyViewMode}
                onModeChange={setDutyViewMode}
                accent="amber"
              />

              {dutyViewMode === "months" && selectedDuty && effectiveDutyKey ? (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-[19px] text-slate-700 dark:text-slate-300">
                      <span>Miesiąc:</span>
                      <MonthSelector
                        value={effectiveDutyKey}
                        onChange={setDutyKey}
                        options={dutyKeys}
                      />
                    </label>
                    <Btn
                      variant="secondary"
                      disabled={saving}
                      onClick={() => void restoreDuty(effectiveDutyKey)}
                    >
                      Cofnij z archiwum
                    </Btn>
                  </div>
                  <ArchivedDutyMonthPanel entry={selectedDuty} data={data} />
                </>
              ) : null}

              {dutyViewMode === "year" && effectiveDutyYearKey ? (
                <>
                  <label className="flex items-center gap-2 text-[19px] text-slate-700 dark:text-slate-300">
                    <span>Rok:</span>
                    <ArchiveYearSelector
                      value={effectiveDutyYearKey}
                      onChange={setDutyYearKey}
                      options={dutyYearKeys}
                    />
                  </label>
                  <p className="text-[16px] text-slate-500 dark:text-slate-400">
                    Przywracanie miesiąca — w widoku „Miesiące”.
                  </p>
                  <ArchivedDutyYearPanel
                    yearKey={effectiveDutyYearKey}
                    entries={dutyMonths}
                    data={data}
                  />
                </>
              ) : null}
            </div>
          ) : null}

          {category === "vacations" &&
          (vacationMonthKeys.length > 0 || vacationYearKeys.length > 0) ? (
            <div className="space-y-4">
              <PeriodSubTabs
                mode={vacationViewMode}
                onModeChange={setVacationViewMode}
                accent="emerald"
              />

              {vacationViewMode === "months" &&
              selectedVacationMonth &&
              effectiveVacationMonthKey ? (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-[19px] text-slate-700 dark:text-slate-300">
                      <span>Miesiąc:</span>
                      <MonthSelector
                        value={effectiveVacationMonthKey}
                        onChange={setVacationMonthKey}
                        options={vacationMonthKeys}
                      />
                    </label>
                    <Btn
                      variant="secondary"
                      disabled={saving}
                      onClick={() => void restoreVacationMonth(effectiveVacationMonthKey)}
                    >
                      Cofnij z archiwum
                    </Btn>
                  </div>
                  <ArchivedVacationMonthPanel entry={selectedVacationMonth} data={data} />
                </>
              ) : null}

              {vacationViewMode === "months" &&
              vacationMonthKeys.length === 0 &&
              vacationYearKeys.length > 0 ? (
                <p className="text-[19px] text-slate-500 dark:text-slate-400">
                  Brak archiwum miesięcznego. Użyj widoku „Cały rok”.
                </p>
              ) : null}

              {vacationViewMode === "year" && effectiveVacationYearKey ? (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-[19px] text-slate-700 dark:text-slate-300">
                      <span>Rok:</span>
                      <ArchiveYearSelector
                        value={effectiveVacationYearKey}
                        onChange={setVacationYearKey}
                        options={vacationBrowseYearKeys}
                      />
                    </label>
                    {selectedVacationYearArchive ? (
                      <Btn
                        variant="secondary"
                        disabled={saving}
                        onClick={() => void restoreVacation(effectiveVacationYearKey)}
                      >
                        Cofnij z archiwum
                      </Btn>
                    ) : null}
                  </div>
                  {!selectedVacationYearArchive && vacationMonthKeys.length > 0 ? (
                    <p className="text-[16px] text-slate-500 dark:text-slate-400">
                      Złożony widok z archiwum miesięcznego. Przywracanie miesiąca — w widoku
                      „Miesiące”.
                    </p>
                  ) : null}
                  {selectedVacationYearArchive ? (
                    <ArchivedVacationYearPanel entry={selectedVacationYearArchive} data={data} />
                  ) : (
                    <ArchivedVacationMonthsYearPanel
                      yearKey={effectiveVacationYearKey}
                      entries={vacationMonths}
                      data={data}
                    />
                  )}
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
