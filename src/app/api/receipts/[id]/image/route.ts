import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isInsideUploadDir } from "@/lib/storage";

export const runtime = "nodejs";

/** GET /api/receipts/:id/image -> serveert de originele fis-foto */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const receipt = await prisma.receipt.findUnique({
    where: { id: params.id },
  });
  if (!receipt || !receipt.imagePath) {
    return NextResponse.json({ error: "Görsel bulunamadı." }, { status: 404 });
  }
  if (session.role !== "ACCOUNTANT" && receipt.userId !== session.userId) {
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
  }
  if (!isInsideUploadDir(receipt.imagePath)) {
    return NextResponse.json({ error: "Geçersiz yol." }, { status: 400 });
  }

  try {
    const data = await fs.readFile(receipt.imagePath);
    return new NextResponse(data as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": receipt.mimeType || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Dosya okunamadı." }, { status: 404 });
  }
}
