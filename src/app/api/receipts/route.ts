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
    omit: { imageData: true, ocrText: true }, // geen zware velden in de lijst
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

  // Afbeelding komt als data-URL of kale base64 binnen.
  const imageBase64 = String(body.imageBase64 || "");
  const base64 = imageBase64.includes(",")
    ? imageBase64.slice(imageBase64.indexOf(",") + 1)
    : imageBase64;
  if (!base64) {
    return NextResponse.json(
      { error: "Görsel verisi gerekli." },
      { status: 400 }
    );
  }
  let imageData: Buffer;
  try {
    imageData = Buffer.from(base64, "base64");
  } catch {
    return NextResponse.json({ error: "Geçersiz görsel." }, { status: 400 });
  }
  // Extra veiligheidsmarge onder de serverless request-limiet.
  if (imageData.length > 8 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Görsel çok büyük." },
      { status: 413 }
    );
  }

  const ocrText = typeof body.ocrText === "string" ? body.ocrText : "";
  const mimeType = body.mimeType ? String(body.mimeType) : "image/jpeg";
  const originalName = body.originalName ? String(body.originalName) : null;

  // Server-side parsen (parser blijft de bron van waarheid).
  const parsed = parseReceipt(ocrText);
  const ocrFailed = ocrText.trim().length === 0;

  const receipt = await prisma.receipt.create({
    data: {
      userId: session.userId,
      imageData,
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
    omit: { imageData: true },
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
