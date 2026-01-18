import React, { useState } from "react";
import { Link } from "react-router-dom";
import { BackendError } from "../lib/backend";
import { useAuth } from "../state/authContext";

export default function ForgotPage() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ message: string; resetUrl: string | null; resetToken: string | null } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await auth.forgotPassword(email);
      setResult(r);
    } catch (err) {
      if (err instanceof BackendError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid2">
      <div className="card">
        <h1 className="cardTitle">Recuperar password</h1>
        <p className="muted">Modo local: el backend devuelve un link/código (sin email real).</p>

        <form onSubmit={submit} style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          {error ? <div className="muted">Error: {error}</div> : null}
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btnPrimary" type="submit" disabled={busy || !email.trim()}>
              {busy ? "Generando…" : "Generar link"}
            </button>
            <Link className="pill" to="/login">
              Volver a login
            </Link>
          </div>
        </form>

        {result ? (
          <div className="bubble" style={{ marginTop: 14 }}>
            <strong>Resultado</strong>
            <div className="muted" style={{ marginTop: 6 }}>
              {result.message}
            </div>
            {result.resetUrl ? (
              <div style={{ marginTop: 10 }}>
                <div className="muted">Reset URL (dev):</div>
                <a href={result.resetUrl}>{result.resetUrl}</a>
              </div>
            ) : null}
            {result.resetToken ? (
              <div style={{ marginTop: 10 }}>
                <div className="muted">Reset token (dev):</div>
                <code>{result.resetToken}</code>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2 className="cardTitle">Siguiente paso</h2>
        <p className="muted">
          Abre el link de reset (o copia el token) y elige una password nueva.
        </p>
      </div>
    </div>
  );
}
