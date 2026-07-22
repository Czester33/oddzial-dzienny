import { NextResponse } from "next/server";
import { loadDataRevision, saveDataRevision } from "@/lib/data-store";
import type { AppData } from "@/lib/types";

export async function GET() {
  try {
    const revision = await loadDataRevision();
    return NextResponse.json({
      data: revision.data,
      updatedAt: revision.updatedAt,
    });
  } catch (error) {
    console.error("GET /api/data error:", error);
    return NextResponse.json({ error: "Nie udało się wczytać danych" }, { status: 500 });
  }
}

type PutBody = {
  data?: AppData;
  baseUpdatedAt?: string;
} & Partial<AppData>;

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as PutBody;

    // Backward compatible: raw AppData body still accepted (forces overwrite of known version).
    const isEnvelope = body && typeof body === "object" && "data" in body && body.data;
    const data = (isEnvelope ? body.data : body) as AppData;
    const baseUpdatedAt =
      (isEnvelope && typeof body.baseUpdatedAt === "string" && body.baseUpdatedAt) ||
      (await loadDataRevision()).updatedAt;

    const result = await saveDataRevision(data, baseUpdatedAt);

    if (!result.ok) {
      return NextResponse.json(
        {
          conflict: true,
          data: result.data,
          updatedAt: result.updatedAt,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, updatedAt: result.updatedAt });
  } catch (error) {
    console.error("PUT /api/data error:", error);
    return NextResponse.json({ error: "Nie udało się zapisać danych" }, { status: 500 });
  }
}
