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
      vatLines: { orderBy: { rate: "asc" } },
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
  if ("docType" in body) {
    data.docType = body.docType === "Z_REPORT" ? "Z_REPORT" : "RECEIPT";
  }

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

  // KDV-uitsplitsing (optioneel): vervang de volledige set.
  let vatLinesData: { rate: number; base: number | null; amount: number }[] | null =
    null;
  if ("vatLines" in body && Array.isArray(body.vatLines)) {
    vatLinesData = body.vatLines
      .map((l: Record<string, unknown>) => {
        const rate = Number(l.rate);
        const amount = Number(l.amount);
        const baseRaw = l.base;
        const base =
          baseRaw === "" || baseRaw == null ? null : Number(baseRaw);
        return {
          rate: Number.isFinite(rate) ? rate : NaN,
          base: base != null && Number.isFinite(base) ? base : null,
          amount: Number.isFinite(amount) ? amount : 0,
        };
      })
      .filter((l: { rate: number }) => Number.isFinite(l.rate));
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (vatLinesData) {
      await tx.vatLine.deleteMany({ where: { receiptId: params.id } });
      if (vatLinesData.length > 0) {
        await tx.vatLine.createMany({
          data: vatLinesData.map((l) => ({ ...l, receiptId: params.id })),
        });
      }
    }
    return tx.receipt.update({
      where: { id: params.id },
      data,
      include: { vatLines: { orderBy: { rate: "asc" } } },
    });
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
