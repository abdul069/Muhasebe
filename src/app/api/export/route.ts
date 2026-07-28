import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireUser, isAccountant } from "@/lib/auth";

export const runtime = "nodejs";

function fmtDate(d: Date | null): string {
  if (!d) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = d.getUTCFullYear();
  return `${dd}.${mm}.${yy}`;
}

/** GET /api/export -> genereert een Excel (.xlsx) met alle (gefilterde) bonnen */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");

  const where: Record<string, unknown> = {};
  if (isAccountant(session)) {
    if (clientId) where.userId = clientId;
  } else {
    where.userId = session.userId;
  }

  const receipts = await prisma.receipt.findMany({
    where,
    orderBy: { receiptDate: "asc" },
    include: {
      user: { select: { name: true, companyName: true, email: true } },
      vatLines: { orderBy: { rate: "asc" } },
    },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Muhasebe Fiş Platformu";
  wb.created = new Date();
  const ws = wb.addWorksheet("Fişler");

  ws.columns = [
    { header: "Tarih", key: "date", width: 12 },
    { header: "Belge Tipi", key: "docType", width: 14 },
    { header: "Müşteri / Firma", key: "client", width: 28 },
    { header: "Satıcı / Mağaza", key: "merchant", width: 30 },
    { header: "Toplam Tutar", key: "total", width: 15 },
    { header: "KDV", key: "tax", width: 12 },
    { header: "Para Birimi", key: "currency", width: 12 },
    { header: "Durum", key: "status", width: 12 },
    { header: "Not", key: "note", width: 24 },
    { header: "Yüklenme", key: "created", width: 18 },
  ];

  // Kopregel opmaken.
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" },
  };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  const statusLabel: Record<string, string> = {
    PENDING: "Bekliyor",
    PROCESSED: "İşlendi",
    FAILED: "Okunamadı",
  };
  const docTypeLabel: Record<string, string> = {
    RECEIPT: "Fiş",
    Z_REPORT: "Z Raporu",
  };

  for (const r of receipts) {
    ws.addRow({
      date: fmtDate(r.receiptDate),
      docType: docTypeLabel[r.docType] || r.docType,
      client: r.user.companyName || r.user.name,
      merchant: r.merchant || "",
      total: r.totalAmount ?? "",
      tax: r.taxAmount ?? "",
      currency: r.currency || "TRY",
      status: statusLabel[r.status] || r.status,
      note: r.note || "",
      created: fmtDate(r.createdAt),
    });
  }

  // Bedrag-kolommen als getal met 2 decimalen.
  ws.getColumn("total").numFmt = "#,##0.00";
  ws.getColumn("tax").numFmt = "#,##0.00";

  // Totaalregel onderaan.
  const totalSum = receipts.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const taxSum = receipts.reduce((s, r) => s + (r.taxAmount || 0), 0);
  const totalRow = ws.addRow({
    merchant: "TOPLAM",
    total: totalSum,
    tax: taxSum,
  });
  totalRow.font = { bold: true };

  // ---- Tweede blad: KDV-uitsplitsing per tarief ----
  const vatWs = wb.addWorksheet("KDV Dağılımı");
  vatWs.columns = [
    { header: "Tarih", key: "date", width: 12 },
    { header: "Belge Tipi", key: "docType", width: 14 },
    { header: "Müşteri / Firma", key: "client", width: 28 },
    { header: "Satıcı / Mağaza", key: "merchant", width: 28 },
    { header: "KDV Oranı (%)", key: "rate", width: 14 },
    { header: "Matrah", key: "base", width: 14 },
    { header: "KDV Tutarı", key: "vat", width: 14 },
  ];
  vatWs.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  vatWs.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" },
  };

  // Per-tarief-totalen om onderaan te tonen.
  const rateTotals = new Map<number, { base: number; vat: number }>();

  for (const r of receipts) {
    for (const v of r.vatLines) {
      vatWs.addRow({
        date: fmtDate(r.receiptDate),
        docType: docTypeLabel[r.docType] || r.docType,
        client: r.user.companyName || r.user.name,
        merchant: r.merchant || "",
        rate: v.rate,
        base: v.base ?? "",
        vat: v.amount ?? "",
      });
      const t = rateTotals.get(v.rate) || { base: 0, vat: 0 };
      t.base += v.base || 0;
      t.vat += v.amount || 0;
      rateTotals.set(v.rate, t);
    }
  }

  vatWs.getColumn("base").numFmt = "#,##0.00";
  vatWs.getColumn("vat").numFmt = "#,##0.00";

  // Samenvatting per KDV-oran onderaan.
  vatWs.addRow({});
  const sumHeader = vatWs.addRow({ merchant: "ORANA GÖRE ÖZET" });
  sumHeader.font = { bold: true };
  for (const rate of Array.from(rateTotals.keys()).sort((a, b) => a - b)) {
    const t = rateTotals.get(rate)!;
    const row = vatWs.addRow({
      merchant: `%${rate}`,
      rate,
      base: t.base,
      vat: t.vat,
    });
    row.font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `fisler-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
