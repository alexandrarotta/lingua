import React, { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { LinguaDb } from "./db/db";
import { AppStateProvider } from "./state/AppState";
import { AuthProvider } from "./state/AuthProvider";
import { useAuth } from "./state/authContext";
import { PronunciationGuideProvider, usePronunciationGuide } from "./state/PronunciationGuide";
import type { AiProfile } from "./state/aiProfiles";
import Onboarding from "./pages/Onboarding";
import Chat from "./pages/Chat";
import History from "./pages/History";
import LessonsPage from "./pages/Lessons";
import LessonRunnerPage from "./pages/LessonRunner";
import ReviewPage from "./pages/Review";
import SettingsPage from "./pages/Settings";
import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import ForgotPage from "./pages/Forgot";
import ResetPage from "./pages/Reset";
import PronunciationGuideModal from "./components/PronunciationGuideModal";
import VoiceSecurityBanner from "./components/VoiceSecurityBanner";
import RequireAuth from "./components/RequireAuth";

export default function App() {
  const [db, setDb] = useState<LinguaDb | null>(null);
  const [initialProfiles, setInitialProfiles] = useState<AiProfile[] | null>(null);
  const [initialActiveProfileId, setInitialActiveProfileId] = useState<string | null>(null);
  const [sqliteError, setSqliteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setSqliteError(null);
        const opened = await LinguaDb.open();
        if (cancelled) return;
        setDb(opened);
        setInitialProfiles(opened.listAiProfiles());
        setInitialActiveProfileId(opened.getActiveAiProfileId());
      } catch (err) {
        console.error("Error cargando SQLite (sql.js)", err);
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setSqliteError(msg || "Unknown error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (sqliteError) {
    return (
      <div className="container">
        <div className="card">
          <h1 className="cardTitle">Lingua</h1>
          <p style={{ marginTop: 8, fontWeight: 600 }}>Error cargando SQLite (sql.js)</p>
          <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
            {sqliteError}
          </p>
          <button className="pill" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!db || !initialProfiles || !initialActiveProfileId) {
    return (
      <div className="container">
        <div className="card">
          <h1 className="cardTitle">Lingua</h1>
          <p className="muted">Cargando SQLite (sql.js)…</p>
        </div>
      </div>
    );
  }

  return (
    <PronunciationGuideProvider>
      <AuthProvider>
        <AppStateProvider
          db={db}
          initialProfiles={initialProfiles}
          initialActiveProfileId={initialActiveProfileId}
        >
          <AppShell />
        </AppStateProvider>
      </AuthProvider>
    </PronunciationGuideProvider>
  );
}

function AppShell() {
  const guide = usePronunciationGuide();
  const auth = useAuth();

  return (
    <div className="container">
      <header className="topbar">
        <div className="brand">
          <div className="brandTitle">Lingua</div>
          <span className="pill muted">local-first</span>
        </div>
        <nav className="nav">
          {auth.user ? (
            <>
              <Link className="pill" to="/">
                Onboarding
              </Link>
              <Link className="pill" to="/lessons">
                Lessons
              </Link>
              <Link className="pill" to="/review">
                Review
              </Link>
              <button className="pill" onClick={() => guide.open()} aria-label="Open pronunciation guide">
                IPA
              </button>
              <Link className="pill" to="/history">
                History
              </Link>
              <Link className="pill" to="/settings">
                Settings
              </Link>
              <span className="pill muted">{auth.user.email}</span>
              <button className="pill" onClick={() => void auth.logout()}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link className="pill" to="/login">
                Login
              </Link>
              <Link className="pill" to="/register">
                Register
              </Link>
            </>
          )}
        </nav>
      </header>

      <VoiceSecurityBanner />

      <main style={{ marginTop: 16 }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot" element={<ForgotPage />} />
          <Route path="/reset" element={<ResetPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/" element={<Onboarding />} />
            <Route path="/chat/:sessionId" element={<Chat />} />
            <Route path="/history" element={<History />} />
            <Route path="/lessons" element={<LessonsPage />} />
            <Route path="/lessons/:lessonId" element={<LessonRunnerPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <PronunciationGuideModal />
    </div>
  );
}
