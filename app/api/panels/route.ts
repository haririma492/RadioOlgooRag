import { NextResponse } from "next/server";
import { fetchAllPanelsRows } from "@/lib/server/panelsCache";

export async function GET() {
  try {
    const rows = await fetchAllPanelsRows();
    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to fetch panels" }, { status: 500 });
  }
}
