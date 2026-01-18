import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BackendError } from "../lib/backend";
import { useAuth } from "../state/authContext";

export default function LoginPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const from = (loc.state as { from?: string } | null)?.from || "/";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await auth.login(email, password);
      nav(from, { replace: true });
    } catch (err) {
      if (err instanceof BackendError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (auth.user) {
    return (
      <div className="card">
        <h2 className="cardTitle">Ya estás logueado</h2>
        <p className="muted">{auth.user.email}</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btnPrimary" onClick={() => nav("/", { replace: true })}>
            Ir a la app
          </button>
          <button onClick={() => void auth.logout()}>Logout</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid2">
      <div className="card">
        <h1 className="cardTitle">Login</h1>
        <p className="muted">Ingresa a tu cuenta local.</p>

        <form onSubmit={submit} style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>

          {error ? <div className="muted">Error: {error}</div> : null}

          <div className="row" style={{ marginTop: 6 }}>
            <button className="btnPrimary" type="submit" disabled={busy || !email.trim() || !password.trim()}>
              {busy ? "Entrando…" : "Login"}
            </button>
            <Link className="pill" to="/register">
              Crear cuenta
            </Link>
            <Link className="pill" to="/forgot">
              Olvidé mi password
            </Link>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="cardTitle">Notas</h2>
        <p className="muted">Todo corre en local. No se envía audio al servidor; solo texto.</p>
      </div>
    </div>
  );
}
