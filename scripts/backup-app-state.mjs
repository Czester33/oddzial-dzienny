/**
 * Dumps Supabase app_state row into backups/ as the same { payload, updatedAt }
 * envelope that data/app-data.json uses, so a backup can be restored or diffed
 * without any conversion.
 *
 * Usage: node --env-file=.env.local scripts/backup-app-state.mjs
 */

import { mkdir, writeFile } from "fs/promises";
import { createHash } from "crypto";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const APP_STATE_ROW_ID = "default";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const backupDir = join(root, "backups");

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}. Run with: node --env-file=.env.local scripts/backup-app-state.mjs`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from("app_state")
  .select("payload, updated_at")
  .eq("id", APP_STATE_ROW_ID)
  .maybeSingle();

if (error) {
  console.error(`Supabase read failed: ${error.message}`);
  process.exit(1);
}

if (!data?.payload || typeof data.payload !== "object" || Array.isArray(data.payload)) {
  console.error("Row app_state.default is missing or holds no object payload — nothing to back up.");
  process.exit(1);
}

const keys = Object.keys(data.payload);
if (keys.length === 0) {
  console.error("Payload is an empty object — refusing to write an empty backup.");
  process.exit(1);
}

const updatedAt = data.updated_at ?? new Date().toISOString();
const document = JSON.stringify({ payload: data.payload, updatedAt }, null, 2);

// Colons are illegal in Windows filenames.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = join(backupDir, `app-state-${stamp}.json`);

await mkdir(backupDir, { recursive: true });
await writeFile(outPath, document, "utf8");

const bytes = Buffer.byteLength(document, "utf8");
const sha256 = createHash("sha256").update(document).digest("hex");

console.log(`Written:    ${outPath}`);
console.log(`updated_at: ${updatedAt}`);
console.log(`Top keys:   ${keys.length}`);
console.log(`Bytes:      ${bytes}`);
console.log(`SHA-256:    ${sha256}`);
