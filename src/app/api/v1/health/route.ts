import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", service: "sgc-ubs", mode: isDemoMode() ? "demo" : "supabase", timestamp: new Date().toISOString() });
}
