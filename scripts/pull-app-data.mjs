import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { list } from "@vercel/blob";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = join(root, "data", "app-data.json");
const envFile = join(root, ".env.local");
const BLOB_NAME = "oddzial-dzienny/app-data.json";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function writeLocalDocument(payload) {
  const dataDir = join(root, "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const doc =
    payload && typeof payload === "object" && "data" in payload && "updatedAt" in payload
      ? { payload: payload.data, updatedAt: payload.updatedAt }
      : { payload, updatedAt: new Date().toISOString() };
  writeFileSync(dataFile, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return doc.updatedAt;
}

async function pullFromBlob(token) {
  process.env.BLOB_READ_WRITE_TOKEN = token;
  const { blobs } = await list({ prefix: "oddzial-dzienny/" });
  const blob = blobs.find((b) => b.pathname === BLOB_NAME);
  if (!blob) throw new Error("Nie znaleziono pliku danych na Vercel Blob.");

  const response = await fetch(blob.url);
  if (!response.ok) throw new Error(`Blob HTTP ${response.status}`);
  const raw = await response.json();
  const updatedAt =
    raw && typeof raw === "object" && typeof raw.updatedAt === "string"
      ? raw.updatedAt
      : blob.uploadedAt
        ? new Date(blob.uploadedAt).toISOString()
        : new Date().toISOString();
  const data =
    raw && typeof raw === "object" && raw.payload && typeof raw.payload === "object"
      ? raw.payload
      : raw;
  return writeLocalDocument({ data, updatedAt });
}

async function pullFromProduction(baseUrl, password) {
  const loginRes = await fetch(new URL("/api/auth/login", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!loginRes.ok) {
    throw new Error(`Logowanie nieudane (HTTP ${loginRes.status}).`);
  }

  const cookie = loginRes.headers.get("set-cookie");
  const dataRes = await fetch(new URL("/api/data", baseUrl), {
    headers: cookie ? { Cookie: cookie.split(";")[0] } : {},
  });
  if (!dataRes.ok) {
    throw new Error(`Pobieranie danych nieudane (HTTP ${dataRes.status}).`);
  }

  const json = await dataRes.json();
  const payload =
    json && typeof json === "object" && "data" in json && "updatedAt" in json
      ? json
      : { data: json, updatedAt: new Date().toISOString() };
  return writeLocalDocument(payload);
}

const env = { ...loadEnvFile(envFile), ...process.env };
const blobToken = env.BLOB_READ_WRITE_TOKEN?.trim();
const productionUrl = (env.PRODUCTION_URL || env.APP_PRODUCTION_URL || "").replace(/\/$/, "");
const localUrl = (env.LOCAL_URL || "http://localhost:3000").replace(/\/$/, "");
const password = env.APP_ACCESS_PASSWORD?.trim();

try {
  let updatedAt;
  if (blobToken) {
    updatedAt = await pullFromBlob(blobToken);
    console.log(`Pobrano z Vercel Blob → ${dataFile}`);
  } else if (productionUrl && password) {
    updatedAt = await pullFromProduction(productionUrl, password);
    console.log(`Pobrano z ${productionUrl} → ${dataFile}`);
  } else if (password) {
    updatedAt = await pullFromProduction(localUrl, password);
    console.log(`Pobrano z ${localUrl} → ${dataFile}`);
  } else {
    console.error(
      "Brak konfiguracji. Ustaw w .env.local:\n" +
        "  BLOB_READ_WRITE_TOKEN=...  (dane z produkcji / Vercel Blob)\n" +
        "  lub PRODUCTION_URL=https://twoja-aplikacja.vercel.app + APP_ACCESS_PASSWORD\n" +
        "  lub APP_ACCESS_PASSWORD (pobierze z działającego localhost:3000)"
    );
    process.exit(1);
  }
  console.log(`updatedAt: ${updatedAt}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
