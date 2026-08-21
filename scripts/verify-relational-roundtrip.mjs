/**
 * Reassembles AppData from the relational tables and compares it with the
 * backup it was built from. This is the gate for switching the app over:
 * anything other than "brak różnic" means the mapping loses information.
 *
 * Usage: node --env-file=.env.local scripts/verify-relational-roundtrip.mjs
 */

import { createSupabase, diff, readNewestBackup } from "./lib/backup-file.mjs";

const backup = readNewestBackup();
const supabase = createSupabase();

const { data, error } = await supabase.rpc("app_data_load");
if (error) {
  console.error(`RPC app_data_load nie powiodło się: ${error.message}`);
  process.exitCode = 1;
}

const expectedKeys = Object.keys(backup.payload).sort();
const actualKeys = Object.keys(data ?? {}).sort();
console.log(`Klucze: backup ${expectedKeys.length}, baza ${actualKeys.length}`);

const problems = diff(backup.payload, data ?? {});

if (problems.length === 0) {
  console.log("Round-trip: brak różnic.");
} else {
  console.log(`\nRóżnice: ${problems.length}`);
  const grouped = new Map();
  for (const p of problems) {
    const top = p.split(/[.[]/)[0];
    if (!grouped.has(top)) grouped.set(top, []);
    grouped.get(top).push(p);
  }
  for (const [top, list] of [...grouped].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${top} (${list.length}):`);
    for (const p of list.slice(0, 6)) console.log(`  ${p}`);
    if (list.length > 6) console.log(`  ... i ${list.length - 6} więcej`);
  }
  // exitCode rather than exit(): the Supabase client keeps handles open and an
  // immediate exit crashes libuv on Windows.
  process.exitCode = 1;
}
