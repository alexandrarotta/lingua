import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SettingsPanel from "../components/SettingsPanel";
import { BackendError } from "../lib/backend";
import { createSession } from "../lib/sessionsApi";

export default function Onboarding() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const s = await createSession({ title: "New session" });
      nav(`/chat/${s.id}`);
    } catch (err) {
      if (err instanceof BackendError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid2">
      <div className="card">
        <h1 className="cardTitle">Lingua · Local-first</h1>
        <p className="muted">
          Lingua Coach: coach de conversación por voz (local-first). Por defecto inglés; en Settings puedes cambiar el
          idioma del Chat. Obtén corrección y feedback de “pronunciación” aproximado por diff de palabras.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btnPrimary" onClick={() => void start()} disabled={busy}>
            {busy ? "Creando…" : "Crear sesión y empezar"}
          </button>
          <Link className="pill" to="/history">
            Ver historial
          </Link>
        </div>
        {error ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Error: {error}
          </p>
        ) : null}
        <p className="muted" style={{ marginTop: 12 }}>
          Tip: si tu navegador no soporta SpeechRecognition, usa el input de texto.
        </p>
      </div>
      <SettingsPanel />
    </div>
  );
}
