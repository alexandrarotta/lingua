import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loadLessonIndex } from "../lessons/catalog";
import type { LessonIndex, LessonIndexItem, LessonLevel } from "../lessons/types";
import { getTopicsForLevel, normalizeTopic } from "../lessons/topics";
import type { LessonProgressRow } from "../db/db";
import { learningLangBaseFromTag, resolveLearningLangTag } from "../lib/learningLangPrefs";
import { useAppState } from "../state/AppState";

function statusLabel(progress: LessonProgressRow | undefined) {
  if (!progress) return "Not started";
  return progress.status === "completed" ? "Completed" : "In progress";
}

function statusPillClass(progress: LessonProgressRow | undefined) {
  if (!progress) return "pill muted";
  return progress.status === "completed" ? "pill tokenOk" : "pill tokenMissing";
}

function isCompleted(progress: LessonProgressRow | undefined) {
  return !!progress && progress.status === "completed";
}

export default function LessonsPage() {
  const nav = useNavigate();
  const { db, learningLangSetting } = useAppState();
  const [index, setIndex] = useState<LessonIndex | null>(null);
  const [error, setError] = useState<string>("");

  const [levelFilter, setLevelFilter] = useState<"ALL" | LessonLevel>("ALL");
  const [topicFilter, setTopicFilter] = useState<string>("ALL");

  const progressRows = useMemo(() => db.listLessonsProgress(), [db]);
  const progressById = useMemo(() => {
    const map = new Map<string, LessonProgressRow>();
    for (const row of progressRows) map.set(row.lessonId, row);
    return map;
  }, [progressRows]);

  const learningLanguageTag = useMemo(() => resolveLearningLangTag(learningLangSetting), [learningLangSetting]);
  const lessonsLangBase = useMemo(() => learningLangBaseFromTag(learningLanguageTag), [learningLanguageTag]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const idx = await loadLessonIndex(lessonsLangBase);
        if (cancelled) return;
        setIndex(idx);
        setError("");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load lessons.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonsLangBase]);

  const topics = useMemo(() => {
    return getTopicsForLevel(index?.lessons ?? [], levelFilter);
  }, [index, levelFilter]);

  useEffect(() => {
    if (topicFilter === "ALL") return;
    const available = new Set(topics.map((t) => normalizeTopic(t)));
    if (!available.has(normalizeTopic(topicFilter))) setTopicFilter("ALL");
  }, [topics, topicFilter]);

  const filtered = useMemo(() => {
    const lessons = index?.lessons ?? [];
    return lessons.filter((l) => {
      if (levelFilter !== "ALL" && l.level !== levelFilter) return false;
      if (topicFilter !== "ALL" && normalizeTopic(l.topic) !== normalizeTopic(topicFilter)) return false;
      return true;
    });
  }, [index, levelFilter, topicFilter]);

  const grouped = useMemo(() => {
    const out: Record<string, LessonIndexItem[]> = { A1: [], A2: [] };
    for (const l of filtered) out[l.level].push(l);
    return out as Record<LessonLevel, LessonIndexItem[]>;
  }, [filtered]);

  function isUnlocked(lesson: LessonIndexItem) {
    return lesson.prerequisites.every((id) => isCompleted(progressById.get(id)));
  }

  function openLesson(lessonId: string) {
    db.ensureLessonStarted(lessonId);
    nav(`/lessons/${lessonId}`);
  }

  return (
    <div className="grid2">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 className="cardTitle" style={{ margin: 0 }}>
            Lessons
          </h1>
          <Link className="pill" to="/review">
            Review
          </Link>
        </div>

        <p className="muted" style={{ marginTop: 10 }}>
          Micro‑pasos cortos (listen → repeat → quiz) para práctica guiada. Funciona sin IA; con IA agrega “Extra practice”.
        </p>

        <div className="row" style={{ marginTop: 12 }}>
          <label style={{ minWidth: 180 }}>
            Level
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as "ALL" | LessonLevel)}>
              <option value="ALL">All</option>
              <option value="A1">A1</option>
              <option value="A2">A2</option>
            </select>
          </label>

          <label style={{ minWidth: 220 }}>
            Topic
            <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
              <option value="ALL">ALL</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <div className="muted" style={{ marginTop: 12 }}>Error: {error}</div> : null}
        {!index ? <div className="muted" style={{ marginTop: 12 }}>Loading lessons…</div> : null}

        {index ? (
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {(["A1", "A2"] as const).map((lvl) => (
              <div key={lvl}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h2 className="cardTitle" style={{ margin: "10px 0 6px 0" }}>
                    {lvl}
                  </h2>
                  <span className="muted">{grouped[lvl].length} lessons</span>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {grouped[lvl].map((l) => {
                    const progress = progressById.get(l.id);
                    const unlocked = isUnlocked(l);
                    return (
                      <div key={l.id} className="bubble">
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <div>
                            <strong>{l.titleEn}</strong>
                            <div className="muted" style={{ marginTop: 4 }}>
                              {l.titleEs} · {l.topic} · {l.estimatedMinutes} min
                            </div>
                          </div>
                          <div className={statusPillClass(progress)}>{statusLabel(progress)}</div>
                        </div>

                        {!unlocked ? (
                          <div className="muted" style={{ marginTop: 10 }}>
                            Locked: complete prerequisites first ({l.prerequisites.join(", ")}).
                          </div>
                        ) : null}

                        <div className="row" style={{ marginTop: 12 }}>
                          <button className="btnPrimary" onClick={() => openLesson(l.id)} disabled={!unlocked}>
                            {progress?.status === "in_progress" ? "Continue" : "Start"}
                          </button>
                          <Link className="pill" to={`/lessons/${l.id}`}>
                            Details
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2 className="cardTitle">How it works</h2>
        <ul className="muted" style={{ margin: "8px 0 0 16px" }}>
          <li>Listen: usa TTS del navegador.</li>
          <li>Repeat: usa STT del navegador + diff de palabras (feedback).</li>
          <li>Quiz: respuestas rápidas (texto; voz opcional en 1–2 pasos).</li>
          <li>Progreso y review se guardan localmente (SQLite en tu navegador).</li>
        </ul>
      </div>
    </div>
  );
}
