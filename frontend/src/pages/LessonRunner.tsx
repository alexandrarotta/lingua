import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PronunciationTokens from "../components/PronunciationTokens";
import { loadLesson } from "../lessons/catalog";
import type {
  Lesson,
  LessonExerciseFillInTheBlank,
  LessonExerciseMultipleChoice,
  LessonExerciseReorderWords,
  LessonTargetPhrase
} from "../lessons/types";
import { toIpaForLang } from "../lessons/ipa";
import { diffTokens, type PronunciationToken } from "../lib/diffTokens";
import { lessonsCoach, type LessonsCoachOkResponse } from "../lib/api";
import { BackendError } from "../lib/backend";
import { addTurn, createSession } from "../lib/sessionsApi";
import { createSpeechRecognition, formatSpeechRecognitionError, isSpeechRecognitionAvailable, isVoiceSecureContext, speak } from "../lib/speech";
import { learningLangBaseFromTag, resolveLearningLangTag } from "../lib/learningLangPrefs";
import { normalizeShortAnswer, tokenAccuracy } from "../lessons/scoring";
import { useAppState } from "../state/AppState";
import type { LessonProgressRow, LessonStepProgressRow } from "../db/db";

type Step =
  | { id: string; kind: "intro" }
  | { id: string; kind: "dialogue" }
  | { id: string; kind: "repeat"; phrase: LessonTargetPhrase }
  | { id: string; kind: "mcq"; q: LessonExerciseMultipleChoice }
  | { id: string; kind: "fib"; q: LessonExerciseFillInTheBlank }
  | { id: string; kind: "rw"; q: LessonExerciseReorderWords }
  | { id: string; kind: "roleplay" }
  | { id: string; kind: "wrapup" };

function buildSteps(lesson: Lesson): Step[] {
  const out: Step[] = [];
  out.push({ id: "intro", kind: "intro" });
  out.push({ id: "dialogue", kind: "dialogue" });

  lesson.targetPhrases.forEach((p, i) => out.push({ id: `repeat-${i + 1}`, kind: "repeat", phrase: p }));
  lesson.exercises.multipleChoice.forEach((q, i) => out.push({ id: `mcq-${i + 1}`, kind: "mcq", q }));
  lesson.exercises.fillInTheBlank.forEach((q, i) => out.push({ id: `fib-${i + 1}`, kind: "fib", q }));
  lesson.exercises.reorderWords.forEach((q, i) => out.push({ id: `rw-${i + 1}`, kind: "rw", q }));

  out.push({ id: "roleplay", kind: "roleplay" });
  out.push({ id: "wrapup", kind: "wrapup" });
  return out;
}

function formatPct(p: number) {
  return `${Math.round(p * 100)}%`;
}

function scoreSummary(stepProgress: Map<string, LessonStepProgressRow>, steps: Step[]) {
  const repeat = steps.filter((s): s is Extract<Step, { kind: "repeat" }> => s.kind === "repeat");
  const quizzes = steps.filter((s) => s.kind === "mcq" || s.kind === "fib" || s.kind === "rw");

  let repeatPassed = 0;
  for (const s of repeat) {
    const p = stepProgress.get(s.id);
    if (p && p.attempts >= 2 && p.bestScore >= 0.8) repeatPassed += 1;
  }

  let quizCorrect = 0;
  for (const s of quizzes) {
    const p = stepProgress.get(s.id);
    if (p && p.bestScore >= 1) quizCorrect += 1;
  }

  const quizTotal = quizzes.length || 1;
  const quizPct = quizCorrect / quizTotal;

  const ok = repeatPassed >= 2 && quizPct >= 0.7;
  return {
    ok,
    repeatPassed,
    repeatTotal: repeat.length,
    quizCorrect,
    quizTotal,
    quizPct
  };
}

function firstIncompleteStepId(stepProgress: Map<string, LessonStepProgressRow>, steps: Step[]) {
  for (const s of steps) {
    if (s.kind === "intro" || s.kind === "dialogue" || s.kind === "roleplay" || s.kind === "wrapup") continue;
    const p = stepProgress.get(s.id);
    if (!p) return s.id;
    if (s.kind === "repeat") {
      if (!(p.attempts >= 2 && p.bestScore >= 0.8)) return s.id;
    } else {
      if (p.bestScore < 1) return s.id;
    }
  }
  return null;
}

function splitSummaryLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-•\d.)]+\s*/, "").trim())
    .filter(Boolean);
}

export default function LessonRunnerPage() {
  const nav = useNavigate();
  const { lessonId } = useParams();
  const id = lessonId || "";
  const { db, profiles, activeProfileId, sessionApiKeys, learningLangSetting } = useAppState();

  const learningLanguageTag = useMemo(() => resolveLearningLangTag(learningLangSetting), [learningLangSetting]);
  const lessonsLangBase = useMemo(() => learningLangBaseFromTag(learningLanguageTag), [learningLanguageTag]);

  const activeProfile = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId) ?? profiles[0]!;
  }, [profiles, activeProfileId]);

  const apiKey = sessionApiKeys[activeProfile.id] ?? "";

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [err, setErr] = useState<string>("");
  const [showMore, setShowMore] = useState(false);

  const [stepProgressRows, setStepProgressRows] = useState<LessonStepProgressRow[]>(() =>
    id ? db.listLessonStepProgress(id) : []
  );
  const stepProgress = useMemo(() => new Map(stepProgressRows.map((r) => [r.stepId, r])), [stepProgressRows]);

  const lessonProgress = useMemo<LessonProgressRow | null>(() => (id ? db.getLessonProgress(id) : null), [db, id]);

  useEffect(() => {
    if (!id) return;
    db.ensureLessonStarted(id);
    setStepProgressRows(db.listLessonStepProgress(id));
  }, [db, id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const l = await loadLesson(lessonsLangBase, id);
        if (cancelled) return;
        setLesson(l);
        setErr("");
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Failed to load lesson.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, lessonsLangBase]);

  const steps = useMemo(() => (lesson ? buildSteps(lesson) : []), [lesson]);

  const stepIndexFromLast = useMemo(() => {
    if (!lessonProgress?.lastStepId) return 0;
    const idx = steps.findIndex((s) => s.id === lessonProgress.lastStepId);
    return idx >= 0 ? idx : 0;
  }, [lessonProgress?.lastStepId, steps]);

  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    setStepIdx(stepIndexFromLast);
  }, [stepIndexFromLast]);

  const current = steps[stepIdx];

  useEffect(() => {
    const currentId = steps[stepIdx]?.id;
    if (!currentId) return;
    db.setLessonLastStep(id, currentId);
  }, [db, id, stepIdx, steps]);

  // Repeat step STT state
  const speechSupported = useMemo(() => isSpeechRecognitionAvailable(), []);
  const sttSecure = useMemo(() => isVoiceSecureContext(), []);
  const sttReady = speechSupported && sttSecure;
  const recogRef = useRef<SpeechRecognition | null>(null);
  const [listening, setListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastTokens, setLastTokens] = useState<PronunciationToken[]>([]);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const [stepMsg, setStepMsg] = useState<string>("");

  // Quiz state
  const [mcqChoice, setMcqChoice] = useState<number | null>(null);
  const [fibAnswer, setFibAnswer] = useState("");
  const [rwSelected, setRwSelected] = useState<string[]>([]);

  useEffect(() => {
    setLastTranscript("");
    setLastTokens([]);
    setLastAccuracy(null);
    setStepMsg("");
    setMcqChoice(null);
    setFibAnswer("");
    setRwSelected([]);
  }, [current?.id]);

  function go(delta: number) {
    const next = stepIdx + delta;
    if (next < 0 || next >= steps.length) return;
    setStepIdx(next);
  }

  function stopListening() {
    setListening(false);
    try {
      recogRef.current?.abort();
      recogRef.current = null;
    } catch {
      // ignore
    }
  }

  function startRepeat(phrase: string, stepId: string) {
    if (!speechSupported) {
      setStepMsg("SpeechRecognition no disponible. Usa el modo texto.");
      return;
    }
    if (!sttSecure) {
      setStepMsg("Voz requiere HTTPS o localhost (micrófono bloqueado en HTTP por IP/LAN).");
      return;
    }
    if (listening) return;
    const recog = createSpeechRecognition();
    if (!recog) {
      setStepMsg("SpeechRecognition no disponible.");
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
      setLastTranscript(text.trim());
    };
    recog.onerror = (e) => setStepMsg(formatSpeechRecognitionError(e));
    recog.onend = () => {
      setListening(false);
      recogRef.current = null;
      const transcript = finalTranscript.trim();
      if (!transcript) return;

      const tokens = diffTokens(phrase, transcript);
      const a = tokenAccuracy(tokens).accuracy;
      setLastTokens(tokens);
      setLastAccuracy(a);
      setStepMsg(a >= 0.8 ? `Good! Accuracy ${formatPct(a)}.` : `Keep going. Accuracy ${formatPct(a)}.`);

      const saved = db.recordLessonStepAttempt(id, stepId, a);
      setStepProgressRows((prev) => {
        const next = prev.filter((p) => !(p.lessonId === saved.lessonId && p.stepId === saved.stepId));
        next.push(saved);
        return next;
      });

      if (a < 0.8) db.bumpPhraseLowAccuracy(lessonsLangBase, phrase);
    };
    setListening(true);
    recog.start();
  }

  function checkMcq(stepId: string, q: LessonExerciseMultipleChoice) {
    if (mcqChoice == null) {
      setStepMsg("Pick one option.");
      return;
    }
    const ok = mcqChoice === q.answerIndex;
    const score = ok ? 1 : 0;
    setStepMsg(ok ? "Correct." : `Not quite. ${showMore ? q.explanationEs || "" : ""}`.trim());

    const saved = db.recordLessonStepAttempt(id, stepId, score);
    setStepProgressRows((prev) => {
      const next = prev.filter((p) => !(p.lessonId === saved.lessonId && p.stepId === saved.stepId));
      next.push(saved);
      return next;
    });

    if (!ok) db.bumpVocabWrong(lessonsLangBase, q.options[q.answerIndex] || "");
  }

  function checkFib(stepId: string, q: LessonExerciseFillInTheBlank) {
    const guess = normalizeShortAnswer(fibAnswer);
    const answer = normalizeShortAnswer(q.answer);
    const ok = guess === answer;
    const score = ok ? 1 : 0;
    setStepMsg(ok ? "Correct." : `Not quite. ${showMore ? q.explanationEs || "" : ""}`.trim());

    const saved = db.recordLessonStepAttempt(id, stepId, score);
    setStepProgressRows((prev) => {
      const next = prev.filter((p) => !(p.lessonId === saved.lessonId && p.stepId === saved.stepId));
      next.push(saved);
      return next;
    });

    if (!ok) db.bumpVocabWrong(lessonsLangBase, q.answer);
  }

  function checkRw(stepId: string, q: LessonExerciseReorderWords) {
    const selectedWords = rwSelected.map((idx) => q.words[Number(idx)]).filter(Boolean);
    const ok = selectedWords.join(" ").toLowerCase() === q.answer.join(" ").toLowerCase();
    const score = ok ? 1 : 0;
    setStepMsg(ok ? "Correct." : `Not quite. ${showMore ? q.translationEs || "" : ""}`.trim());

    const saved = db.recordLessonStepAttempt(id, stepId, score);
    setStepProgressRows((prev) => {
      const next = prev.filter((p) => !(p.lessonId === saved.lessonId && p.stepId === saved.stepId));
      next.push(saved);
      return next;
    });

    if (!ok) db.bumpVocabWrong(lessonsLangBase, q.answer.join(" "));
  }

  function startVoiceAnswer(onText: (t: string) => void) {
    if (!speechSupported) {
      setStepMsg("SpeechRecognition no disponible.");
      return;
    }
    if (!sttSecure) {
      setStepMsg("Voz requiere HTTPS o localhost (micrófono bloqueado en HTTP por IP/LAN).");
      return;
    }
    if (listening) return;
    const recog = createSpeechRecognition();
    if (!recog) {
      setStepMsg("SpeechRecognition no disponible.");
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
      onText(text.trim());
    };
    recog.onerror = (e) => setStepMsg(formatSpeechRecognitionError(e));
    recog.onend = () => {
      setListening(false);
      recogRef.current = null;
      const t = finalTranscript.trim();
      if (t) onText(t);
    };
    setListening(true);
    recog.start();
  }

  const summary = useMemo(() => scoreSummary(stepProgress, steps), [stepProgress, steps]);

  const [extraStatus, setExtraStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [extraError, setExtraError] = useState<string>("");
  const [extraPractice, setExtraPractice] = useState<LessonsCoachOkResponse | null>(null);

  useEffect(() => {
    setExtraStatus("idle");
    setExtraError("");
    setExtraPractice(null);
  }, [id, activeProfileId]);

  const aiReady = useMemo(() => {
    const baseUrl = activeProfile.baseUrl.trim();
    if (!baseUrl) return { ok: false, reason: "Configura Base URL en Settings." };

    const isOpenAiCloud = baseUrl.toLowerCase().includes("api.openai.com");

    if (activeProfile.providerType === "LM_STUDIO_OPENAI_COMPAT") {
      if (isOpenAiCloud && !apiKey.trim()) {
        return { ok: false, reason: "Necesitas una API key (no sirve login Gmail/ChatGPT)." };
      }
      if (!activeProfile.model.trim()) return { ok: false, reason: "Configura un Model (usa “Listar modelos”)." };
      return { ok: true as const, reason: "" };
    }

    if (activeProfile.providerType === "ANYTHINGLLM_DEV_API") {
      if (!apiKey.trim()) return { ok: false, reason: "AnythingLLM requiere API key (Developer API)." };
      if (!activeProfile.workspaceSlug.trim()) return { ok: false, reason: "AnythingLLM requiere workspaceSlug." };
      return { ok: true as const, reason: "" };
    }

    return { ok: false, reason: "Provider no soportado." };
  }, [activeProfile.baseUrl, activeProfile.model, activeProfile.providerType, activeProfile.workspaceSlug, apiKey]);

  const autoGenerate = useMemo(() => activeProfile.baseUrl.trim().toLowerCase().startsWith("http://"), [activeProfile.baseUrl]);

  async function generateExtraPractice() {
    if (!lesson) return;

    const lowAccuracyPhrases = steps
      .filter((s): s is Extract<Step, { kind: "repeat" }> => s.kind === "repeat")
      .map((s) => ({ phrase: s.phrase.text, p: stepProgress.get(s.id) }))
      .filter(({ p }) => !!p && p.bestScore < 0.8)
      .map(({ phrase }) => phrase)
      .slice(0, 8);

    const lessonVocabSet = new Set(lesson.vocabList.map((v) => v.en.toLowerCase().trim()).filter(Boolean));
    const wrongTerms = db
      .listTopVocabStats(lessonsLangBase, 25)
      .map((r) => r.term)
      .filter((t) => lessonVocabSet.has(t.toLowerCase().trim()))
      .slice(0, 10);

    setExtraStatus("loading");
    setExtraError("");
    setExtraPractice(null);
    const res = await lessonsCoach({
      lessonId: id,
      learningLanguageTag,
      lesson: {
        level: lesson.level,
        topic: lesson.topic,
        titleEn: lesson.titleEn,
        targetPhrases: lesson.targetPhrases.map((p) => p.text),
        vocabList: lesson.vocabList,
        conversationScenario: lesson.conversationScenario
      },
      userState: {
        lowAccuracyPhrases,
        wrongTerms,
        quizPct: summary.quizPct
      },
      profile: activeProfile,
      apiKey: apiKey || undefined
    });

    if (res.ok) {
      setExtraPractice(res);
      setExtraStatus("done");
      return;
    }

    setExtraStatus("error");
    setExtraError(res.message || "No se pudo generar práctica extra.");
  }

  useEffect(() => {
    if (current?.kind !== "wrapup") return;
    if (!aiReady.ok) return;
    if (!autoGenerate) return;
    if (extraStatus !== "idle") return;
    void generateExtraPractice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.kind, aiReady.ok, autoGenerate, extraStatus]);

  useEffect(() => {
    const currentKind = steps[stepIdx]?.kind;
    if (currentKind !== "wrapup") return;
    if (lessonProgress?.status === "completed") return;
    if (!summary.ok) return;
    const scoreSummaryJson = JSON.stringify({
      repeatPassed: summary.repeatPassed,
      repeatTotal: summary.repeatTotal,
      quizCorrect: summary.quizCorrect,
      quizTotal: summary.quizTotal,
      quizPct: summary.quizPct
    });
    db.setLessonCompleted(id, scoreSummaryJson);
  }, [db, id, stepIdx, steps, lessonProgress?.status, summary.ok, summary.quizCorrect, summary.quizPct, summary.quizTotal, summary.repeatPassed, summary.repeatTotal]);

  async function startRoleplayInChat() {
    if (!lesson) return;
    try {
      const session = await createSession({ title: `Lesson: ${lesson.titleEn}` });
      const prompts = extraPractice?.roleplayPrompts?.length ? extraPractice.roleplayPrompts : lesson.conversationScenario.promptsEn;
      const msg = `Roleplay scenario:\n${lesson.conversationScenario.roleplayEn}\n\nSuggested prompts:\n- ${prompts.join("\n- ")}`;
      await addTurn({ sessionId: session.id, role: "assistant", text: msg, meta: { kind: "practice", source: "lesson_roleplay" } });
      nav(`/chat/${session.id}`);
    } catch (err) {
      const msg = err instanceof BackendError ? err.message : err instanceof Error ? err.message : "Failed to start roleplay";
      window.alert(msg);
    }
  }

  if (!id) return <div className="card">Missing lessonId.</div>;

  if (err) {
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="cardTitle">Lesson</h2>
          <Link className="pill" to="/lessons">
            Back
          </Link>
        </div>
        <p className="muted">Error: {err}</p>
      </div>
    );
  }

  if (!lesson || !current) {
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="cardTitle">Lesson</h2>
          <Link className="pill" to="/lessons">
            Back
          </Link>
        </div>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const progressPct = steps.length ? (stepIdx + 1) / steps.length : 0;
  const incompleteId = firstIncompleteStepId(stepProgress, steps);

  return (
    <div className="grid2">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 className="cardTitle" style={{ margin: 0 }}>
              {lesson.titleEn}
            </h2>
            <div className="muted" style={{ marginTop: 6 }}>
              {lesson.titleEs} · {lesson.level} · {lesson.estimatedMinutes} min
            </div>
          </div>
          <div className="row">
            <button onClick={() => setShowMore((v) => !v)}>{showMore ? "Show less" : "Show more"}</button>
            <Link className="pill" to="/lessons">
              Lessons
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 6 }}>
            Step {stepIdx + 1} / {steps.length}
          </div>
          <div className="progressTrack">
            <div className="progressFill" style={{ width: `${Math.round(progressPct * 100)}%` }} />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          {current.kind === "intro" ? (
            <>
              <h3 className="cardTitle">Objective</h3>
              <ul className="muted" style={{ margin: "8px 0 0 16px" }}>
                {lesson.objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
              {showMore ? (
                <div className="bubble" style={{ marginTop: 12 }}>
                  <strong>Grammar focus</strong>
                  <div style={{ marginTop: 6 }}>{lesson.grammarFocus}</div>
                </div>
              ) : null}
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btnPrimary" onClick={() => go(1)}>
                  Start
                </button>
              </div>
            </>
          ) : null}

          {current.kind === "dialogue" ? (
            <>
              <h3 className="cardTitle">Listen</h3>
              <p className="muted">Listen to the dialogue (TTS) once, then continue.</p>
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {lesson.dialogue.map((line, i) => (
                  <div key={i} className="bubble">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong>{line.speaker}</strong>
                      <button onClick={() => speak(line.text)}>Listen</button>
                    </div>
                    <div style={{ marginTop: 6 }}>{line.text}</div>
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button onClick={() => lesson.dialogue.forEach((l, i) => window.setTimeout(() => speak(l.text), i * 1600))}>
                  Listen all
                </button>
              </div>
            </>
          ) : null}

          {current.kind === "repeat" ? (
            <>
              <h3 className="cardTitle">Repeat</h3>
              <p className="muted">Listen → Repeat twice. Goal: ≥80% accuracy.</p>
              <div className="bubble repeatPhrasePill" style={{ marginTop: 10 }}>
                <strong>{current.phrase.text}</strong>
                {(() => {
                  const ipa = current.phrase.ipa ?? toIpaForLang(current.phrase.text, lessonsLangBase);
                  return ipa ? <code className="repeatPhraseIpaBadge">{ipa}</code> : null;
                })()}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button onClick={() => speak(current.phrase.text)}>Listen</button>
                <button
                  className="btnPrimary"
                  onClick={() => startRepeat(current.phrase.text, current.id)}
                  disabled={!sttReady || listening}
                >
                  Repeat (voice)
                </button>
                <button onClick={stopListening} disabled={!listening}>
                  Stop
                </button>
              </div>
              {lastTranscript ? (
                <div className="bubble" style={{ marginTop: 12 }}>
                  <strong>Transcript</strong>
                  <div style={{ marginTop: 6 }}>{lastTranscript}</div>
                </div>
              ) : null}
              {lastTokens.length ? (
                <div style={{ marginTop: 12 }}>
                  <strong>Pronunciation (diff)</strong>
                  <PronunciationTokens tokens={lastTokens} />
                  {lastAccuracy != null ? (
                    <div className="muted" style={{ marginTop: 8 }}>
                      Accuracy: {formatPct(lastAccuracy)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {current.kind === "mcq" ? (
            <>
              <h3 className="cardTitle">Answer</h3>
              <p className="muted">Pick one option.</p>
              <div className="bubble" style={{ marginTop: 10 }}>
                <strong>{current.q.questionEn}</strong>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {current.q.options.map((opt, i) => (
                    <label key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        type="radio"
                        name={`mcq-${current.q.id}`}
                        checked={mcqChoice === i}
                        onChange={() => setMcqChoice(i)}
                        style={{ width: 16 }}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btnPrimary" onClick={() => checkMcq(current.id, current.q)}>
                  Check
                </button>
              </div>
            </>
          ) : null}

          {current.kind === "fib" ? (
            <>
              <h3 className="cardTitle">Answer</h3>
              <p className="muted">Type the missing word (voice optional).</p>
              <div className="bubble" style={{ marginTop: 10 }}>
                <strong>{current.q.sentenceEn}</strong>
                <div className="row" style={{ marginTop: 10 }}>
                  <input value={fibAnswer} onChange={(e) => setFibAnswer(e.target.value)} placeholder="Your answer" />
                  <button onClick={() => startVoiceAnswer((t) => setFibAnswer(t))} disabled={!sttReady || listening}>
                    Answer by voice
                  </button>
                </div>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btnPrimary" onClick={() => checkFib(current.id, current.q)}>
                  Check
                </button>
              </div>
            </>
          ) : null}

          {current.kind === "rw" ? (
            <>
              <h3 className="cardTitle">Reorder</h3>
              <p className="muted">Tap words in order to build the sentence.</p>
              <div className="bubble" style={{ marginTop: 10 }}>
                <div className="row" style={{ marginBottom: 10 }}>
                  {current.q.words.map((w, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setRwSelected((prev) => (prev.includes(`${i}`) ? prev : [...prev, `${i}`]));
                      }}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                <div className="muted">Your sentence:</div>
                <div style={{ marginTop: 6 }}>
                  {rwSelected.length
                    ? rwSelected.map((idx) => current.q.words[Number(idx)]).join(" ")
                    : <span className="muted">Tap words above…</span>}
                </div>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  onClick={() => setRwSelected([])}
                  disabled={rwSelected.length === 0}
                >
                  Reset
                </button>
                <button
                  className="btnPrimary"
                  onClick={() => checkRw(current.id, current.q)}
                  disabled={rwSelected.length === 0}
                >
                  Check
                </button>
              </div>
            </>
          ) : null}

          {current.kind === "roleplay" ? (
            <>
              <h3 className="cardTitle">Roleplay</h3>
              <p className="muted">Optional: practice the scenario in Chat (voice). No audio is sent to the server.</p>
              <div className="bubble" style={{ marginTop: 10 }}>
                <strong>Scenario</strong>
                <div style={{ marginTop: 6 }}>{lesson.conversationScenario.roleplayEn}</div>
                <div className="muted" style={{ marginTop: 10 }}>
                  Prompts:
                </div>
                <ul className="muted" style={{ margin: "6px 0 0 16px" }}>
                  {lesson.conversationScenario.promptsEn.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btnPrimary" onClick={() => void startRoleplayInChat()}>
                  Start roleplay in Chat
                </button>
              </div>
            </>
          ) : null}

          {current.kind === "wrapup" ? (
            <>
              <h3 className="cardTitle">Lesson summary</h3>
              <div className="bubble" style={{ marginTop: 10 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>Status</strong>
                  <span className={summary.ok ? "pill tokenOk" : "pill tokenMissing"}>
                    {summary.ok ? "Completed" : "In progress"}
                  </span>
                </div>
                <div className="muted" style={{ marginTop: 10 }}>
                  Repeat passed: {summary.repeatPassed}/{summary.repeatTotal} · Quiz: {summary.quizCorrect}/{summary.quizTotal} (
                  {formatPct(summary.quizPct)})
                </div>
              </div>

              {!summary.ok ? (
                <div className="bubble" style={{ marginTop: 12 }}>
                  <strong>To complete</strong>
                  <ul className="muted" style={{ margin: "8px 0 0 16px" }}>
                    <li>Repeat: pass at least 2 phrases (2 attempts, ≥80%).</li>
                    <li>Quiz: reach ≥70% correct.</li>
                  </ul>
                  {incompleteId ? (
                    <div className="row" style={{ marginTop: 12 }}>
                      <button
                        className="btnPrimary"
                        onClick={() => {
                          const idx = steps.findIndex((s) => s.id === incompleteId);
                          if (idx >= 0) setStepIdx(idx);
                        }}
                      >
                        Go to next incomplete step
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="bubble" style={{ marginTop: 12 }}>
                <strong>Resumen (ES)</strong>
                <ul className="muted" style={{ margin: "8px 0 0 16px" }}>
                  <li>Enfoque: {lesson.grammarFocus}</li>
                  <li>Vocab clave: {lesson.vocabList.slice(0, 6).map((v) => v.en).join(", ")}.</li>
                  <li>Frases recomendadas: {lesson.targetPhrases.slice(0, 5).map((p) => p.text).join(" · ")}</li>
                </ul>
              </div>

              <div className="bubble" style={{ marginTop: 12 }}>
                <strong>Extra practice</strong>
                {!aiReady.ok ? (
                  <div className="muted" style={{ marginTop: 6 }}>
                    {aiReady.reason} Ve a <Link to="/settings">Settings</Link>.
                  </div>
                ) : null}

                {aiReady.ok && !autoGenerate ? (
                  <div className="muted" style={{ marginTop: 6 }}>
                    Por seguridad/costo, la práctica extra no se genera automáticamente para <code>https://</code>. Pulsa “Generar”.
                  </div>
                ) : null}

                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btnPrimary" onClick={() => void generateExtraPractice()} disabled={!aiReady.ok || extraStatus === "loading"}>
                    {extraStatus === "loading" ? "Generando…" : "Generar"}
                  </button>
                  <Link className="pill" to="/review">
                    Review mistakes
                  </Link>
                </div>

                {extraStatus === "error" ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    {extraError}
                  </div>
                ) : null}

                {extraPractice ? (
                  <>
                    {extraPractice.warning ? (
                      <div className="muted" style={{ marginTop: 10 }}>
                        Warning: {extraPractice.warning}
                      </div>
                    ) : null}

                    {extraPractice.feedbackSummaryEs ? (
                      <div style={{ marginTop: 12 }}>
                        <strong>Feedback (ES)</strong>
                        <ul className="muted" style={{ margin: "8px 0 0 16px" }}>
                          {splitSummaryLines(extraPractice.feedbackSummaryEs).map((l, i) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {extraPractice.extraDrills?.length ? (
                      <div style={{ marginTop: 12 }}>
                        <strong>Drills</strong>
                        <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                          {extraPractice.extraDrills.map((d, i) => (
                            <div key={i} className="bubble">
                              <div className="row" style={{ justifyContent: "space-between" }}>
                                <strong>{d.type}</strong>
                                <div className="row">
                                  <button onClick={() => speak(d.promptEn)}>Listen</button>
                                  {d.type === "repeat" ? (
                                    <button
                                      className="btnPrimary"
                                      onClick={() => startRepeat(d.answerEn?.trim() ? d.answerEn : d.promptEn, `extra-${i + 1}`)}
                                      disabled={!sttReady || listening}
                                    >
                                      Repeat (voice)
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                              <div style={{ marginTop: 6 }}>{d.promptEn}</div>
                              {d.answerEn ? (
                                <div className="muted" style={{ marginTop: 6 }}>
                                  Answer: {d.answerEn}
                                </div>
                              ) : null}
                              {d.tipEs ? (
                                <div className="muted" style={{ marginTop: 6 }}>
                                  Tip: {d.tipEs}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="muted" style={{ marginTop: 10 }}>
                        No drills disponibles (aún). Usa Review o repite frases objetivo.
                      </div>
                    )}
                  </>
                ) : extraStatus === "loading" ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Generando práctica extra…
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {stepMsg ? <div className="muted" style={{ marginTop: 12 }}>Feedback: {stepMsg}</div> : null}
        </div>

        <div className="row" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <button onClick={() => go(-1)} disabled={stepIdx === 0}>
            Back
          </button>
          <div className="row">
            <button onClick={stopListening} disabled={!listening}>
              Stop STT
            </button>
            <button className="btnPrimary" onClick={() => go(1)} disabled={stepIdx === steps.length - 1}>
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="cardTitle">Step feedback</h2>
        <p className="muted">Repite frases y revisa el diff (ok/missing/extra/substituted).</p>
        {lastTokens.length ? (
          <>
            <PronunciationTokens tokens={lastTokens} />
            {lastAccuracy != null ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Accuracy: {formatPct(lastAccuracy)}
              </div>
            ) : null}
          </>
        ) : (
          <p className="muted">No feedback yet. Try a “Repeat” step.</p>
        )}
      </div>
    </div>
  );
}
