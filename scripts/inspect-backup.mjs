/**
 * Ad-hoc probe of the newest backup: value formats and uniqueness assumptions
 * that the relational DDL is about to encode as constraints.
 */

import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "backups");
const file = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().pop();
const { payload: p } = JSON.parse(readFileSync(join(dir, file), "utf8"));

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const hourRe = /^\d{2}:\d{2}$/;

const bad = (label, values, re) => {
  const off = [...new Set(values.filter((v) => v != null && !re.test(v)))];
  console.log(`${label.padEnd(38)} ${off.length ? "ODSTĘPSTWA: " + JSON.stringify(off.slice(0, 8)) : "ok"}`);
};

console.log("== formaty ==");
bad("patient.dischargeDate", Object.values(p.currentPatients).flat().map((x) => x.dischargeDate), dateRe);
bad("patient.checkupDate", Object.values(p.currentPatients).flat().map((x) => x.checkupDate), dateRe);
bad("duty.date", Object.values(p.duties).flat().map((x) => x.date), dateRe);
bad("vacation.date", Object.values(p.vacations).flat().map((x) => x.date), dateRe);
bad("clinicClosedDays", p.clinicClosedDays ?? [], dateRe);
bad("session.admissionDate", Object.values(p.admissions).flat().map((x) => x.admissionDate), dateRe);
bad("session.plannedDischargeDate", Object.values(p.admissions).flat().map((x) => x.plannedDischargeDate), dateRe);
bad("slot.admissionHour", Object.values(p.admissions).flat().flatMap((s) => s.patients.map((x) => x.admissionHour)), hourRe);
bad("massage.active.hour", p.massages.active.map((x) => x.hour), hourRe);
bad("massage.waiting.hour", p.massages.waiting.map((x) => x.hour), hourRe);
bad("massage.active.lastTreatmentDate", p.massages.active.map((x) => x.lastTreatmentDate), dateRe);
bad("massage.waiting.startDate", p.massages.waiting.map((x) => x.startDate), dateRe);

console.log("\n== unikalność ==");
const dupes = (label, rows, keyFn) => {
  const seen = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const d = [...seen].filter(([, n]) => n > 1);
  console.log(`${label.padEnd(38)} ${d.length ? "DUPLIKATY: " + JSON.stringify(d.slice(0, 5)) : "ok"}`);
};
for (const [mk, rows] of Object.entries(p.duties)) {
  dupes(`duties ${mk} (date)`, rows, (r) => r.date);
}
for (const [yk, rows] of Object.entries(p.vacations)) {
  dupes(`vacations ${yk} (date,physio)`, rows, (r) => `${r.date}|${r.physiotherapistId}`);
}

console.log("\n== integralność referencji ==");
const physioIds = new Set([
  ...p.physiotherapists.map((x) => x.id),
  ...(p.retiredPhysiotherapists ?? []).map((x) => x.id),
  ...(p.archivePhysiotherapistProfiles ?? []).map((x) => x.id),
]);
const doctorIds = new Set(p.doctors.map((x) => x.id));
const orphan = (label, ids, pool) => {
  const miss = [...new Set(ids.filter((id) => id && !pool.has(id)))];
  console.log(`${label.padEnd(38)} ${miss.length ? `SIEROTY ${miss.length}: ` + JSON.stringify(miss.slice(0, 4)) : "ok"}`);
};
orphan("currentPatients klucze", Object.keys(p.currentPatients), physioIds);
orphan("patient.ownerPhysiotherapistId", Object.values(p.currentPatients).flat().map((x) => x.ownerPhysiotherapistId), physioIds);
orphan("patient.doctorId", Object.values(p.currentPatients).flat().map((x) => x.doctorId), doctorIds);
orphan("duty.physiotherapistId", Object.values(p.duties).flat().map((x) => x.physiotherapistId), physioIds);
orphan("vacation.physiotherapistId", Object.values(p.vacations).flat().map((x) => x.physiotherapistId), physioIds);
orphan("session.doctorId", Object.values(p.admissions).flat().map((x) => x.doctorId), doctorIds);
orphan("slot.physiotherapistId", Object.values(p.admissions).flat().flatMap((s) => s.patients.map((x) => x.physiotherapistId)), physioIds);
orphan("slot.substitutePhysiotherapistId", Object.values(p.admissions).flat().flatMap((s) => s.patients.map((x) => x.substitutePhysiotherapistId)), physioIds);
orphan("massage.active.physiotherapistId", p.massages.active.map((x) => x.physiotherapistId), physioIds);
orphan("massage.waiting.physiotherapistId", p.massages.waiting.map((x) => x.physiotherapistId), physioIds);
orphan("announcement.physiotherapistId", p.announcements.map((x) => x.physiotherapistId), physioIds);
orphan("notepad.physiotherapistId", (p.notepadNotes ?? []).map((x) => x.physiotherapistId), physioIds);
orphan("archive.physiotherapistId", p.archive.map((x) => x.physiotherapistId), physioIds);
orphan("archive.doctorId", p.archive.map((x) => x.doctorId), doctorIds);

const archPhysio = [
  ...p.admissionArchive.flatMap((m) => m.sessions.flatMap((s) => s.patients.map((x) => x.physiotherapistId))),
  ...p.dutyArchive.flatMap((m) => m.entries.map((x) => x.physiotherapistId)),
  ...p.vacationArchive.flatMap((y) => y.entries.map((x) => x.physiotherapistId)),
  ...p.vacationMonthArchive.flatMap((m) => m.entries.map((x) => x.physiotherapistId)),
];
orphan("archiwa: physiotherapistId", archPhysio, physioIds);
orphan("archiwa: session.doctorId", p.admissionArchive.flatMap((m) => m.sessions.map((s) => s.doctorId)), doctorIds);

console.log("\n== id fizjo / kolizje statusów ==");
const counts = {};
for (const [k, arr] of [
  ["active", p.physiotherapists],
  ["retired", p.retiredPhysiotherapists ?? []],
  ["archive_profile", p.archivePhysiotherapistProfiles ?? []],
]) {
  for (const x of arr) (counts[x.id] ??= []).push(k);
}
const clash = Object.entries(counts).filter(([, v]) => v.length > 1);
console.log(`kolizje id między tablicami          ${clash.length ? JSON.stringify(clash) : "ok"}`);

console.log("\n== pozostałe ==");
console.log("massages keys                         ", Object.keys(p.massages));
console.log("autoArchiveSkip                       ", JSON.stringify(p.autoArchiveSkip));
console.log("announcement.source                   ", [...new Set(p.announcements.map((x) => x.source ?? null))]);
console.log("slot.admissionStatus                  ", [...new Set(Object.values(p.admissions).flat().flatMap((s) => s.patients.map((x) => x.admissionStatus ?? null)))]);
console.log("vacation.certainty                    ", [...new Set(Object.values(p.vacations).flat().map((x) => x.certainty ?? null))]);
console.log("announcementsSeenAt                   ", p.announcementsSeenAt);
console.log("todaySlotPeak                         ", JSON.stringify(p.massages.todaySlotPeak ?? null));
