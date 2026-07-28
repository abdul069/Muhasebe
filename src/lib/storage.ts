import { promises as fs } from "fs";
import path from "path";

export function uploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR || "./uploads");
}

export async function ensureUploadDir(): Promise<string> {
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "application/pdf": ".pdf",
};

export function extForMime(mime: string, fallbackName?: string): string {
  if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  if (fallbackName) {
    const e = path.extname(fallbackName);
    if (e) return e.toLowerCase();
  }
  return ".bin";
}

/** Slaat een geuploade buffer op en geeft het absolute pad terug. */
export async function saveUpload(
  id: string,
  buffer: Buffer,
  mime: string,
  originalName?: string
): Promise<string> {
  const dir = await ensureUploadDir();
  const filename = `${id}${extForMime(mime, originalName)}`;
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, buffer);
  return fullPath;
}

/** Beveiliging: zorg dat een opgeslagen pad binnen de uploadmap valt. */
export function isInsideUploadDir(filePath: string): boolean {
  const dir = uploadDir();
  const resolved = path.resolve(filePath);
  return resolved.startsWith(dir + path.sep) || resolved === dir;
}
