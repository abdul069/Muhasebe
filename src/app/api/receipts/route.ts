import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isAccountant } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";
import { runOcr } from "@/lib/ocr";
import { parseReceipt } from "@/lib/parse";

export const runtime = "nodejs";
// OCR kan even duren; geef de request wat meer tijd.
export const maxDuration = 60;

const ALLOWED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

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

/** POST /api/receipts  -> upload een fis-foto, verwerk met OCR */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Geçersiz form verisi." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Lütfen bir fiş fotoğrafı seçin." },
      { status: 400 }
    );
  }

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.includes(mime)) {
    return NextResponse.json(
      { error: "Sadece JPG, PNG, WEBP veya HEIC formatları desteklenir." },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Dosya çok büyük (en fazla 15 MB)." },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Maak eerst het record aan (status PENDING) zodat we een id hebben voor de bestandsnaam.
  const receipt = await prisma.receipt.create({
    data: {
      userId: session.userId,
      imagePath: "",
      originalName: file.name || null,
      mimeType: mime,
      status: "PENDING",
    },
  });

  const imagePath = await saveUpload(receipt.id, buffer, mime, file.name);
  await prisma.receipt.update({
    where: { id: receipt.id },
    data: { imagePath },
  });

  // OCR + parsing. Bij fouten markeren we de bon als FAILED maar behouden de foto.
  try {
    const ocrText = await runOcr(imagePath);
    const parsed = parseReceipt(ocrText);

    const updated = await prisma.receipt.update({
      where: { id: receipt.id },
      data: {
        ocrText,
        merchant: parsed.merchant ?? null,
        receiptDate: parsed.receiptDate ?? null,
        totalAmount: parsed.totalAmount ?? null,
        taxAmount: parsed.taxAmount ?? null,
        currency: parsed.currency,
        docType: parsed.docType,
        status: "PROCESSED",
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
    return NextResponse.json({ ok: true, receipt: updated });
  } catch (err) {
    console.error("OCR error", err);
    const failed = await prisma.receipt.update({
      where: { id: receipt.id },
      data: { status: "FAILED" },
    });
    return NextResponse.json(
      {
        ok: true,
        receipt: failed,
        warning:
          "Fotoğraf yüklendi ancak otomatik okuma (OCR) başarısız oldu. Bilgileri elle girebilirsiniz.",
      },
      { status: 200 }
    );
  }
}
