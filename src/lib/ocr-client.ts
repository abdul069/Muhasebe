"use client";

/**
 * Voert OCR uit in de BROWSER van de klant (client-side).
 * Zo blijft de serverless-functie licht en zijn er geen time-outs.
 *
 * @param file         de geselecteerde afbeelding
 * @param onProgress   optionele voortgang (0..1) voor een progressbar
 */
export async function runClientOcr(
  file: File | Blob,
  onProgress?: (ratio: number) => void
): Promise<string> {
  // Dynamisch importeren zodat tesseract.js niet in de initiële bundle zit.
  const Tesseract = (await import("tesseract.js")).default;
  const langs = process.env.NEXT_PUBLIC_OCR_LANGS || "tur+eng";
  const worker = await Tesseract.createWorker(langs, undefined, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(m.progress);
      }
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}
