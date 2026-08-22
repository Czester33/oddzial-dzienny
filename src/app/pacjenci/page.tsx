"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useData } from "@/context/DataContext";
import type { AppData, ColumnWidths, Patient } from "@/lib/types";
import { LoadingState, ErrorBanner } from "@/components/ui";
import { PhysiotherapistTable } from "@/components/PhysiotherapistTable";
import { PhysioAdmissionNotificationsRail } from "@/components/PhysioAdmissionNotifications";
import {
  countSubstitutesAway,
  createEmptyPatient,
  movePatientBetweenPhysios,
  removeStaleEmptyPatientRows,
  returnSubstitutePatient,
  returnSubstitutesToPhysio,
  sortPatientsByDischargeDate,
  syncEmptyPatientRowTimestamps,
  rememberRemovedPatient,
  visiblePhysiotherapists,
} from "@/lib/physio-utils";
import { applyAutoDischarge, hasAutoDischargeChanges } from "@/lib/discharge-utils";
import { applyVacationNotes, hasVacationNoteChanges } from "@/lib/vacation-utils";
import { applyDutyNotes, getActiveDutyNoteForPhysio, hasDutyNoteChanges } from "@/lib/duty-utils";
import { FloatingTodayCalendar } from "@/components/FloatingTodayCalendar";
import { FloatingUpcomingAdmission, UpcomingAdmissionPanel } from "@/components/FloatingUpcomingAdmission";
import { MobileCollapsible } from "@/components/MobileCollapsible";
import { TodayCalendar } from "@/components/TodayCalendar";
import { formatDatePL, todayIsoDate } from "@/lib/date-utils";
import { getUpcomingAdmissionThisWeek } from "@/lib/admission-utils";
import { deepEqual } from "@/lib/app-data-merge";

function PacjenciContent({ data }: { data: AppData }) {
  const { error, save } = useData();
  const dataRef = useRef(data);
  const emptySinceRef = useRef<Map<string, number>>(new Map());
  const [nowTick, setNowTick] = useState(() => Date.now());

  dataRef.current = data;

  useEffect(() => {
    emptySinceRef.current = syncEmptyPatientRowTimestamps(
      data,
      emptySinceRef.current,
      Date.now()
    );
  }, [data]);

  useEffect(() => {
    const applyBackgroundSync = (source: AppData, now: number): AppData => {
      emptySinceRef.current = syncEmptyPatientRowTimestamps(
        source,
        emptySinceRef.current,
        now
      );
      let next = applyAutoDischarge(source);
      next = applyVacationNotes(next);
      next = applyDutyNotes(next);
      next = removeStaleEmptyPatientRows(next, emptySinceRef.current, now);
      emptySinceRef.current = syncEmptyPatientRowTimestamps(
        next,
        emptySinceRef.current,
        now
      );
      return next;
    };

    const hasBackgroundChanges = (before: AppData, after: AppData) =>
      hasAutoDischargeChanges(before, after) ||
      hasVacationNoteChanges(before, after) ||
      hasDutyNoteChanges(before, after);

    const sync = () => {
      const now = Date.now();
      const source = dataRef.current;
      let next = applyBackgroundSync(source, now);

      // Rebase onto latest UI state so a concurrent row delete is not overwritten.
      const latest = dataRef.current;
      if (!deepEqual(latest, source)) {
        next = applyBackgroundSync(latest, now);
        if (!hasBackgroundChanges(latest, next)) return;
        save(next);
        return;
      }

      if (hasBackgroundChanges(source, next)) {
        save(next);
      }
    };

    sync();
    const interval = setInterval(sync, 10_000);
    return () => clearInterval(interval);
  }, [save]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const getPatients = (physioId: string) =>
    sortPatientsByDischargeDate(data.currentPatients[physioId] ?? []);

  const updatePatient = (physioId: string, patientId: string, patch: Partial<Patient>) => {
    const snapshot = dataRef.current;
    const current = snapshot.currentPatients[physioId] ?? [];
    const idx = current.findIndex((p) => p.id === patientId);
    if (idx < 0) return;
    const updated = [...current];
    updated[idx] = { ...updated[idx], ...patch, id: patientId };
    save({
      ...snapshot,
      currentPatients: {
        ...snapshot.currentPatients,
        [physioId]: sortPatientsByDischargeDate(updated),
      },
    });
  };

  const addRow = (physioId: string) => {
    const snapshot = dataRef.current;
    const current = snapshot.currentPatients[physioId] ?? [];
    save({
      ...snapshot,
      currentPatients: {
        ...snapshot.currentPatients,
        [physioId]: sortPatientsByDischargeDate([...current, createEmptyPatient()]),
      },
    });
  };

  const deleteRow = (physioId: string, index: number) => {
    const snapshot = dataRef.current;
    const current = sortPatientsByDischargeDate(snapshot.currentPatients[physioId] ?? []);
    const removed = current[index];
    if (!removed) return;
    const updated = current.filter((_, i) => i !== index);
    const withoutRow: AppData = {
      ...snapshot,
      currentPatients: {
        ...snapshot.currentPatients,
        [physioId]: updated,
      },
    };
    save(rememberRemovedPatient(withoutRow, removed.id));
  };

  const movePatient = (fromPhysioId: string, index: number, toPhysioId: string) => {
    const snapshot = dataRef.current;
    const fromSorted = sortPatientsByDischargeDate(
      snapshot.currentPatients[fromPhysioId] ?? []
    );
    const patient = fromSorted[index];
    if (!patient) return;

    const rawFrom = snapshot.currentPatients[fromPhysioId] ?? [];
    const rawIndex = rawFrom.findIndex((p) => p.id === patient.id);
    if (rawIndex < 0) return;

    save(movePatientBetweenPhysios(snapshot, fromPhysioId, rawIndex, toPhysioId));
  };

  const returnAllSubstitutes = (physioId: string) => {
    const next = returnSubstitutesToPhysio(dataRef.current, physioId);
    if (next !== dataRef.current) save(next);
  };

  const returnOneSubstitute = (currentPhysioId: string, patientId: string) => {
    const next = returnSubstitutePatient(dataRef.current, currentPhysioId, patientId);
    if (next !== dataRef.current) save(next);
  };

  const updateColumnWidths = (physioId: string, columnWidths: ColumnWidths) => {
    const snapshot = dataRef.current;
    save({
      ...snapshot,
      physiotherapists: snapshot.physiotherapists.map((p) =>
        p.id === physioId ? { ...p, columnWidths } : p
      ),
    });
  };

  const todayIso = todayIsoDate();
  const upcomingSummary = useMemo(() => {
    const upcoming = getUpcomingAdmissionThisWeek(data, todayIso);
    if (!upcoming) return "Brak przyjęć w tym tygodniu";
    if (upcoming.days.length === 1) {
      return `Przyjęcie: ${formatDatePL(upcoming.days[0].date)} (${upcoming.total})`;
    }
    return `Przyjęcia w tyg.: ${upcoming.days.length} dni (${upcoming.total})`;
  }, [data, todayIso]);

  if (visiblePhysiotherapists(data).length === 0) {
    return (
      <div>
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-4 text-slate-600 dark:text-slate-300">
            {data.physiotherapists.length === 0
              ? "Brak fizjoterapeutów. Dodaj ich w zakładce Fizjoterapeuci."
              : "Wszyscy fizjoterapeuci są ukryci. Pokaż ich w zakładce Fizjoterapeuci."}
          </p>
          <Link
            href="/fizjoterapeuci"
            className="inline-block rounded-md bg-blue-600 px-4 py-2 text-[19px] font-medium text-white hover:bg-blue-700"
          >
            Przejdź do Fizjoterapeuci
          </Link>
        </div>
      </div>
    );
  }

  const visiblePhysios = visiblePhysiotherapists(data);

  return (
    <>
      <div className="-mt-6">
        {error && <ErrorBanner message={error} className="mb-2" />}

        <div className="mb-3 space-y-2">
          <MobileCollapsible summary={`Kalendarz · ${formatDatePL(todayIso)}`}>
            <TodayCalendar variant="slate" className="mx-auto" />
          </MobileCollapsible>
          <MobileCollapsible summary={upcomingSummary}>
            <UpcomingAdmissionPanel data={data} />
          </MobileCollapsible>
        </div>

        <PhysioAdmissionNotificationsRail data={data} onSave={save} />

        <div
          className={`grid gap-3 ${
            visiblePhysios.length === 1
              ? "grid-cols-1"
              : visiblePhysios.length === 2
                ? "grid-cols-1 md:grid-cols-2"
                : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
          }`}
        >
          {visiblePhysios.map((physio) => (
            <PhysiotherapistTable
              key={physio.id}
              physio={physio}
              patients={getPatients(physio.id)}
              allPhysios={visiblePhysios}
              substitutesAway={countSubstitutesAway(data, physio.id)}
              dutyNote={getActiveDutyNoteForPhysio(data, physio.id, new Date(nowTick))}
              onUpdatePatient={(patientId, patch) => updatePatient(physio.id, patientId, patch)}
              onAddRow={() => addRow(physio.id)}
              onDeleteRow={(i) => deleteRow(physio.id, i)}
              onMovePatient={(i, toId) => movePatient(physio.id, i, toId)}
              onReturnSubstitutes={() => returnAllSubstitutes(physio.id)}
              onReturnSubstitute={(patientId) => returnOneSubstitute(physio.id, patientId)}
              onColumnWidthsChange={(widths) => updateColumnWidths(physio.id, widths)}
            />
          ))}
        </div>
      </div>

      <FloatingTodayCalendar variant="slate" />
      <FloatingUpcomingAdmission data={data} />
    </>
  );
}

export default function PacjenciPage() {
  const { data, loading } = useData();

  if (loading || !data) return <LoadingState />;

  return <PacjenciContent data={data} />;
}
