"use client";

export interface CompressedImage {
  dataUrl: string; // "data:image/jpeg;base64,..."
  mimeType: string;
  bytes: number;
}

/**
 * Verkleint en comprimeert een afbeelding in de BROWSER met een canvas.
 * Zo blijft de foto klein genoeg om (a) onder de serverless request-limiet te
 * blijven en (b) compact in de database op te slaan, met behoud van leesbaarheid.
 *
 * @param file    de gekozen afbeelding
 * @param maxDim  maximale breedte/hoogte in pixels (standaard 2000)
 * @param quality JPEG-kwaliteit 0..1 (standaard 0.8)
 */
export async function compressImage(
  file: File | Blob,
  maxDim = 2000,
  quality = 0.8
): Promise<CompressedImage> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Geen canvas beschikbaar: val terug op het origineel.
    return { dataUrl, mimeType: file.type || "image/jpeg", bytes: dataUrl.length };
  }
  // Witte achtergrond (voor transparante bronnen) en tekenen.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const out = canvas.toDataURL("image/jpeg", quality);
  return { dataUrl: out, mimeType: "image/jpeg", bytes: out.length };
}

function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Afbeelding kon niet geladen worden."));
    img.src = src;
  });
}
