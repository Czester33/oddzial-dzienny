import { readFile, writeFile, mkdir, rename } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { put, list } from "@vercel/blob";
import type { AppData } from "./types";
import { createDefaultData } from "./default-data";
import { migrateData } from "./physio-utils";
import { applyAutoDischarge, hasAutoDischargeChanges } from "./discharge-utils";
import {
  applyAutoArchiveAdmissions,
  hasAutoArchiveAdmissionChanges,
} from "./admission-utils";
import {
  applyAutoArchiveVacations,
  applyVacationNotes,
  hasAutoArchiveVacationChanges,
  hasVacationNoteChanges,
} from "./vacation-utils";
import {
  applyAutoArchiveDuties,
  applyDutyNotes,
  hasAutoArchiveDutyChanges,
  hasDutyNoteChanges,
} from "./duty-utils";
import {
  loadAppDataFromSupabase,
  saveAppDataToSupabase,
} from "./supabase/app-data-repository";
import { getStorageBackend } from "./storage-backend";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "app-data.json");
const BLOB_NAME = "oddzial-dzienny/app-data.json";

async function readFromFilesystem(): Promise<AppData | null> {
  if (!existsSync(DATA_FILE)) return null;
  const raw = await readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw) as AppData;
}

async function writeToFilesystem(data: AppData): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
  const payload = JSON.stringify(data, null, 2);
  const tmpFile = `${DATA_FILE}.tmp`;
  await writeFile(tmpFile, payload, "utf-8");
  await rename(tmpFile, DATA_FILE);
}

async function readFromBlob(): Promise<AppData | null> {
  const { blobs } = await list({ prefix: "oddzial-dzienny/" });
  const blob = blobs.find((b) => b.pathname === BLOB_NAME);
  if (!blob) return null;

  const response = await fetch(blob.url);
  if (!response.ok) return null;
  return (await response.json()) as AppData;
}

async function writeToBlob(data: AppData): Promise<void> {
  await put(BLOB_NAME, JSON.stringify(data, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function readRawData(): Promise<AppData | null> {
  switch (getStorageBackend()) {
    case "supabase":
      return loadAppDataFromSupabase();
    case "blob":
      return readFromBlob();
    default:
      return readFromFilesystem();
  }
}

async function writeRawData(data: AppData): Promise<void> {
  switch (getStorageBackend()) {
    case "supabase":
      await saveAppDataToSupabase(data);
      return;
    case "blob":
      await writeToBlob(data);
      return;
    default:
      await writeToFilesystem(data);
  }
}

export async function loadData(): Promise<AppData> {
  const data = await readRawData();

  const migrated = migrateData(data ?? createDefaultData());
  const purged = applyAutoDischarge(migrated);
  const archivedAdmissions = applyAutoArchiveAdmissions(purged);
  const archivedVacations = applyAutoArchiveVacations(archivedAdmissions);
  const archivedDuties = applyAutoArchiveDuties(archivedVacations);
  const vacationNotes = applyVacationNotes(archivedDuties);
  const archived = applyDutyNotes(vacationNotes);

  if (
    hasAutoDischargeChanges(migrated, purged) ||
    hasAutoArchiveAdmissionChanges(purged, archivedAdmissions) ||
    hasAutoArchiveVacationChanges(archivedAdmissions, archivedVacations) ||
    hasAutoArchiveDutyChanges(archivedVacations, archivedDuties) ||
    hasVacationNoteChanges(archivedDuties, vacationNotes) ||
    hasDutyNoteChanges(vacationNotes, archived)
  ) {
    await saveData(archived);
  }

  return archived;
}

export async function saveData(data: AppData): Promise<void> {
  await writeRawData(data);
}

export { getStorageBackend };
