import { readFile, writeFile, mkdir, rename, stat } from "fs/promises";
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
  loadAppDataRevisionFromSupabase,
  saveAppDataToSupabaseVersioned,
} from "./supabase/app-data-repository";
import {
  loadAppDataRevisionFromRelational,
  saveAppDataToRelationalVersioned,
} from "./supabase/relational-repository";
import { getStorageBackend } from "./storage-backend";
import {
  parseStoredDocument,
  toStoredDocument,
} from "./app-data-merge";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "app-data.json");
const BLOB_NAME = "oddzial-dzienny/app-data.json";

export type AppDataLoadResult = {
  data: AppData;
  updatedAt: string;
};

export type AppDataSaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: true; data: AppData; updatedAt: string };

async function readRevisionFromFilesystem(): Promise<{ data: AppData | null; updatedAt: string }> {
  if (!existsSync(DATA_FILE)) {
    return { data: null, updatedAt: "1970-01-01T00:00:00.000Z" };
  }
  const raw = JSON.parse(await readFile(DATA_FILE, "utf-8")) as unknown;
  const parsed = parseStoredDocument(raw);
  if (parsed.updatedAt === "1970-01-01T00:00:00.000Z") {
    try {
      const meta = await stat(DATA_FILE);
      return { data: parsed.data, updatedAt: meta.mtime.toISOString() };
    } catch {
      return parsed;
    }
  }
  return parsed;
}

async function writeRevisionToFilesystem(data: AppData, updatedAt: string): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
  const payload = JSON.stringify(toStoredDocument(data, updatedAt), null, 2);
  const tmpFile = `${DATA_FILE}.tmp`;
  await writeFile(tmpFile, payload, "utf-8");
  await rename(tmpFile, DATA_FILE);
}

async function readRevisionFromBlob(): Promise<{ data: AppData | null; updatedAt: string }> {
  const { blobs } = await list({ prefix: "oddzial-dzienny/" });
  const blob = blobs.find((b) => b.pathname === BLOB_NAME);
  if (!blob) return { data: null, updatedAt: "1970-01-01T00:00:00.000Z" };

  const response = await fetch(blob.url);
  if (!response.ok) return { data: null, updatedAt: "1970-01-01T00:00:00.000Z" };
  const raw = (await response.json()) as unknown;
  const parsed = parseStoredDocument(raw);
  if (parsed.updatedAt === "1970-01-01T00:00:00.000Z" && blob.uploadedAt) {
    return {
      data: parsed.data,
      updatedAt: new Date(blob.uploadedAt).toISOString(),
    };
  }
  return parsed;
}

async function writeRevisionToBlob(data: AppData, updatedAt: string): Promise<void> {
  await put(BLOB_NAME, JSON.stringify(toStoredDocument(data, updatedAt), null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function readRevision(): Promise<{ data: AppData | null; updatedAt: string }> {
  switch (getStorageBackend()) {
    case "supabase":
      return loadAppDataRevisionFromSupabase();
    case "supabase-relational":
      return loadAppDataRevisionFromRelational();
    case "blob":
      return readRevisionFromBlob();
    default:
      return readRevisionFromFilesystem();
  }
}

export async function loadDataRevision(): Promise<AppDataLoadResult> {
  const revision = await readRevision();
  const migrated = migrateData(revision.data ?? createDefaultData());
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
    let baseUpdatedAt = revision.updatedAt;
    let payload = archived;

    for (let attempt = 0; attempt < 3; attempt++) {
      const saved = await saveDataRevision(payload, baseUpdatedAt);
      if (saved.ok) {
        return { data: payload, updatedAt: saved.updatedAt };
      }
      if (!saved.conflict) break;

      baseUpdatedAt = saved.updatedAt;
      const remigrated = migrateData(saved.data);
      const rePurged = applyAutoDischarge(remigrated);
      const reArchivedAdmissions = applyAutoArchiveAdmissions(rePurged);
      const reArchivedVacations = applyAutoArchiveVacations(reArchivedAdmissions);
      const reArchivedDuties = applyAutoArchiveDuties(reArchivedVacations);
      const reVacationNotes = applyVacationNotes(reArchivedDuties);
      payload = applyDutyNotes(reVacationNotes);
    }

    return { data: payload, updatedAt: revision.updatedAt };
  }

  return { data: archived, updatedAt: revision.updatedAt };
}

export async function loadData(): Promise<AppData> {
  const revision = await loadDataRevision();
  return revision.data;
}

export async function saveDataRevision(
  data: AppData,
  baseUpdatedAt: string
): Promise<AppDataSaveResult> {
  const backend = getStorageBackend();

  if (backend === "supabase") {
    return saveAppDataToSupabaseVersioned(data, baseUpdatedAt);
  }

  if (backend === "supabase-relational") {
    return saveAppDataToRelationalVersioned(data, baseUpdatedAt);
  }

  const current = await readRevision();
  if (current.data !== null && current.updatedAt !== baseUpdatedAt) {
    const migrated = migrateData(current.data);
    return {
      ok: false,
      conflict: true,
      data: migrated,
      updatedAt: current.updatedAt,
    };
  }

  const nextUpdatedAt = new Date().toISOString();
  if (backend === "blob") {
    await writeRevisionToBlob(data, nextUpdatedAt);
  } else {
    await writeRevisionToFilesystem(data, nextUpdatedAt);
  }
  return { ok: true, updatedAt: nextUpdatedAt };
}

/** Unconditional write (tests / legacy). Prefer saveDataRevision. */
export async function saveData(data: AppData): Promise<void> {
  const current = await readRevision();
  const result = await saveDataRevision(data, current.updatedAt);
  if (!result.ok) {
    // Retry once against latest version for maintenance paths.
    const retry = await saveDataRevision(data, result.updatedAt);
    if (!retry.ok) {
      throw new Error("Failed to save app data after conflict");
    }
  }
}

export { getStorageBackend };
