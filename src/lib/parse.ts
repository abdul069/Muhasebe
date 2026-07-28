/**
 * Eenvoudige parser voor Turkse kassabonnen (fis).
 * Haalt op basis van de OCR-tekst de meest waarschijnlijke waardes eruit.
 * De boekhouder kan deze velden achteraf altijd corrigeren in de UI.
 */

export interface ParsedReceipt {
  merchant?: string;
  receiptDate?: Date;
  totalAmount?: number;
  taxAmount?: number;
  currency: string;
}

/**
 * Zet een Turks geformatteerd bedrag (bv. "1.234,56" of "12,50") om naar number.
 */
export function parseTurkishAmount(raw: string): number | undefined {
  let s = raw.replace(/[^\d.,]/g, "").trim();
  if (!s) return undefined;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // punt = duizendtal-scheiding, komma = decimaal  ->  1.234,56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // alleen komma = decimaalteken  ->  12,50
    s = s.replace(",", ".");
  }
  // alleen punt: laten staan (kan al 12.50 zijn)

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

// Vindt bedragen zoals 1.234,56 / 12,50 / 12.50 / 100
const AMOUNT_RE = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/g;

function amountsInLine(line: string): number[] {
  const out: number[] = [];
  const matches = line.match(AMOUNT_RE);
  if (!matches) return out;
  for (const m of matches) {
    const n = parseTurkishAmount(m);
    if (n !== undefined) out.push(n);
  }
  return out;
}

function detectCurrency(text: string): string {
  const t = text.toLocaleUpperCase("tr-TR");
  if (/€|EUR\b/.test(t)) return "EUR";
  if (/\$|USD\b/.test(t)) return "USD";
  if (/£|GBP\b/.test(t)) return "GBP";
  // ₺, TL, TRY -> Turkse Lira
  return "TRY";
}

/**
 * Zoekt een datum in formaten dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy (ook 2-cijferig jaar).
 */
export function parseReceiptDate(text: string): Date | undefined {
  const re = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/;
  const m = text.match(re);
  if (!m) return undefined;

  let [, dd, mm, yy] = m;
  let year = parseInt(yy, 10);
  if (year < 100) year += 2000;
  const day = parseInt(dd, 10);
  const month = parseInt(mm, 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseReceipt(text: string): ParsedReceipt {
  const result: ParsedReceipt = { currency: detectCurrency(text) };

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Winkelnaam: eerste betekenisvolle regel (met minstens 2 letters).
  const merchantLine = lines.find((l) => /[a-zA-ZçğıöşüÇĞİÖŞÜ]{2,}/.test(l));
  if (merchantLine) result.merchant = merchantLine.slice(0, 120);

  result.receiptDate = parseReceiptDate(text);

  let total: number | undefined;
  let tax: number | undefined;

  for (const line of lines) {
    const upper = line.toLocaleUpperCase("tr-TR");
    const amounts = amountsInLine(line);
    if (amounts.length === 0) continue;
    const maxInLine = Math.max(...amounts);

    // KDV (btw)-regels. Sla "KDV'SIZ" / "KDV HARIÇ" over.
    const isKdv = /KDV|\bK\.D\.V/.test(upper);
    const kdvExcluded = /KDV\s*['`]?\s*S[İI]Z|HAR[İI][ÇC]/.test(upper);
    if (isKdv && !kdvExcluded) {
      if (tax === undefined || maxInLine > tax) tax = maxInLine;
    }

    // Totaal-regels. "ARA TOPLAM" (subtotaal) tellen we niet als eindtotaal.
    const isTotal = /TOPLAM|GENEL\s*TOP|TOP\b|TUTAR|ODENECEK|ÖDENECEK/.test(
      upper
    );
    const isSubtotal = /ARA\s*TOPLAM/.test(upper);
    if (isTotal && !isSubtotal) {
      // Het eindtotaal is doorgaans het grootste "TOPLAM"-bedrag.
      if (total === undefined || maxInLine > total) total = maxInLine;
    }
  }

  result.totalAmount = total;
  result.taxAmount = tax;
  return result;
}
