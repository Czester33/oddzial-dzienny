/**
 * Loads the newest backup into the relational tables via the app_data_save RPC.
 * Passing a null base revision skips the optimistic-lock check, which is what a
 * backfill wants. app_state is not touched.
 *
 * Usage: node --env-file=.env.local scripts/backfill-relational.mjs
 */

import { createSupabase, readNewestBackup } from "./lib/backup-file.mjs";

const backup = readNewestBackup();
console.log(`Źródło: ${backup.name} (updatedAt ${backup.updatedAt})`);

const supabase = createSupabase();
const { data, error } = await supabase.rpc("app_data_save", {
  p_payload: backup.payload,
  p_base_updated_at: null,
});

if (error) {
  console.error(`RPC app_data_save nie powiodło się: ${error.message}`);
  if (error.details) console.error(error.details);
  if (error.hint) console.error(`Hint: ${error.hint}`);
  process.exitCode = 1;
} else if (!data?.ok) {
  console.error(`Zapis odrzucony: ${JSON.stringify(data)}`);
  process.exitCode = 1;
} else {
  console.log(`Backfill OK. app_revision.updated_at = ${data.updatedAt}`);
}
