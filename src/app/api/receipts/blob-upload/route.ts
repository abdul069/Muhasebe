import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Token-endpoint voor directe client-uploads naar Vercel Blob.
 * De browser vraagt hier een tijdelijk token op en uploadt de foto vervolgens
 * RECHTSTREEKS naar Blob (omzeilt de 4,5 MB request-limiet van serverless).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // Alleen ingelogde gebruikers mogen uploaden.
        const session = await getSession();
        if (!session) {
          throw new Error("Oturum açmanız gerekiyor.");
        }
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
          ],
          maximumSizeInBytes: 15 * 1024 * 1024, // 15 MB
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: session.userId }),
        };
      },
      onUploadCompleted: async () => {
        // Niets te doen; het Receipt-record wordt via POST /api/receipts gemaakt.
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Yükleme başlatılamadı." },
      { status: 400 }
    );
  }
}
