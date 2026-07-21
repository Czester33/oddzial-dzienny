import { NextResponse } from "next/server";
import { loadData, saveData } from "@/lib/data-store";
import type { AppData } from "@/lib/types";

export async function GET() {
  try {
    const data = await loadData();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/data error:", error);
    return NextResponse.json({ error: "Nie udało się wczytać danych" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const data = (await request.json()) as AppData;
    await saveData(data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PUT /api/data error:", error);
    return NextResponse.json({ error: "Nie udało się zapisać danych" }, { status: 500 });
  }
}
