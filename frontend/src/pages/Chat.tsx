import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PronunciationTokens from "../components/PronunciationTokens";
import { coachTurn } from "../lib/api";
import { BackendError } from "../lib/backend";
import { addTurn, createSession, getSession, listTurns, type HistoryTurn } from "../lib/sessionsApi";
import {
  createSpeechRecognition,
  formatSpeechRecognitionError,
  isSpeechRecognitionAvailable,
  isVoiceSecureContext,
  speak
} from "../lib/speech";
import type { PronunciationToken } from "../lib/diffTokens";
import { resolveLearningLangTag } from "../lib/learningLangPrefs";
import type { AiProfile } from "../state/aiProfiles";
import { useAppState } from "../state/AppState";
import { usePronunciationGuide } from "../state/PronunciationGuide";

function safeJsonParseObject(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type CoachMeta = {
  transcriptText: string;
  correctedUserText: string;
  explanationEs: string;
  styleSuggestions: unknown[];
  assistantReplyText: string;
  targetText: string;
  pronunciationTokens: PronunciationToken[];
  providerUsed: string;
  warning?: string | null;
};

export default function Chat() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const { profiles, activeProfileId, sessionApiKeys, learningLangSetting } = useAppState();
  const guide = usePronunciationGuide();

  const id = sessionId || "";
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [sessionTitle, setSessionTitle] = useState<string>("");
  const [turns, setTurns] = useState<HistoryTurn[]>([]);
  const turnsRef = useRef<HistoryTurn[]>([]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recogRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    void (async () => {
      setError("");
      try {
        const [s, t] = await Promise.all([getSession(id), listTurns({ sessionId: id, limit: 200 })]);
        if (cancelled) return;
        setSessionTitle(s.title);
        setTurns(t.turns);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof BackendError) setError(err.message);
        else setError(err instanceof Error ? err.message : "Failed to load session");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  const speechSupported = useMemo(() => isSpeechRecognitionAvailable(), []);
  const sttSecure = useMemo(() => isVoiceSecureContext(), []);
  const sttReady = speechSupported && sttSecure;

  const activeProfile = useMemo<AiProfile>(() => {
    return profiles.find((p) => p.id === activeProfileId) ?? profiles[0]!;
  }, [profiles, activeProfileId]);

  const apiKey = sessionApiKeys[activeProfile.id] ?? "";
  const learningLanguageTag = useMemo(() => resolveLearningLangTag(learningLangSetting), [learningLangSetting]);

  const lastAssistantText = useMemo(() => {
    const last = [...turns].reverse().find((m) => m.role === "assistant");
    return last?.text ?? "";
  }, [turns]);

  const lastCoachMeta = useMemo<CoachMeta | null>(() => {
    const last = [...turns].reverse().find((t) => t.role === "assistant" && t.metaJson);
    if (!last?.metaJson) return null;
    const obj = safeJsonParseObject(last.metaJson);
    if (!obj) return null;

    const tokens = Array.isArray(obj.pronunciationTokens) ? (obj.pronunciationTokens as PronunciationToken[]) : [];
    const style = Array.isArray(obj.styleSuggestions) ? obj.styleSuggestions : [];
    return {
      transcriptText: String(obj.transcriptText ?? ""),
      correctedUserText: String(obj.correctedUserText ?? ""),
      explanationEs: String(obj.explanationEs ?? ""),
      styleSuggestions: style,
      assistantReplyText: String(obj.assistantReplyText ?? last.text),
      targetText: String(obj.targetText ?? ""),
      pronunciationTokens: tokens,
      providerUsed: String(obj.providerUsed ?? ""),
      warning: obj.warning == null ? null : String(obj.warning)
    };
  }, [turns]);

  async function ensureSessionForSend(titleHint: string) {
    if (id) return id;
    const created = await createSession({ title: titleHint.trim().slice(0, 40) || "New session" });
    nav(`/chat/${created.id}`, { replace: true });
    setSessionTitle(created.title);
    return created.id;
  }

  async function sendTurn(input: { transcriptText: string; targetText?: string; kind: "chat" | "practice" }) {
    const transcript = input.transcriptText.trim();
    if (!transcript) return;

    setError("");
    setBusy(true);
    try {
      const sessionId = await ensureSessionForSend(transcript);

      const existing = turnsRef.current;
      const conversationMessages = [...existing, { role: "user" as const, text: transcript }]
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.text })) as Array<{ role: "user" | "assistant"; content: string }>;

      const userTurn = await addTurn({
        sessionId,
        role: "user",
        text: transcript,
        meta: { kind: input.kind }
      });
      setTurns((prev) => [...prev, userTurn]);

      const res = await coachTurn({
        transcriptText: transcript,
        targetText: input.targetText,
        sessionId,
        conversationMessages,
        learningLanguageTag,
        profile: activeProfile,
        apiKey: apiKey || undefined
      });

      const assistantTurn = await addTurn({
        sessionId,
        role: "assistant",
        text: res.assistantReplyText,
        meta: {
          kind: input.kind,
          transcriptText: res.transcriptText,
          correctedUserText: res.correctedUserText,
          explanationEs: res.explanationEs,
          styleSuggestions: res.styleSuggestions,
          assistantReplyText: res.assistantReplyText,
          targetText: res.targetText,
          pronunciationTokens: res.pronunciationTokens,
          providerUsed: res.providerUsed,
          warning: res.warning ?? null
        }
      });
      setTurns((prev) => [...prev, assistantTurn]);

      speak(res.assistantReplyText, { lang: learningLanguageTag });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
      setDraft("");
    }
  }

  function startListeningFor(kind: "chat" | "practice", targetText?: string) {
    if (!speechSupported) {
      setError("SpeechRecognition no disponible. Usa el input de texto.");
      return;
    }
    if (!sttSecure) {
      setError("Voz requiere HTTPS o localhost (micrófono bloqueado en HTTP por IP/LAN).");
      return;
    }
    if (listening) return;

    const recog = createSpeechRecognition();
    if (!recog) {
      setError("SpeechRecognition no disponible.");
      return;
    }
    recogRef.current = recog;

    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = learningLanguageTag;

    let finalTranscript = "";

    recog.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results.item(i);
        const alt = r.item(0);
        if (alt?.transcript) text += alt.transcript;
        if (r.isFinal) finalTranscript += alt.transcript;
      }
      setDraft(text.trim());
    };

    recog.onerror = (e) => {
      setError(formatSpeechRecognitionError(e));
    };

    recog.onend = () => {
      setListening(false);
      recogRef.current = null;
      const t = finalTranscript.trim();
      if (t) void sendTurn({ transcriptText: t, targetText, kind });
    };

    setListening(true);
    recog.start();
  }

  function onStopListening() {
    setListening(false);
    try {
      recogRef.current?.abort();
      recogRef.current = null;
    } catch {
      // ignore
    }
  }

  const tokens = useMemo<PronunciationToken[]>(() => {
    return lastCoachMeta?.pronunciationTokens ?? [];
  }, [lastCoachMeta]);

  return (
    <div className="grid2">
      <div className="card chat">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="cardTitle" style={{ margin: 0 }}>
            Chat {sessionTitle ? <span className="muted">· {sessionTitle}</span> : null}
          </h2>
          <div className="row">
            <button onClick={() => guide.open()}>IPA</button>
            <button onClick={() => nav("/settings")}>Settings</button>
            <button onClick={() => nav("/history")}>History</button>
          </div>
        </div>

        <div className="messages" aria-label="messages">
          {turns.map((m) => (
            <div
              key={m.id}
              className={`bubble ${m.role === "user" ? "bubbleUser" : "bubbleAssistant"}`}
            >
              {m.text}
              <div className="bubbleMeta">
                {m.role === "user" ? "You" : "Assistant"} · {new Date(m.createdAt).toLocaleTimeString()}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="row">
          <button className="btnPrimary" onClick={() => startListeningFor("chat")} disabled={!sttReady || listening || busy}>
            Hablar
          </button>
          <button onClick={onStopListening} disabled={!listening}>
            Detener
          </button>
          <button onClick={() => speak(lastAssistantText, { lang: learningLanguageTag })} disabled={!lastAssistantText}>
            Repetir respuesta
          </button>
          <button
            onClick={() => speak(lastCoachMeta?.correctedUserText ?? "", { lang: learningLanguageTag })}
            disabled={!lastCoachMeta?.correctedUserText}
          >
            Escuchar correcto
          </button>
          <button
            onClick={() => {
              if (!lastAssistantText) return;
              speak(lastAssistantText, { lang: learningLanguageTag });
              window.setTimeout(() => startListeningFor("practice", lastAssistantText), 500);
            }}
            disabled={!sttReady || listening || busy || !lastAssistantText}
          >
            Repetir frase
          </button>
        </div>

        <div className="row">
          <input
            value={draft}
            placeholder={sttReady ? "Puedes escribir o usar Hablar…" : "Escribe tu mensaje…"}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            style={{ flex: 1, minWidth: 240 }}
          />
          <button className="btnPrimary" onClick={() => void sendTurn({ transcriptText: draft, kind: "chat" })} disabled={busy || !draft.trim()}>
            Enviar
          </button>
        </div>

        {error ? <div className="muted">Error: {error}</div> : null}
      </div>

      <div className="card">
        <h2 className="cardTitle">Feedback</h2>
        {!lastCoachMeta ? (
          <p className="muted">Habla o envía texto para ver corrección y tokens.</p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Provider: <strong>{lastCoachMeta.providerUsed}</strong>
              {lastCoachMeta.warning ? ` · ${lastCoachMeta.warning}` : ""}
            </p>
            <div className="bubble">
              <strong>Transcript</strong>
              <div style={{ marginTop: 6 }}>{lastCoachMeta.transcriptText}</div>
            </div>
            <div className="bubble" style={{ marginTop: 10 }}>
              <strong>Corrected</strong>
              <div style={{ marginTop: 6 }}>{lastCoachMeta.correctedUserText}</div>
            </div>
            <div className="bubble" style={{ marginTop: 10 }}>
              <strong>Explicación (ES)</strong>
              <div style={{ marginTop: 6 }}>{lastCoachMeta.explanationEs}</div>
            </div>
            <div className="bubble" style={{ marginTop: 10 }}>
              <strong>Sugerencias</strong>
              <ul className="muted" style={{ margin: "8px 0 0 16px" }}>
                {lastCoachMeta.styleSuggestions.map((s, i) => (
                  <li key={i}>{String(s)}</li>
                ))}
              </ul>
            </div>

            <div style={{ marginTop: 12 }}>
              <strong>Pronunciación (diff)</strong>
              <PronunciationTokens tokens={tokens} />
              <p className="muted" style={{ marginTop: 8 }}>
                ok = coincide · missing = faltó · extra = de más · substituted = diferente
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
