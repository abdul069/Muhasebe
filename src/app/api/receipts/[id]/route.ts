import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { requireUser, isAccountant } from "@/lib/auth";
import { isInsideUploadDir } from "@/lib/storage";

export const runtime = "nodejs";

async function loadOwned(id: string, session: { userId: string; role: string }) {
  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, companyName: true, email: true } },
    },
  });
  if (!receipt) return null;
  // Klant mag alleen eigen bonnen; boekhouder mag alles.
  if (session.role !== "ACCOUNTANT" && receipt.userId !== session.userId) {
    return "forbidden" as const;
  }
  return receipt;
}

/** GET /api/receipts/:id */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const receipt = await loadOwned(params.id, auth.session);
  if (!receipt)
    return NextResponse.json({ error: "Fiş bulunamadı." }, { status: 404 });
  if (receipt === "forbidden")
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });

  return NextResponse.json({ receipt });
}

/** PATCH /api/receipts/:id -> corrigeer geparste velden */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await loadOwned(params.id, auth.session);
  if (!existing)
    return NextResponse.json({ error: "Fiş bulunamadı." }, { status: 404 });
  if (existing === "forbidden")
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if ("merchant" in body) data.merchant = body.merchant?.toString() || null;
  if ("note" in body) data.note = body.note?.toString() || null;
  if ("currency" in body) data.currency = body.currency?.toString() || "TRY";

  if ("receiptDate" in body) {
    const d = body.receiptDate ? new Date(body.receiptDate) : null;
    data.receiptDate = d && !Number.isNaN(d.getTime()) ? d : null;
  }
  if ("totalAmount" in body) {
    const n = body.totalAmount === "" || body.totalAmount == null
      ? null
      : Number(body.totalAmount);
    data.totalAmount = n != null && Number.isFinite(n) ? n : null;
  }
  if ("taxAmount" in body) {
    const n = body.taxAmount === "" || body.taxAmount == null
      ? null
      : Number(body.taxAmount);
    data.taxAmount = n != null && Number.isFinite(n) ? n : null;
  }

  const updated = await prisma.receipt.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ ok: true, receipt: updated });
}

/** DELETE /api/receipts/:id */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await loadOwned(params.id, auth.session);
  if (!existing)
    return NextResponse.json({ error: "Fiş bulunamadı." }, { status: 404 });
  if (existing === "forbidden")
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });

  // Verwijder de fysieke foto (best-effort).
  if (existing.imagePath && isInsideUploadDir(existing.imagePath)) {
    await fs.unlink(existing.imagePath).catch(() => {});
  }
  await prisma.receipt.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
