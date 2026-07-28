"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Giriş başarısız.");
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
        <h1>Giriş yap</h1>
        <p className="sub">Fişlerinizi yüklemek için hesabınıza giriş yapın.</p>

        {error && <div className="alert error">{error}</div>}

        <form onSubmit={onSubmit}>
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
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          <button className="btn block" type="submit" disabled={loading}>
            {loading ? "Giriş yapılıyor…" : "Giriş yap"}
          </button>
        </form>

        <p className="sub" style={{ marginTop: 20, marginBottom: 0 }}>
          Hesabınız yok mu? <Link href="/register">Kayıt olun</Link>
        </p>
      </div>
    </div>
  );
}
