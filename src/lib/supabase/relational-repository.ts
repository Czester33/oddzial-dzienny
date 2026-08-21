import type { AppData } from "@/lib/types";
import type { Json } from "./database.types";
import { getSupabaseServerClient } from "./server-client";
import type { AppDataRevision, SaveAppDataResult } from "./app-data-repository";

const EPOCH = "1970-01-01T00:00:00.000Z";

type SaveRpcResult = {
  ok: boolean;
  conflict?: boolean;
  updatedAt: string;
};

/** Load AppData assembled from the relational tables by the app_data_load RPC. */
export async function loadAppDataRevisionFromRelational(): Promise<AppDataRevision> {
  const supabase = getSupabaseServerClient();

  const [payloadResult, revisionResult] = await Promise.all([
    supabase.rpc("app_data_load"),
    supabase.rpc("app_data_revision"),
  ]);

  if (payloadResult.error) {
    throw new Error(`Supabase relational read failed: ${payloadResult.error.message}`);
  }
  if (revisionResult.error) {
    throw new Error(`Supabase revision read failed: ${revisionResult.error.message}`);
  }

  const payload = payloadResult.data;
  const updatedAt = revisionResult.data ?? EPOCH;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { data: null, updatedAt };
  }

  // An empty staff table means the backfill has not run yet; treat it as no data
  // so the caller falls back to defaults instead of wiping the tables.
  const physiotherapists = (payload as Record<string, unknown>).physiotherapists;
  if (Array.isArray(physiotherapists) && physiotherapists.length === 0) {
    return { data: null, updatedAt };
  }

  return { data: payload as unknown as AppData, updatedAt };
}

/**
 * Conditional write through the app_data_save RPC, which performs the version
 * check and the full table replace inside a single transaction.
 */
export async function saveAppDataToRelationalVersioned(
  data: AppData,
  baseUpdatedAt: string
): Promise<SaveAppDataResult> {
  const supabase = getSupabaseServerClient();

  const { data: result, error } = await supabase.rpc("app_data_save", {
    p_payload: data as unknown as Json,
    // The epoch base is what callers use for a first write; the row always
    // exists here, so treat it as "no base" and let the write through.
    p_base_updated_at: baseUpdatedAt === EPOCH ? null : baseUpdatedAt,
  });

  if (error) {
    throw new Error(`Supabase relational write failed: ${error.message}`);
  }

  const saved = result as unknown as SaveRpcResult | null;
  if (!saved) {
    throw new Error("Supabase relational write returned no result");
  }

  if (saved.ok) {
    return { ok: true, updatedAt: saved.updatedAt };
  }

  const latest = await loadAppDataRevisionFromRelational();
  if (!latest.data) {
    throw new Error("Supabase relational write conflict and no data to merge");
  }

  return {
    ok: false,
    conflict: true,
    data: latest.data,
    updatedAt: latest.updatedAt,
  };
}
