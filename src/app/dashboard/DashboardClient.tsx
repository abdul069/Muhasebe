"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { runClientOcr } from "@/lib/ocr-client";
import { compressImage } from "@/lib/image-client";

interface UserInfo {
  name: string;
  email: string;
  role: string;
}

interface ReceiptUser {
  id: string;
  name: string;
  companyName: string | null;
}

interface Receipt {
  id: string;
  merchant: string | null;
  receiptDate: string | null;
  totalAmount: number | null;
  taxAmount: number | null;
  currency: string | null;
  status: string;
  docType: string;
  createdAt: string;
  user: ReceiptUser;
}

interface Client {
  id: string;
  name: string;
  companyName: string | null;
  email: string;
  _count: { receipts: number };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR");
}

function fmtMoney(n: number | null, cur: string | null): string {
  if (n == null) return "—";
  return `${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${cur || "TRY"}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    PROCESSED: { cls: "processed", label: "İşlendi" },
    PENDING: { cls: "pending", label: "Bekliyor" },
    FAILED: { cls: "failed", label: "Okunamadı" },
  };
  const s = map[status] || { cls: "pending", label: status };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export default function DashboardClient({ user }: { user: UserInfo }) {
  const router = useRouter();
  const isAccountant = user.role === "ACCOUNTANT";

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientFilter, setClientFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [message, setMessage] = useState<{
    type: "error" | "success" | "warning";
    text: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    const qs = clientFilter ? `?clientId=${clientFilter}` : "";
    const res = await fetch(`/api/receipts${qs}`);
    if (res.ok) {
      const data = await res.json();
      setReceipts(data.receipts);
    }
    setLoading(false);
  }, [clientFilter]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  useEffect(() => {
    if (isAccountant) {
      fetch("/api/clients")
        .then((r) => (r.ok ? r.json() : { clients: [] }))
        .then((d) => setClients(d.clients || []));
    }
  }, [isAccountant]);

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setMessage(null);
    const list = Array.from(files);
    let ok = 0;
    let warn = 0;
    let failed = 0;

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const prefix = list.length > 1 ? `(${i + 1}/${list.length}) ` : "";
      try {
        // 1) OCR in de browser (client-side).
        setUploadStatus(`${prefix}Metin okunuyor (OCR)…`);
        let ocrText = "";
        try {
          ocrText = await runClientOcr(file, (p) =>
            setUploadStatus(
              `${prefix}Metin okunuyor (OCR)… %${Math.round(p * 100)}`
            )
          );
        } catch {
          ocrText = ""; // OCR mislukte; foto wordt toch bewaard
        }

        // 2) Foto in de browser verkleinen/comprimeren.
        setUploadStatus(`${prefix}Fotoğraf hazırlanıyor…`);
        const compressed = await compressImage(file);

        // 3) Foto + metadata naar de server sturen (server parseert de OCR-tekst
        //    en slaat de afbeelding op in de database).
        setUploadStatus(`${prefix}Kaydediliyor…`);
        const res = await fetch("/api/receipts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: compressed.dataUrl,
            mimeType: compressed.mimeType,
            originalName: file.name || null,
            ocrText,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          ok++;
          if (data.warning) warn++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    setUploading(false);
    setUploadStatus("");
    if (fileRef.current) fileRef.current.value = "";

    if (ok > 0) {
      setMessage({
        type: warn > 0 || failed > 0 ? "warning" : "success",
        text:
          warn > 0
            ? `${ok} fiş yüklendi, ${warn} tanesi otomatik okunamadı — bilgileri elle girebilirsiniz.`
            : `${ok} fiş başarıyla yüklendi ve okundu.`,
      });
    } else {
      setMessage({ type: "error", text: "Yükleme başarısız oldu." });
    }
    loadReceipts();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const exportUrl = `/api/export${
    clientFilter ? `?clientId=${clientFilter}` : ""
  }`;

  const totalSum = receipts.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const taxSum = receipts.reduce((s, r) => s + (r.taxAmount || 0), 0);

  return (
    <>
      <div className="topbar">
        <div className="brand">🧾 Fiş Platformu</div>
        <div className="user">
          <span className="role-pill">
            {isAccountant ? "Muhasebeci" : "Müşteri"}
          </span>
          <span>{user.name}</span>
          <button className="btn secondary" onClick={logout}>
            Çıkış
          </button>
        </div>
      </div>

      <div className="container">
        {message && (
          <div className={`alert ${message.type}`}>{message.text}</div>
        )}

        {/* Klant: upload-vak */}
        {!isAccountant && (
          <div className="card">
            <h2>Fiş yükle</h2>
            <p className="muted">
              Kasa fişinizin fotoğrafını çekin veya seçin. Sistem otomatik
              olarak okur (OCR) ve muhasebecinize iletir.
            </p>
            <label
              htmlFor="receipt-file"
              className="dropzone"
              style={{ display: "block" }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onUpload(e.dataTransfer.files);
              }}
            >
              <div className="icon">📸</div>
              <p>
                {uploading
                  ? uploadStatus || "İşleniyor…"
                  : "Fotoğraf çekin veya galeriden seçin"}
              </p>
              {!uploading && (
                <>
                  <span
                    className="btn"
                    style={{ marginTop: 8, pointerEvents: "none" }}
                  >
                    Fotoğraf seç
                  </span>
                  <p
                    className="muted"
                    style={{ margin: "10px 0 0", fontSize: 13 }}
                  >
                    Metin okuma (OCR) tarayıcınızda çalışır; ilk seferde Türkçe
                    dil dosyası indirilir.
                  </p>
                </>
              )}
            </label>
            <input
              id="receipt-file"
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => onUpload(e.target.files)}
            />
          </div>
        )}

        {/* Overzicht / statistieken */}
        <div className="stat-row">
          <div className="stat">
            <div className="label">Toplam fiş</div>
            <div className="value">{receipts.length}</div>
          </div>
          <div className="stat">
            <div className="label">Toplam tutar</div>
            <div className="value">{fmtMoney(totalSum, "TRY")}</div>
          </div>
          <div className="stat">
            <div className="label">Toplam KDV</div>
            <div className="value">{fmtMoney(taxSum, "TRY")}</div>
          </div>
        </div>

        <div className="card">
          <div className="toolbar">
            <div className="left">
              <h2 style={{ margin: 0 }}>Fişler</h2>
              {isAccountant && (
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                  }}
                >
                  <option value="">Tüm müşteriler</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName || c.name} ({c._count.receipts})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <a className="btn success" href={exportUrl}>
              ⬇ Excel indir
            </a>
          </div>

          {loading ? (
            <div className="empty">Yükleniyor…</div>
          ) : receipts.length === 0 ? (
            <div className="empty">
              Henüz fiş yok.
              {!isAccountant && " Yukarıdan ilk fişinizi yükleyin."}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Foto</th>
                    <th>Tarih</th>
                    <th>Belge</th>
                    {isAccountant && <th>Müşteri</th>}
                    <th>Satıcı</th>
                    <th>Tutar</th>
                    <th>KDV</th>
                    <th>Durum</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="thumb"
                          src={`/api/receipts/${r.id}/image`}
                          alt="fiş"
                        />
                      </td>
                      <td>{fmtDate(r.receiptDate)}</td>
                      <td>
                        {r.docType === "Z_REPORT" ? (
                          <span className="badge zreport">Z Raporu</span>
                        ) : (
                          <span className="badge receipt">Fiş</span>
                        )}
                      </td>
                      {isAccountant && (
                        <td>{r.user.companyName || r.user.name}</td>
                      )}
                      <td>{r.merchant || "—"}</td>
                      <td>{fmtMoney(r.totalAmount, r.currency)}</td>
                      <td>{fmtMoney(r.taxAmount, r.currency)}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td>
                        <Link href={`/dashboard/receipt/${r.id}`}>
                          Detay →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
