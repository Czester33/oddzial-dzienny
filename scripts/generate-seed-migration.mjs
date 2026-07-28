import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = join(root, "data", "app-data.json");
const json = readFileSync(jsonPath, "utf8");
JSON.parse(json);

const tag = "app_data_seed_json";
const sql = `-- Seed local app data from data/app-data.json into Supabase app_state.
-- Run after 20260721120000_initial_app_state.sql.
-- Generated from local filesystem snapshot.

insert into public.app_state (id, payload)
values (
  'default',
  $${tag}$
${json.trim()}
$${tag}$::jsonb
)
on conflict (id) do update set
  payload = excluded.payload,
  updated_at = timezone('utc', now());
`;

const outPath = join(root, "supabase", "migrations", "20260721183000_seed_local_app_data.sql");
writeFileSync(outPath, sql, "utf8");
console.log(`Written: ${outPath}`);
console.log(`Bytes: ${Buffer.byteLength(sql, "utf8")}`);
