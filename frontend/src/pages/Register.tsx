import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BackendError } from "../lib/backend";
import { useAuth } from "../state/authContext";

export default function RegisterPage() {
  const auth = useAuth();
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password !== password2) {
      setError("Las passwords no coinciden.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await auth.register(email, password);
      nav("/", { replace: true });
    } catch (err) {
      if (err instanceof BackendError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Register failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid2">
      <div className="card">
        <h1 className="cardTitle">Crear cuenta</h1>
        <p className="muted">Cuenta local para separar historial por usuario.</p>

        <form onSubmit={submit} style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label>
            Password (mín. 8)
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirmación
            <input
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>

          {error ? <div className="muted">Error: {error}</div> : null}

          <div className="row" style={{ marginTop: 6 }}>
            <button
              className="btnPrimary"
              type="submit"
              disabled={busy || !email.trim() || !password.trim() || password !== password2}
            >
              {busy ? "Creando…" : "Crear cuenta"}
            </button>
            <Link className="pill" to="/login">
              Volver a login
            </Link>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="cardTitle">Seguridad</h2>
        <p className="muted">La password se hashea (bcrypt) y el backend guarda el historial por usuario en SQLite local.</p>
      </div>
    </div>
  );
}
