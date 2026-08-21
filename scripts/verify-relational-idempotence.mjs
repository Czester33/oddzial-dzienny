/**
 * Loads AppData from the tables, writes the very same document back, and loads
 * it again. Any difference is a mapping defect, because nothing else changed.
 *
 * Unlike verify-relational-roundtrip.mjs this needs no backup file, so it stays
 * meaningful after the application has mutated the data on its own.
 *
 * Usage: node --env-file=.env.local scripts/verify-relational-idempotence.mjs
 */

import { createSupabase, diff } from "./lib/backup-file.mjs";

const supabase = createSupabase();

const before = await supabase.rpc("app_data_load");
if (before.error) throw new Error(`app_data_load: ${before.error.message}`);

const revision = await supabase.rpc("app_data_revision");
if (revision.error) throw new Error(`app_data_revision: ${revision.error.message}`);

const saved = await supabase.rpc("app_data_save", {
  p_payload: before.data,
  p_base_updated_at: revision.data,
});
if (saved.error) throw new Error(`app_data_save: ${saved.error.message}`);
if (!saved.data?.ok) throw new Error(`zapis odrzucony: ${JSON.stringify(saved.data)}`);

const after = await supabase.rpc("app_data_load");
if (after.error) throw new Error(`app_data_load: ${after.error.message}`);

const problems = diff(before.data, after.data);

console.log(`Klucze: ${Object.keys(before.data).length}`);
if (problems.length === 0) {
  console.log("Zapis i odczyt są neutralne — mapowanie nie gubi danych.");
} else {
  console.log(`\nRóżnice: ${problems.length}`);
  for (const p of problems.slice(0, 40)) console.log(`  ${p}`);
  if (problems.length > 40) console.log(`  ... i ${problems.length - 40} więcej`);
  process.exitCode = 1;
}
