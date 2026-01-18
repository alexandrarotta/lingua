import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BackendError } from "../lib/backend";
import { deleteSession, listSessions, type HistorySession } from "../lib/sessionsApi";

export default function History() {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await listSessions({ limit: 60 });
        if (cancelled) return;
        setSessions(res.sessions);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof BackendError) setError(err.message);
        else setError(err instanceof Error ? err.message : "Failed to load sessions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card">
      <h2 className="cardTitle">Historial</h2>
      <p className="muted">Sesiones guardadas en SQLite local (por usuario).</p>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {loading ? <span className="muted">Cargando…</span> : null}
        {error ? <span className="muted">Error: {error}</span> : null}
        {!loading && !error && sessions.length === 0 ? <span className="muted">No hay sesiones todavía.</span> : null}
        {sessions.map((s) => (
          <div key={s.id} className="bubble">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <Link to={`/chat/${s.id}`}>
                <strong>{s.title}</strong>
              </Link>
              <span className="muted">{new Date(s.updatedAt).toLocaleString()}</span>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <Link className="pill" to={`/chat/${s.id}`}>
                Abrir
              </Link>
              <button
                onClick={() => {
                  const ok = window.confirm("¿Borrar esta sesión?");
                  if (!ok) return;
                  void (async () => {
                    try {
                      await deleteSession(s.id);
                      setSessions((prev) => prev.filter((x) => x.id !== s.id));
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : "Delete failed";
                      window.alert(msg);
                    }
                  })();
                }}
              >
                Borrar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
