"use client";

import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import { useData } from "@/context/DataContext";
import type { AppData, ColumnWidths, Patient } from "@/lib/types";
import { LoadingState, ErrorBanner } from "@/components/ui";
import { PhysiotherapistTable } from "@/components/PhysiotherapistTable";
import { PhysioAdmissionNotificationsRail } from "@/components/PhysioAdmissionNotifications";
import {
  countSubstitutesAway,
  createEmptyPatient,
  isPatientSlotEmpty,
  movePatientBetweenPhysios,
  returnSubstitutePatient,
  returnSubstitutesToPhysio,
  sortPatientsByDischargeDate,
} from "@/lib/physio-utils";
import { applyAutoDischarge, hasAutoDischargeChanges } from "@/lib/discharge-utils";
import { applyVacationNotes, hasVacationNoteChanges } from "@/lib/vacation-utils";
import { applyDutyNotes, hasDutyNoteChanges } from "@/lib/duty-utils";
import { FloatingTodayCalendar } from "@/components/FloatingTodayCalendar";
import { FloatingUpcomingAdmission } from "@/components/FloatingUpcomingAdmission";

function PacjenciContent({ data }: { data: AppData }) {
  const { error, save } = useData();
  const dataRef = useRef(data);

  dataRef.current = data;

  useEffect(() => {
    const sync = () => {
      const current = dataRef.current;
      let next = applyAutoDischarge(current);
      next = applyVacationNotes(next);
      next = applyDutyNotes(next);
      if (
        hasAutoDischargeChanges(current, next) ||
        hasVacationNoteChanges(current, next) ||
        hasDutyNoteChanges(current, next)
      ) {
        save(next);
      }
    };

    sync();
    const interval = setInterval(sync, 60_000);
    return () => clearInterval(interval);
  }, [save]);

  const getPatients = (physioId: string) =>
    sortPatientsByDischargeDate(
      (data.currentPatients[physioId] ?? []).filter((p) => !isPatientSlotEmpty(p))
    );

  const updatePatient = (physioId: string, index: number, patient: Patient) => {
    const current = getPatients(physioId);
    const updated = [...current];
    updated[index] = { ...patient, id: patient.id.startsWith("empty-") ? uuidv4() : patient.id };
    save({
      ...data,
      currentPatients: {
        ...data.currentPatients,
        [physioId]: sortPatientsByDischargeDate(updated),
      },
    });
  };

  const addRow = (physioId: string) => {
    const current = getPatients(physioId);
    save({
      ...data,
      currentPatients: {
        ...data.currentPatients,
        [physioId]: sortPatientsByDischargeDate([...current, createEmptyPatient()]),
      },
    });
  };

  const deleteRow = (physioId: string, index: number) => {
    const current = getPatients(physioId);
    const updated = current.filter((_, i) => i !== index);
    save({
      ...data,
      currentPatients: {
        ...data.currentPatients,
        [physioId]: updated,
      },
    });
  };

  const movePatient = (fromPhysioId: string, index: number, toPhysioId: string) => {
    const fromSorted = getPatients(fromPhysioId);
    const patient = fromSorted[index];
    if (!patient) return;

    const rawFrom = data.currentPatients[fromPhysioId] ?? [];
    const rawIndex = rawFrom.findIndex((p) => p.id === patient.id);
    if (rawIndex < 0) return;

    save(movePatientBetweenPhysios(data, fromPhysioId, rawIndex, toPhysioId));
  };

  const returnAllSubstitutes = (physioId: string) => {
    const next = returnSubstitutesToPhysio(data, physioId);
    if (next !== data) save(next);
  };

  const returnOneSubstitute = (currentPhysioId: string, patientId: string) => {
    const next = returnSubstitutePatient(data, currentPhysioId, patientId);
    if (next !== data) save(next);
  };

  const updateColumnWidths = (physioId: string, columnWidths: ColumnWidths) => {
    save({
      ...data,
      physiotherapists: data.physiotherapists.map((p) =>
        p.id === physioId ? { ...p, columnWidths } : p
      ),
    });
  };

  if (data.physiotherapists.length === 0) {
    return (
      <div>
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-4 text-slate-600 dark:text-slate-300">Brak fizjoterapeutów. Dodaj ich w zakładce Fizjoterapeuci.</p>
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

  return (
    <>
      <div className="-mt-6">
        {error && <ErrorBanner message={error} className="mb-2" />}

        <div
          className={`grid gap-3 ${
            data.physiotherapists.length === 1
              ? "grid-cols-1"
              : data.physiotherapists.length === 2
                ? "grid-cols-1 md:grid-cols-2"
                : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
          }`}
        >
          {data.physiotherapists.map((physio) => (
            <PhysiotherapistTable
              key={physio.id}
              physio={physio}
              patients={getPatients(physio.id)}
              allPhysios={data.physiotherapists}
              substitutesAway={countSubstitutesAway(data, physio.id)}
              onUpdatePatient={(i, patient) => updatePatient(physio.id, i, patient)}
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

      <PhysioAdmissionNotificationsRail data={data} onSave={save} />
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
