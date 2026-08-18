import { NextResponse } from "next/server";
import {
  APP_ADMISSIONS_EDIT_COOKIE,
  createSessionToken,
  getSessionCookieMaxAgeSec,
  isAdmissionsEditPinConfigured,
  isAdmissionsEditTokenValid,
  verifyAdmissionsEditPin,
} from "@/lib/app-auth";

function editCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getSessionCookieMaxAgeSec(),
  };
}

export async function GET(request: Request) {
  if (!isAdmissionsEditPinConfigured()) {
    return NextResponse.json({ required: false, unlocked: true });
  }

  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${APP_ADMISSIONS_EDIT_COOKIE}=([^;]+)`)
  );
  const token = match?.[1] ? decodeURIComponent(match[1]) : "";
  const unlocked = await isAdmissionsEditTokenValid(token);
  return NextResponse.json({ required: true, unlocked });
}

export async function POST(request: Request) {
  if (!isAdmissionsEditPinConfigured()) {
    return NextResponse.json({ ok: true, required: false, unlocked: true });
  }

  let pin = "";
  try {
    const body = (await request.json()) as { pin?: string };
    pin = typeof body.pin === "string" ? body.pin : "";
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe żądanie" }, { status: 400 });
  }

  if (!verifyAdmissionsEditPin(pin)) {
    return NextResponse.json({ error: "Nieprawidłowy PIN" }, { status: 401 });
  }

  const token = await createSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Brak konfiguracji uwierzytelniania" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, required: true, unlocked: true });
  response.cookies.set(APP_ADMISSIONS_EDIT_COOKIE, token, editCookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({
    ok: true,
    required: isAdmissionsEditPinConfigured(),
    unlocked: !isAdmissionsEditPinConfigured(),
  });
  response.cookies.set(APP_ADMISSIONS_EDIT_COOKIE, "", {
    ...editCookieOptions(),
    maxAge: 0,
  });
  return response;
}
