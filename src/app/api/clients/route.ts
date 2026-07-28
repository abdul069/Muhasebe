import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isAccountant } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/clients -> lijst van klanten (alleen voor boekhouders) */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  if (!isAccountant(auth.session)) {
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
  }

  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: {
      id: true,
      name: true,
      companyName: true,
      email: true,
      _count: { select: { receipts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ clients });
}
