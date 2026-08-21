import { isSupabaseConfigured } from "./supabase/config";

export type StorageBackend =
  | "supabase"
  | "supabase-relational"
  | "blob"
  | "filesystem";

function hasBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** DATA_STORAGE=relational switches Supabase from the JSONB document to tables. */
function wantsRelational(): boolean {
  return process.env.DATA_STORAGE?.trim().toLowerCase() === "relational";
}

/** Active persistence layer; Supabase wins when env vars are set. */
export function getStorageBackend(): StorageBackend {
  if (isSupabaseConfigured()) {
    return wantsRelational() ? "supabase-relational" : "supabase";
  }
  if (hasBlobStorage()) return "blob";
  return "filesystem";
}
