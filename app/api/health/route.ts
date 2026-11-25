import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, database: hasDatabase() }, { headers: { "Cache-Control": "no-store" } });
}
