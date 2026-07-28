import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/receipts/:id/image
 * Controleert de toegang en serveert de originele foto uit de database.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const receipt = await prisma.receipt.findUnique({
    where: { id: params.id },
    select: { userId: true, imageData: true, mimeType: true },
  });
  if (!receipt || !receipt.imageData) {
    return NextResponse.json({ error: "Görsel bulunamadı." }, { status: 404 });
  }
  if (session.role !== "ACCOUNTANT" && receipt.userId !== session.userId) {
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
  }

  const bytes = Buffer.from(receipt.imageData);
  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": receipt.mimeType || "image/jpeg",
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(bytes.length),
    },
  });
}
