import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BackendError } from "../lib/backend";
import { useAuth } from "../state/authContext";

export default function ResetPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const tokenFromUrl = params.get("token") ?? "";

  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const canSubmit = useMemo(() => {
    if (!token.trim()) return false;
    if (newPassword.trim().length < 8) return false;
    if (newPassword !== newPassword2) return false;
    return true;
  }, [token, newPassword, newPassword2]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    setDone(false);
    try {
      await auth.resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      if (err instanceof BackendError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid2">
      <div className="card">
        <h1 className="cardTitle">Reset password</h1>
        <p className="muted">Pega el token (o usa el link del backend) y define una password nueva.</p>

        <form onSubmit={submit} style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <label>
            Token
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="reset token" />
          </label>
          <label>
            Nueva password
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirmación
            <input
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>

          {done ? (
            <div className="muted">Password cambiada. Inicia sesión nuevamente.</div>
          ) : null}
          {error ? <div className="muted">Error: {error}</div> : null}

          <div className="row" style={{ marginTop: 6 }}>
            <button className="btnPrimary" type="submit" disabled={!canSubmit || busy}>
              {busy ? "Guardando…" : "Reset"}
            </button>
            <Link className="pill" to="/login">
              Volver a login
            </Link>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="cardTitle">Nota</h2>
        <p className="muted">Por seguridad, el token expira a los 30 min y no se puede reutilizar.</p>
      </div>
    </div>
  );
}
