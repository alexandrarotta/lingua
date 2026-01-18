import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PronunciationTokens from "../components/PronunciationTokens";
import { diffTokens, type PronunciationToken } from "../lib/diffTokens";
import {
  createSpeechRecognition,
  formatSpeechRecognitionError,
  isSpeechRecognitionAvailable,
  isVoiceSecureContext,
  speak
} from "../lib/speech";
import { learningLangBaseFromTag, resolveLearningLangTag } from "../lib/learningLangPrefs";
import { tokenAccuracy } from "../lessons/scoring";
import { useAppState } from "../state/AppState";
import { usePronunciationGuide } from "../state/PronunciationGuide";

export default function ReviewPage() {
  const { db, learningLangSetting } = useAppState();
  const guide = usePronunciationGuide();
  const speechSupported = useMemo(() => isSpeechRecognitionAvailable(), []);
  const sttSecure = useMemo(() => isVoiceSecureContext(), []);
  const sttReady = speechSupported && sttSecure;
  const recogRef = useRef<SpeechRecognition | null>(null);
  const learningLanguageTag = useMemo(() => resolveLearningLangTag(learningLangSetting), [learningLangSetting]);
  const langBase = useMemo(() => learningLangBaseFromTag(learningLanguageTag), [learningLanguageTag]);

  const [tab, setTab] = useState<"vocab" | "phrases">("phrases");
  const [refreshKey, setRefreshKey] = useState(0);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("");
  const [lastTokens, setLastTokens] = useState<PronunciationToken[]>([]);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);

  void refreshKey;
  const vocab = db.listTopVocabStats(langBase, 10);
  const phrases = db.listTopPhraseStats(langBase, 10);

  function stop() {
    setListening(false);
    try {
      recogRef.current?.abort();
      recogRef.current = null;
    } catch {
      // ignore
    }
  }

  function repeatPhrase(phrase: string) {
    if (!speechSupported) {
      setStatus("SpeechRecognition no disponible.");
      return;
    }
    if (!sttSecure) {
      setStatus("Voz requiere HTTPS o localhost (micrófono bloqueado en HTTP por IP/LAN).");
      return;
    }
    if (listening) return;
    const recog = createSpeechRecognition();
    if (!recog) {
      setStatus("SpeechRecognition no disponible.");
      return;
    }
    recogRef.current = recog;
    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = learningLanguageTag;
    let finalTranscript = "";
    recog.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results.item(i);
        const alt = r.item(0);
        if (r.isFinal && alt?.transcript) finalTranscript += alt.transcript;
      }
    };
    recog.onerror = (e) => setStatus(formatSpeechRecognitionError(e));
    recog.onend = () => {
      setListening(false);
      recogRef.current = null;
      const transcript = finalTranscript.trim();
      if (!transcript) return;
      const tokens = diffTokens(phrase, transcript);
      const a = tokenAccuracy(tokens).accuracy;
      setLastTokens(tokens);
      setLastAccuracy(a);
      setStatus(a >= 0.8 ? `Good! ${Math.round(a * 100)}%` : `Keep going. ${Math.round(a * 100)}%`);
      if (a < 0.8) {
        db.bumpPhraseLowAccuracy(langBase, phrase);
        setRefreshKey((k) => k + 1);
      }
    };
    setListening(true);
    recog.start();
  }

  return (
    <div className="grid2">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 className="cardTitle" style={{ margin: 0 }}>
            Review
          </h1>
          <div className="row">
            <button className="pill" onClick={() => guide.open()}>
              IPA
            </button>
            <Link className="pill" to="/lessons">
              Lessons
            </Link>
          </div>
        </div>

        <p className="muted" style={{ marginTop: 10 }}>
          Top 10 items con más fallos (local). Práctica rápida, sin sobrecarga.
        </p>

        <div className="row" style={{ marginTop: 12 }}>
          <button className={tab === "phrases" ? "btnPrimary" : ""} onClick={() => setTab("phrases")}>
            Phrases
          </button>
          <button className={tab === "vocab" ? "btnPrimary" : ""} onClick={() => setTab("vocab")}>
            Vocab
          </button>
          <button onClick={stop} disabled={!listening}>
            Stop
          </button>
          {status ? <span className="muted">{status}</span> : null}
        </div>

        {tab === "phrases" ? (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {phrases.length === 0 ? <div className="muted">No phrase issues yet.</div> : null}
            {phrases.map((p) => (
              <div key={p.phrase} className="bubble">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{p.phrase}</strong>
                  <span className="muted">low: {p.countLowAccuracy}</span>
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button onClick={() => speak(p.phrase)}>Listen</button>
                  <button className="btnPrimary" onClick={() => repeatPhrase(p.phrase)} disabled={!sttReady || listening}>
                    Repeat
                  </button>
                  <button
                    onClick={() => {
                      db.markPhraseMastered(langBase, p.phrase);
                      setRefreshKey((k) => k + 1);
                    }}
                  >
                    Mark mastered
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {vocab.length === 0 ? <div className="muted">No vocab issues yet.</div> : null}
            {vocab.map((v) => (
              <div key={v.term} className="bubble">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{v.term}</strong>
                  <span className="muted">wrong: {v.countWrong}</span>
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button onClick={() => speak(v.term)}>Listen</button>
                  <button
                    onClick={() => {
                      db.markVocabMastered(langBase, v.term);
                      setRefreshKey((k) => k + 1);
                    }}
                  >
                    Mark mastered
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="cardTitle">Pronunciation feedback</h2>
        <p className="muted">Solo para phrases (diff de palabras).</p>
        {lastTokens.length ? (
          <>
            <PronunciationTokens tokens={lastTokens} />
            {lastAccuracy != null ? <p className="muted">Accuracy: {Math.round(lastAccuracy * 100)}%</p> : null}
          </>
        ) : (
          <p className="muted">Try “Repeat” on a phrase.</p>
        )}
      </div>
    </div>
  );
}
