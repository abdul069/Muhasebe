"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface VatLine {
  rate: number;
  base: number | null;
  amount: number;
}

interface ReceiptData {
  id: string;
  merchant: string | null;
  receiptDate: string; // yyyy-mm-dd of ""
  totalAmount: number | null;
  taxAmount: number | null;
  currency: string;
  note: string | null;
  status: string;
  docType: string;
  ocrText: string;
  createdAt: string;
  clientName: string;
  clientEmail: string;
  vatLines: VatLine[];
}

// KDV-regel als bewerkbare string-velden in de UI.
interface VatRow {
  rate: string;
  base: string;
  amount: string;
}

export default function ReceiptDetail({
  receipt,
  isAccountant,
}: {
  receipt: ReceiptData;
  isAccountant: boolean;
}) {
  const router = useRouter();
  const [merchant, setMerchant] = useState(receipt.merchant || "");
  const [receiptDate, setReceiptDate] = useState(receipt.receiptDate);
  const [totalAmount, setTotalAmount] = useState(
    receipt.totalAmount != null ? String(receipt.totalAmount) : ""
  );
  const [taxAmount, setTaxAmount] = useState(
    receipt.taxAmount != null ? String(receipt.taxAmount) : ""
  );
  const [currency, setCurrency] = useState(receipt.currency);
  const [note, setNote] = useState(receipt.note || "");
  const [docType, setDocType] = useState(receipt.docType || "RECEIPT");
  const [vatRows, setVatRows] = useState<VatRow[]>(
    receipt.vatLines.map((v) => ({
      rate: String(v.rate),
      base: v.base != null ? String(v.base) : "",
      amount: String(v.amount),
    }))
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function updateVatRow(i: number, field: keyof VatRow, value: string) {
    setVatRows((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r))
    );
  }
  function addVatRow() {
    setVatRows((rows) => [...rows, { rate: "20", base: "", amount: "" }]);
  }
  function removeVatRow(i: number) {
    setVatRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  const vatTotal = vatRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/receipts/${receipt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant,
        receiptDate: receiptDate || null,
        totalAmount,
        taxAmount,
        currency,
        note,
        docType,
        vatLines: vatRows
          .filter((r) => r.rate !== "" && (r.amount !== "" || r.base !== ""))
          .map((r) => ({
            rate: parseFloat(r.rate),
            base: r.base === "" ? null : parseFloat(r.base),
            amount: parseFloat(r.amount) || 0,
          })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg("Kaydedildi ✓");
      router.refresh();
    } else {
      setMsg("Kaydetme başarısız.");
    }
  }

  async function remove() {
    if (!confirm("Bu fişi silmek istediğinize emin misiniz?")) return;
    const res = await fetch(`/api/receipts/${receipt.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">🧾 Fiş Platformu</div>
        <div className="user">
          <Link href="/dashboard" style={{ color: "#fff" }}>
            ← Panele dön
          </Link>
        </div>
      </div>

      <div className="container">
        <div className="grid-2">
          {/* Foto + OCR */}
          <div>
            <div className="card">
              <h2>Fiş fotoğrafı</h2>
              <p className="muted">
                {receipt.clientName} · {new Date(receipt.createdAt).toLocaleString("tr-TR")}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="detail-img"
                src={`/api/receipts/${receipt.id}/image`}
                alt="fiş"
              />
            </div>

            <div className="card">
              <h2>OCR metni (ham)</h2>
              <p className="muted">Sistemin fotoğraftan okuduğu ham metin.</p>
              <div className="ocr-box">
                {receipt.ocrText || "(Metin okunamadı)"}
              </div>
            </div>
          </div>

          {/* Bewerkbare velden */}
          <div>
            <div className="card">
              <h2>Fiş bilgileri</h2>
              <p className="muted">
                Otomatik okunan bilgileri kontrol edin ve gerekirse düzeltin.
              </p>

              {msg && <div className="alert success">{msg}</div>}

              <form onSubmit={save}>
                <div className="field">
                  <label>Belge tipi</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                  >
                    <option value="RECEIPT">Fiş (kasa fişi)</option>
                    <option value="Z_REPORT">Z Raporu (gün sonu)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Satıcı / Mağaza</label>
                  <input
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    placeholder="Örn. Migros"
                  />
                </div>
                <div className="field">
                  <label>Tarih</label>
                  <input
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                  />
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>Toplam tutar</label>
                    <input
                      type="number"
                      step="0.01"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="field">
                    <label>KDV</label>
                    <input
                      type="number"
                      step="0.01"
                      value={taxAmount}
                      onChange={(e) => setTaxAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Para birimi</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="TRY">TRY (₺)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
                <div className="field">
                  <label>KDV dağılımı (orana göre)</label>
                  <p
                    className="muted"
                    style={{ margin: "0 0 8px", fontSize: 13 }}
                  >
                    Hangi tutarın hangi KDV oranına ait olduğunu buradan
                    görebilir ve düzeltebilirsiniz. Özellikle Z raporlarında
                    önemlidir.
                  </p>
                  <div className="table-wrap">
                    <table className="vat-table">
                      <thead>
                        <tr>
                          <th>Oran %</th>
                          <th>Matrah</th>
                          <th>KDV tutarı</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {vatRows.length === 0 && (
                          <tr>
                            <td colSpan={4} className="muted">
                              KDV satırı yok.
                            </td>
                          </tr>
                        )}
                        {vatRows.map((row, i) => (
                          <tr key={i}>
                            <td>
                              <input
                                type="number"
                                step="1"
                                value={row.rate}
                                onChange={(e) =>
                                  updateVatRow(i, "rate", e.target.value)
                                }
                                style={{ width: 70 }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                value={row.base}
                                onChange={(e) =>
                                  updateVatRow(i, "base", e.target.value)
                                }
                                placeholder="—"
                                style={{ width: 110 }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                value={row.amount}
                                onChange={(e) =>
                                  updateVatRow(i, "amount", e.target.value)
                                }
                                placeholder="0.00"
                                style={{ width: 110 }}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn secondary"
                                onClick={() => removeVatRow(i)}
                                style={{ padding: "4px 10px" }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2} style={{ fontWeight: 600 }}>
                            Toplam KDV
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {vatTotal.toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={addVatRow}
                    style={{ marginTop: 8 }}
                  >
                    + KDV satırı ekle
                  </button>
                </div>

                <div className="field">
                  <label>Not</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="Opsiyonel not…"
                  />
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <button className="btn" type="submit" disabled={saving}>
                    {saving ? "Kaydediliyor…" : "Kaydet"}
                  </button>
                  <button
                    className="btn danger"
                    type="button"
                    onClick={remove}
                  >
                    Sil
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
