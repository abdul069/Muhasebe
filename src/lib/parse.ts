/**
 * Eenvoudige parser voor Turkse kassabonnen (fis).
 * Haalt op basis van de OCR-tekst de meest waarschijnlijke waardes eruit.
 * De boekhouder kan deze velden achteraf altijd corrigeren in de UI.
 */

export interface VatLineParsed {
  rate: number; // KDV-oran in procenten (bv. 1, 10, 20; ook oud 8/18)
  base?: number; // matrah (belastbare grondslag) voor dit tarief
  amount: number; // KDV-bedrag voor dit tarief
}

export interface ParsedReceipt {
  merchant?: string;
  receiptDate?: Date;
  totalAmount?: number;
  taxAmount?: number;
  currency: string;
  docType: string; // "RECEIPT" (fiş) of "Z_REPORT" (Z raporu)
  vatLines: VatLineParsed[]; // KDV-uitsplitsing per tarief
}

// Geldige Turkse KDV-oranları (incl. historische 8/18).
const VALID_VAT_RATES = new Set([0, 1, 8, 10, 18, 20]);

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

/**
 * Bepaalt of het document een Z-raporu (dagafsluiting) is of een gewone fiş.
 */
export function detectDocType(text: string): string {
  const t = text.toLocaleUpperCase("tr-TR");
  if (
    /\bZ\s*RAPORU\b|\bZ\s*NO\b|\bZ\s*RAPOR\b|G[ÜU]NL[ÜU]K\s*KAPANI[ŞS]|KUM[ÜU]LAT[İI]F/.test(
      t
    )
  ) {
    return "Z_REPORT";
  }
  return "RECEIPT";
}

/**
 * Haalt de KDV-uitsplitsing per tarief uit de tekst.
 * Herkent regels die zowel "KDV"/"MATRAH" als een tarief-token (%1, %10, %20…) bevatten.
 * Op een Turkse fiş/Z-raporu staat de uitsplitsing meestal als:
 *   KDV %01   *5,50
 *   KDV %20   *90,00
 * of met matrah:
 *   %20  MATRAH 450,00  KDV 90,00
 */
export function parseVatBreakdown(text: string): VatLineParsed[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const map = new Map<number, { base?: number; amount?: number }>();
  // Onthoudt het lopende tarief, zodat een KDV-bedrag op de VOLGENDE regel
  // (Z-raporu "Vergi Döküm"-layout) aan het juiste tarief gekoppeld wordt:
  //   % 8 KDV     TOPLAM : 333,00
  //               KDV    :  24,67
  let currentRate: number | null = null;

  // Regels die een andere sectie starten -> lopende koppeling stoppen.
  const isReset = (u: string) =>
    /KASA|BANKA|EVRAK|[ÖO]DEME|NAK[İI]T|C[İI]RO|BAK[İI]YE|G[İI]R[İI][ŞS]|[ÇC]IKI[ŞS]/.test(
      u
    );

  for (const line of lines) {
    const upper = line.toLocaleUpperCase("tr-TR");

    if (isReset(upper)) {
      currentRate = null;
      continue;
    }
    if (/KDV\s*['`]?\s*S[İI]Z|HAR[İI][ÇC]/.test(upper)) continue; // KDV'siz / hariç

    const rateMatch = upper.match(/%\s?(\d{1,2})/);
    const rate = rateMatch ? parseInt(rateMatch[1], 10) : null;
    const isKdvLine = /KDV|K\.D\.V/.test(upper);
    const isBaseLine = /MATRAH|TOPLAM|TUTAR/.test(upper);

    if (rate !== null && VALID_VAT_RATES.has(rate)) {
      // Regel die een tarief introduceert.
      currentRate = rate;
      const amounts = amountsInLine(line).filter((n) => n !== rate);
      const entry = map.get(rate) || {};
      if (amounts.length >= 2) {
        // grondslag + KDV op één regel
        if (entry.base === undefined) entry.base = amounts[0];
        if (entry.amount === undefined) entry.amount = amounts[amounts.length - 1];
      } else if (amounts.length === 1) {
        // Bij "TOPLAM/MATRAH" is het bedrag de grondslag; anders het KDV-bedrag.
        if (isBaseLine) {
          if (entry.base === undefined) entry.base = amounts[0];
        } else if (isKdvLine) {
          if (entry.amount === undefined) entry.amount = amounts[0];
        }
      }
      map.set(rate, entry);
    } else if (currentRate !== null && (isKdvLine || isBaseLine)) {
      // Vervolgregel (zonder eigen %-token) voor het lopende tarief.
      const amounts = amountsInLine(line);
      if (amounts.length > 0) {
        const entry = map.get(currentRate) || {};
        if (isKdvLine && !isBaseLine && entry.amount === undefined) {
          entry.amount = amounts[amounts.length - 1];
        } else if (isBaseLine && !isKdvLine && entry.base === undefined) {
          entry.base = amounts[amounts.length - 1];
        }
        map.set(currentRate, entry);
        // Tarief afgerond zodra grondslag én KDV bekend zijn.
        if (entry.base !== undefined && entry.amount !== undefined) {
          currentRate = null;
        }
      }
    }
  }

  const out: VatLineParsed[] = [];
  for (const [rate, v] of map) {
    if (v.amount === undefined && v.base === undefined) continue;
    out.push({ rate, base: v.base, amount: v.amount ?? 0 });
  }
  out.sort((a, b) => a.rate - b.rate);
  return out;
}

export function parseReceipt(text: string): ParsedReceipt {
  const result: ParsedReceipt = {
    currency: detectCurrency(text),
    docType: detectDocType(text),
    vatLines: parseVatBreakdown(text),
  };

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Winkelnaam: eerste betekenisvolle regel (met minstens 2 letters),
  // met eventuele losse leestekens aan het begin eraf.
  const merchantLine = lines.find((l) => /[a-zA-ZçğıöşüÇĞİÖŞÜ]{2,}/.test(l));
  if (merchantLine) {
    result.merchant = merchantLine
      .replace(/^[^0-9A-Za-zçğıöşüÇĞİÖŞÜ]+/, "")
      .slice(0, 120);
  }

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

  // Als er een KDV-uitsplitsing is, is de som daarvan het betrouwbaarste
  // totaal-KDV. Anders vallen we terug op de grootste KDV-regel.
  if (result.vatLines.length > 0) {
    const sum = result.vatLines.reduce((s, l) => s + (l.amount || 0), 0);
    result.taxAmount = sum > 0 ? sum : tax;
  } else {
    result.taxAmount = tax;
  }

  return result;
}
