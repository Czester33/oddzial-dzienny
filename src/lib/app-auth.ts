export const APP_AUTH_COOKIE = "oddzial_session";
const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

export function isAppAuthEnabled(): boolean {
  return Boolean(process.env.APP_ACCESS_PASSWORD?.trim());
}

function authSecret(): string | null {
  const secret = process.env.APP_ACCESS_SECRET?.trim();
  const password = process.env.APP_ACCESS_PASSWORD?.trim();
  return secret || password || null;
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

  const expiresAt = nowSec + SESSION_TTL_SEC;
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

export const APP_AUTH_SESSION_MAX_AGE = SESSION_TTL_SEC;
