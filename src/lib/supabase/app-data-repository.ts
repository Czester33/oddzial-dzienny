import type { AppData } from "@/lib/types";
import type { Database } from "./database.types";
import { APP_STATE_ROW_ID } from "./config";
import { getSupabaseServerClient } from "./server-client";

/** Load AppData from Supabase app_state table. Returns null when row is missing or empty. */
export async function loadAppDataFromSupabase(): Promise<AppData | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("app_state")
    .select("payload")
    .eq("id", APP_STATE_ROW_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase read failed: ${error.message}`);
  }

  if (!data?.payload || typeof data.payload !== "object" || Array.isArray(data.payload)) {
    return null;
  }

  const payload = data.payload as Record<string, unknown>;
  if (Object.keys(payload).length === 0) {
    return null;
  }

  return data.payload as unknown as AppData;
}

/** Upsert full AppData document into Supabase. */
export async function saveAppDataToSupabase(data: AppData): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("app_state").upsert(
    {
      id: APP_STATE_ROW_ID,
      payload: data as unknown as Database["public"]["Tables"]["app_state"]["Insert"]["payload"],
    },
    { onConflict: "id" }
  );

  if (error) {
    throw new Error(`Supabase write failed: ${error.message}`);
  }
}
