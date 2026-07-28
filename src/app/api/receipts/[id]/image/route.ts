import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/receipts/:id/image
 * Controleert de toegang en stuurt door naar de (onraadbare) Blob-URL.
 * Zo blijft de DB-gekoppelde toegang bewaakt.
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
    select: { userId: true, imageUrl: true },
  });
  if (!receipt || !receipt.imageUrl) {
    return NextResponse.json({ error: "Görsel bulunamadı." }, { status: 404 });
  }
  if (session.role !== "ACCOUNTANT" && receipt.userId !== session.userId) {
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
  }

  return NextResponse.redirect(receipt.imageUrl);
}
