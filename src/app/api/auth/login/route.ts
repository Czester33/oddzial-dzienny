import { NextResponse } from "next/server";
import {
  APP_AUTH_COOKIE,
  APP_AUTH_SESSION_MAX_AGE,
  createSessionToken,
  isAppAuthEnabled,
  verifyAccessPassword,
} from "@/lib/app-auth";

export async function POST(request: Request) {
  if (!isAppAuthEnabled()) {
    return NextResponse.json({ ok: true });
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe żądanie" }, { status: 400 });
  }

  if (!verifyAccessPassword(password)) {
    return NextResponse.json({ error: "Nieprawidłowe hasło" }, { status: 401 });
  }

  const token = await createSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Brak konfiguracji uwierzytelniania" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(APP_AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: APP_AUTH_SESSION_MAX_AGE,
  });
  return response;
}
