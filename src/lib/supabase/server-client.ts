import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "./config";

let client: SupabaseClient<Database> | null = null;

/** Singleton Supabase client for server routes (service role, no session). */
export function getSupabaseServerClient(): SupabaseClient<Database> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }

  if (!client) {
    client = createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return client;
}
