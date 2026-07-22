import type { AppData } from "@/lib/types";
import type { Database } from "./database.types";
import { APP_STATE_ROW_ID } from "./config";
import { getSupabaseServerClient } from "./server-client";

export type AppDataRevision = {
  data: AppData | null;
  updatedAt: string;
};

/** Load AppData + updated_at from Supabase. */
export async function loadAppDataRevisionFromSupabase(): Promise<AppDataRevision> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("app_state")
    .select("payload, updated_at")
    .eq("id", APP_STATE_ROW_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase read failed: ${error.message}`);
  }

  if (!data?.payload || typeof data.payload !== "object" || Array.isArray(data.payload)) {
    return { data: null, updatedAt: "1970-01-01T00:00:00.000Z" };
  }

  const payload = data.payload as Record<string, unknown>;
  if (Object.keys(payload).length === 0) {
    return { data: null, updatedAt: data.updated_at ?? "1970-01-01T00:00:00.000Z" };
  }

  return {
    data: data.payload as unknown as AppData,
    updatedAt: data.updated_at ?? "1970-01-01T00:00:00.000Z",
  };
}

/** Load AppData from Supabase app_state table. Returns null when row is missing or empty. */
export async function loadAppDataFromSupabase(): Promise<AppData | null> {
  const revision = await loadAppDataRevisionFromSupabase();
  return revision.data;
}

export type SaveAppDataResult =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: true; data: AppData; updatedAt: string };

/**
 * Conditional write: succeeds only when baseUpdatedAt matches current row
 * (or row is missing / first write with epoch base).
 */
export async function saveAppDataToSupabaseVersioned(
  data: AppData,
  baseUpdatedAt: string
): Promise<SaveAppDataResult> {
  const supabase = getSupabaseServerClient();
  const payload = data as unknown as Database["public"]["Tables"]["app_state"]["Insert"]["payload"];

  const current = await loadAppDataRevisionFromSupabase();

  if (current.data === null) {
    const { error } = await supabase.from("app_state").upsert(
      { id: APP_STATE_ROW_ID, payload },
      { onConflict: "id" }
    );
    if (error) throw new Error(`Supabase write failed: ${error.message}`);
    const after = await loadAppDataRevisionFromSupabase();
    return { ok: true, updatedAt: after.updatedAt };
  }

  if (current.updatedAt !== baseUpdatedAt) {
    return {
      ok: false,
      conflict: true,
      data: current.data,
      updatedAt: current.updatedAt,
    };
  }

  const nextUpdatedAt = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("app_state")
    .update({ payload, updated_at: nextUpdatedAt })
    .eq("id", APP_STATE_ROW_ID)
    .eq("updated_at", baseUpdatedAt)
    .select("updated_at")
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase write failed: ${error.message}`);
  }

  if (!updated) {
    const latest = await loadAppDataRevisionFromSupabase();
    if (!latest.data) {
      throw new Error("Supabase write conflict and row missing");
    }
    return {
      ok: false,
      conflict: true,
      data: latest.data,
      updatedAt: latest.updatedAt,
    };
  }

  return { ok: true, updatedAt: updated.updated_at };
}

/** Upsert full AppData document into Supabase (unconditional — prefer versioned API). */
export async function saveAppDataToSupabase(data: AppData): Promise<void> {
  const result = await saveAppDataToSupabaseVersioned(data, (await loadAppDataRevisionFromSupabase()).updatedAt);
  if (!result.ok) {
    // Last resort overwrite after re-read race
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("app_state").upsert(
      {
        id: APP_STATE_ROW_ID,
        payload: data as unknown as Database["public"]["Tables"]["app_state"]["Insert"]["payload"],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw new Error(`Supabase write failed: ${error.message}`);
  }
}
