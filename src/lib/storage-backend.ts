import { isSupabaseConfigured } from "./supabase/config";

export type StorageBackend = "supabase" | "blob" | "filesystem";

function useBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Active persistence layer; Supabase wins when env vars are set. */
export function getStorageBackend(): StorageBackend {
  if (isSupabaseConfigured()) return "supabase";
  if (useBlob()) return "blob";
  return "filesystem";
}
