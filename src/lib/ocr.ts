import { createWorker } from "tesseract.js";

/**
 * Voert OCR uit op een afbeeldingsbestand en geeft de herkende ruwe tekst terug.
 * Standaard Turks + Engels (fallback). Talen instelbaar via OCR_LANGS in .env.
 *
 * Let op: tesseract.js downloadt bij de eerste run de taalmodellen (tur/eng).
 * Zorg dus dat de server internettoegang heeft, of host de traineddata lokaal.
 */
export async function runOcr(imagePath: string): Promise<string> {
  const langs = process.env.OCR_LANGS || "tur+eng";
  const worker = await createWorker(langs);
  try {
    const { data } = await worker.recognize(imagePath);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}
