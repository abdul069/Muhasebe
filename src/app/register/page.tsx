"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, companyName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Kayıt başarısız.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Sunucuya bağlanılamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">🧾 Fiş Platformu</div>
        <h1>Kayıt ol</h1>
        <p className="sub">
          Müşteri hesabı oluşturun ve fişlerinizi dijital olarak gönderin.
        </p>

        {error && <div className="alert error">{error}</div>}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Ad Soyad</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Adınız Soyadınız"
              required
            />
          </div>
          <div className="field">
            <label>Firma adı (opsiyonel)</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Firma Ltd. Şti."
            />
          </div>
          <div className="field">
            <label>E-posta</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@firma.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label>Şifre</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 6 karakter"
              required
              autoComplete="new-password"
            />
          </div>
          <button className="btn block" type="submit" disabled={loading}>
            {loading ? "Kaydediliyor…" : "Kayıt ol"}
          </button>
        </form>

        <p className="sub" style={{ marginTop: 20, marginBottom: 0 }}>
          Zaten hesabınız var mı? <Link href="/login">Giriş yapın</Link>
        </p>
      </div>
    </div>
  );
}
