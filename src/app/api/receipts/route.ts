import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isAccountant } from "@/lib/auth";
import { parseReceipt } from "@/lib/parse";

export const runtime = "nodejs";

/** GET /api/receipts  -> lijst met bonnen (klant: eigen, boekhouder: alle) */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");

  const where: Record<string, unknown> = {};
  if (isAccountant(session)) {
    if (clientId) where.userId = clientId;
  } else {
    where.userId = session.userId;
  }

  const receipts = await prisma.receipt.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, companyName: true } },
    },
  });

  return NextResponse.json({ receipts });
}

/**
 * POST /api/receipts
 * De browser heeft de foto al naar Blob geüpload en OCR (client-side) gedaan.
 * Hier ontvangen we alleen metadata; de server parseert de OCR-tekst en slaat op.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Geçersiz veri." }, { status: 400 });
  }

  const imageUrl = String(body.imageUrl || "");
  if (!/^https:\/\/[^\s]+/.test(imageUrl)) {
    return NextResponse.json(
      { error: "Geçerli bir görsel URL'si gerekli." },
      { status: 400 }
    );
  }

  const ocrText = typeof body.ocrText === "string" ? body.ocrText : "";
  const mimeType = body.mimeType ? String(body.mimeType) : null;
  const originalName = body.originalName ? String(body.originalName) : null;

  // Server-side parsen (parser blijft de bron van waarheid).
  const parsed = parseReceipt(ocrText);
  const ocrFailed = ocrText.trim().length === 0;

  const receipt = await prisma.receipt.create({
    data: {
      userId: session.userId,
      imageUrl,
      originalName,
      mimeType,
      ocrText: ocrText || null,
      merchant: parsed.merchant ?? null,
      receiptDate: parsed.receiptDate ?? null,
      totalAmount: parsed.totalAmount ?? null,
      taxAmount: parsed.taxAmount ?? null,
      currency: parsed.currency,
      docType: parsed.docType,
      status: ocrFailed ? "FAILED" : "PROCESSED",
      processedAt: new Date(),
      vatLines: {
        create: parsed.vatLines.map((l) => ({
          rate: l.rate,
          base: l.base ?? null,
          amount: l.amount,
        })),
      },
    },
    include: { vatLines: true },
  });

  return NextResponse.json({
    ok: true,
    receipt,
    ...(ocrFailed
      ? {
          warning:
            "Fotoğraf yüklendi ancak metin okunamadı. Bilgileri elle girebilirsiniz.",
        }
      : {}),
  });
}
