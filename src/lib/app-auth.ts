export const APP_AUTH_COOKIE = "oddzial_session";
export const APP_ADMISSIONS_EDIT_COOKIE = "oddzial_admissions_edit";

const SESSION_TIMEZONE = "Europe/Warsaw";
const SESSION_RESET_HOUR = 6;

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getDatePartsInTimeZone(ms: number, timeZone: string): DateParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(ms))
      .map(({ type, value }) => [type, value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function toUnixSecInTimeZone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): number {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 4; i++) {
    const local = getDatePartsInTimeZone(utcMs, timeZone);
    const desiredMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const actualMs = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second
    );
    utcMs += desiredMs - actualMs;
  }

  return Math.floor(utcMs / 1000);
}

/** Next daily reset at 06:00 in Europe/Warsaw (unix seconds). */
export function getNextDailyResetSec(nowMs = Date.now()): number {
  const now = getDatePartsInTimeZone(nowMs, SESSION_TIMEZONE);
  const todayResetSec = toUnixSecInTimeZone(
    now.year,
    now.month,
    now.day,
    SESSION_RESET_HOUR,
    0,
    0,
    SESSION_TIMEZONE
  );

  const nowSec = Math.floor(nowMs / 1000);
  if (nowSec < todayResetSec) {
    return todayResetSec;
  }

  const noonSec = toUnixSecInTimeZone(
    now.year,
    now.month,
    now.day,
    12,
    0,
    0,
    SESSION_TIMEZONE
  );
  const nextDay = getDatePartsInTimeZone((noonSec + 86_400) * 1000, SESSION_TIMEZONE);
  return toUnixSecInTimeZone(
    nextDay.year,
    nextDay.month,
    nextDay.day,
    SESSION_RESET_HOUR,
    0,
    0,
    SESSION_TIMEZONE
  );
}

export function getSessionCookieMaxAgeSec(nowMs = Date.now()): number {
  const nowSec = Math.floor(nowMs / 1000);
  return Math.max(60, getNextDailyResetSec(nowMs) - nowSec);
}
export function isAppAuthEnabled(): boolean {
  return Boolean(process.env.APP_ACCESS_PASSWORD?.trim());
}

export function isAdmissionsEditPinConfigured(): boolean {
  return Boolean(process.env.APP_ADMISSIONS_EDIT_PIN?.trim());
}

export function verifyAdmissionsEditPin(pin: string): boolean {
  const expected = process.env.APP_ADMISSIONS_EDIT_PIN?.trim();
  if (!expected) return true;
  return safeEqual(pin, expected);
}

function authSecret(): string | null {
  const secret = process.env.APP_ACCESS_SECRET?.trim();
  const password = process.env.APP_ACCESS_PASSWORD?.trim();
  const pin = process.env.APP_ADMISSIONS_EDIT_PIN?.trim();
  return secret || password || pin || null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (padded.length % 4)) % 4;
    const binary = atob(padded + "=".repeat(padLen));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toBase64Url(new Uint8Array(signature));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function verifyAccessPassword(password: string): boolean {
  const expected = process.env.APP_ACCESS_PASSWORD?.trim();
  if (!expected) return true;
  return safeEqual(password, expected);
}

export async function createSessionToken(nowSec = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const secret = authSecret();
  if (!secret) return null;

  const expiresAt = getNextDailyResetSec(nowSec * 1000);
  const payload = String(expiresAt);
  const signature = await hmacSign(payload, secret);
  return `${payload}.${signature}`;
}

export async function isSessionTokenValid(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  if (!isAppAuthEnabled()) return true;

  const secret = authSecret();
  if (!secret) return false;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expiresAt = Number.parseInt(payload, 10);
  if (!Number.isFinite(expiresAt)) return false;
  if (expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const expected = await hmacSign(payload, secret);
  const expectedBytes = fromBase64Url(expected);
  const actualBytes = fromBase64Url(signature);
  if (!expectedBytes || !actualBytes || expectedBytes.length !== actualBytes.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < expectedBytes.length; i++) {
    diff |= expectedBytes[i] ^ actualBytes[i];
  }
  return diff === 0;
}

export async function isAdmissionsEditTokenValid(
  token: string | undefined | null
): Promise<boolean> {
  if (!isAdmissionsEditPinConfigured()) return true;
  if (!token) return false;

  const secret = authSecret();
  if (!secret) return false;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expiresAt = Number.parseInt(payload, 10);
  if (!Number.isFinite(expiresAt)) return false;
  if (expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const expected = await hmacSign(payload, secret);
  const expectedBytes = fromBase64Url(expected);
  const actualBytes = fromBase64Url(signature);
  if (!expectedBytes || !actualBytes || expectedBytes.length !== actualBytes.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < expectedBytes.length; i++) {
    diff |= expectedBytes[i] ^ actualBytes[i];
  }
  return diff === 0;
}
