import { NextResponse } from "next/server";
import { destroySessionCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  destroySessionCookie();
  return NextResponse.json({ ok: true });
}
