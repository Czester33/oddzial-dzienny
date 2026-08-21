import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Newest file written by scripts/backup-app-state.mjs. */
export function readNewestBackup() {
  const dir = join(root, "backups");
  const files = readdirSync(dir).filter((f) => f.startsWith("app-state-") && f.endsWith(".json"));
  if (files.length === 0) {
    throw new Error("No backup found. Run: npm run backup:app-state");
  }
  const name = files.sort().pop();
  const parsed = JSON.parse(readFileSync(join(dir, name), "utf8"));
  return { name, payload: parsed.payload, updatedAt: parsed.updatedAt };
}

export function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Run with: node --env-file=.env.local ...`);
  }
  return value;
}

export function createSupabase() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Structural diff. Object key order is irrelevant in JSON, array order is not,
 * so arrays are compared positionally.
 */
export function diff(expected, actual, path = "", out = []) {
  const type = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
  const te = type(expected);
  const ta = type(actual);

  if (te !== ta) {
    out.push(`${path || "<root>"}: typ ${te} != ${ta}`);
    return out;
  }

  if (te === "array") {
    if (expected.length !== actual.length) {
      out.push(`${path}: długość ${expected.length} != ${actual.length}`);
    }
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
      diff(expected[i], actual[i], `${path}[${i}]`, out);
    }
    return out;
  }

  if (te === "object") {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      const inE = key in expected;
      const inA = key in actual;
      const child = path ? `${path}.${key}` : key;
      if (!inA) out.push(`${child}: brak w bazie (oczekiwano ${JSON.stringify(expected[key])?.slice(0, 80)})`);
      else if (!inE) out.push(`${child}: nadmiarowe w bazie (${JSON.stringify(actual[key])?.slice(0, 80)})`);
      else diff(expected[key], actual[key], child, out);
    }
    return out;
  }

  if (expected !== actual) {
    out.push(`${path}: ${JSON.stringify(expected)} != ${JSON.stringify(actual)}`);
  }
  return out;
}
