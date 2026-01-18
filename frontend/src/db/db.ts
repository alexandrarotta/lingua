import initSqlJs, { type Database, type Statement } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { get, set } from "idb-keyval";
import type { AiProfile, AiProviderType, AnythingLlmMode } from "../state/aiProfiles";
import { DEFAULT_ANYTHINGLLM_PROFILE_ID, DEFAULT_LOCAL_PROFILE_ID, DEFAULT_OPENAI_PROFILE_ID } from "../state/aiProfiles";
import { getStableUuid } from "../lib/uuid";

const DB_KEY = "lingua-db-v1";
const SQLITE_WASM_INIT_TIMEOUT_MS = 20_000;
const SQLITE_WASM_FETCH_TIMEOUT_MS = 20_000;

// In this monorepo, `sql.js` is hoisted to the repo root, which makes Vite serve the WASM via `/@fs/...`.
// That path is brittle on some Android browsers, so in dev we serve it from a stable `/assets/...` route.
const resolvedWasmUrl = import.meta.env.DEV ? "/assets/sql-wasm.wasm" : wasmUrl;

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function nowMs() {
  return Date.now();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(resolve, reject).finally(() => window.clearTimeout(t));
  });
}

async function fetchArrayBufferWithTimeout(url: string, timeoutMs: number): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: "same-origin" });
    if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
    return await res.arrayBuffer();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (sqlJsPromise) return sqlJsPromise;

  sqlJsPromise = (async () => {
    const wasmBinary = await fetchArrayBufferWithTimeout(resolvedWasmUrl, SQLITE_WASM_FETCH_TIMEOUT_MS);
    return await withTimeout(initSqlJs({ wasmBinary }), SQLITE_WASM_INIT_TIMEOUT_MS, "initSqlJs(sql.js)");
  })();

  try {
    return await sqlJsPromise;
  } catch (err) {
    sqlJsPromise = null;
    throw err;
  }
}

function asText(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

function asProviderType(v: unknown, fallback: AiProviderType = "LM_STUDIO_OPENAI_COMPAT"): AiProviderType {
  const s = asText(v, fallback);
  if (s === "LM_STUDIO_OPENAI_COMPAT") return s;
  if (s === "ANYTHINGLLM_DEV_API") return s;
  return fallback;
}

function asAnythingMode(v: unknown, fallback: AnythingLlmMode = "chat"): AnythingLlmMode {
  const s = asText(v, fallback);
  if (s === "chat") return s;
  if (s === "query") return s;
  return fallback;
}

function looksLikeLocalBaseUrl(baseUrl: string) {
  const b = baseUrl.trim().toLowerCase();
  if (!b) return false;
  if (b.startsWith("http://localhost")) return true;
  if (b.startsWith("http://127.")) return true;
  if (b.startsWith("http://0.0.0.0")) return true;
  return false;
}

function rowsFromStmt<T extends Record<string, unknown>>(stmt: Statement): T[] {
  const out: T[] = [];
  while (stmt.step()) out.push(stmt.getAsObject() as T);
  return out;
}

export type SessionRow = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type MessageRow = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export type TurnRow = {
  id: string;
  sessionId: string;
  kind: "chat" | "practice";
  transcriptText: string;
  correctedUserText: string;
  explanationEs: string;
  styleSuggestionsJson: string;
  assistantReplyText: string;
  targetText: string;
  pronunciationTokensJson: string;
  providerUsed: string;
  warning: string | null;
  createdAt: number;
};

export type LessonProgressRow = {
  lessonId: string;
  status: "in_progress" | "completed";
  startedAt: number;
  completedAt: number | null;
  lastStepId: string | null;
  scoreSummaryJson: string;
};

export type LessonStepProgressRow = {
  lessonId: string;
  stepId: string;
  attempts: number;
  bestScore: number;
  lastAttemptAt: number;
};

export type VocabStatRow = {
  term: string;
  countWrong: number;
  lastWrongAt: number;
};

export type PhraseStatRow = {
  phrase: string;
  countLowAccuracy: number;
  lastAt: number;
};

export class LinguaDb {
  private db: Database;
  private persistTimer: number | null = null;

  private constructor(db: Database) {
    this.db = db;
  }

  static async open(): Promise<LinguaDb> {
    const SQL = await loadSqlJs();

    const saved = (await get(DB_KEY)) as ArrayBuffer | undefined;
    const db = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database();
    const wrapper = new LinguaDb(db);
    wrapper.migrate();
    if (!saved) wrapper.seedDemo();
    await wrapper.persistNow();
    return wrapper;
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        provider TEXT NOT NULL,
        baseUrl TEXT NOT NULL,
        model TEXT NOT NULL,
        endpointChat TEXT NOT NULL,
        endpointModels TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        providerType TEXT NOT NULL DEFAULT 'LM_STUDIO_OPENAI_COMPAT',
        baseUrl TEXT NOT NULL,
        model TEXT NOT NULL,
        endpointMode TEXT NOT NULL,
        workspaceSlug TEXT NOT NULL DEFAULT '',
        anythingllmMode TEXT NOT NULL DEFAULT 'chat',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        activeProfileId TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session_createdAt
        ON messages(sessionId, createdAt);

      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        kind TEXT NOT NULL,
        transcriptText TEXT NOT NULL,
        correctedUserText TEXT NOT NULL,
        explanationEs TEXT NOT NULL,
        styleSuggestionsJson TEXT NOT NULL,
        assistantReplyText TEXT NOT NULL,
        targetText TEXT NOT NULL,
        pronunciationTokensJson TEXT NOT NULL,
        providerUsed TEXT NOT NULL,
        warning TEXT,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_turns_session_createdAt
        ON turns(sessionId, createdAt);

      CREATE TABLE IF NOT EXISTS lessons_progress (
        lessonId TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        startedAt INTEGER NOT NULL,
        completedAt INTEGER,
        lastStepId TEXT,
        scoreSummaryJson TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lesson_step_progress (
        lessonId TEXT NOT NULL,
        stepId TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        bestScore REAL NOT NULL,
        lastAttemptAt INTEGER NOT NULL,
        PRIMARY KEY (lessonId, stepId)
      );
      CREATE INDEX IF NOT EXISTS idx_lesson_step_progress_lesson
        ON lesson_step_progress(lessonId);

      CREATE TABLE IF NOT EXISTS vocab_stats (
        lang TEXT NOT NULL,
        term TEXT NOT NULL,
        countWrong INTEGER NOT NULL,
        lastWrongAt INTEGER NOT NULL,
        PRIMARY KEY (lang, term)
      );

      CREATE TABLE IF NOT EXISTS phrase_stats (
        lang TEXT NOT NULL,
        phrase TEXT NOT NULL,
        countLowAccuracy INTEGER NOT NULL,
        lastAt INTEGER NOT NULL,
        PRIMARY KEY (lang, phrase)
      );
    `);

    // Backfill new ai_profiles columns for existing DBs (older schema).
    const cols = this.db.exec("PRAGMA table_info(ai_profiles);")?.[0]?.values ?? [];
    const colNames = new Set(cols.map((r) => String(r?.[1] ?? "")));
    if (!colNames.has("providerType")) {
      this.db.run("ALTER TABLE ai_profiles ADD COLUMN providerType TEXT NOT NULL DEFAULT 'LM_STUDIO_OPENAI_COMPAT';");
    }
    if (!colNames.has("workspaceSlug")) {
      this.db.run("ALTER TABLE ai_profiles ADD COLUMN workspaceSlug TEXT NOT NULL DEFAULT '';");
    }
    if (!colNames.has("anythingllmMode")) {
      this.db.run("ALTER TABLE ai_profiles ADD COLUMN anythingllmMode TEXT NOT NULL DEFAULT 'chat';");
    }

    // Migrate vocab_stats/phrase_stats to be language-aware (older schema used term/phrase as PK).
    const vocabCols = this.db.exec("PRAGMA table_info(vocab_stats);")?.[0]?.values ?? [];
    const vocabColNames = new Set(vocabCols.map((r) => String(r?.[1] ?? "")));
    if (!vocabColNames.has("lang")) {
      this.db.exec(`
        BEGIN;
        DROP TABLE IF EXISTS vocab_stats_v2;
        CREATE TABLE vocab_stats_v2 (
          lang TEXT NOT NULL,
          term TEXT NOT NULL,
          countWrong INTEGER NOT NULL,
          lastWrongAt INTEGER NOT NULL,
          PRIMARY KEY (lang, term)
        );
        INSERT INTO vocab_stats_v2 (lang, term, countWrong, lastWrongAt)
          SELECT 'en' AS lang, term, countWrong, lastWrongAt FROM vocab_stats;
        DROP TABLE vocab_stats;
        ALTER TABLE vocab_stats_v2 RENAME TO vocab_stats;
        COMMIT;
      `);
    }

    const phraseCols = this.db.exec("PRAGMA table_info(phrase_stats);")?.[0]?.values ?? [];
    const phraseColNames = new Set(phraseCols.map((r) => String(r?.[1] ?? "")));
    if (!phraseColNames.has("lang")) {
      this.db.exec(`
        BEGIN;
        DROP TABLE IF EXISTS phrase_stats_v2;
        CREATE TABLE phrase_stats_v2 (
          lang TEXT NOT NULL,
          phrase TEXT NOT NULL,
          countLowAccuracy INTEGER NOT NULL,
          lastAt INTEGER NOT NULL,
          PRIMARY KEY (lang, phrase)
        );
        INSERT INTO phrase_stats_v2 (lang, phrase, countLowAccuracy, lastAt)
          SELECT 'en' AS lang, phrase, countLowAccuracy, lastAt FROM phrase_stats;
        DROP TABLE phrase_stats;
        ALTER TABLE phrase_stats_v2 RENAME TO phrase_stats;
        COMMIT;
      `);
    }

    const profilesCount = this.db.exec("SELECT COUNT(*) AS c FROM ai_profiles;")?.[0]?.values?.[0]?.[0];
    if (typeof profilesCount === "number" && profilesCount === 0) {
      const legacy = this.getLegacySettingsForMigration();
      const t = nowMs();

      const localBaseUrl =
        legacy && legacy.provider !== "MOCK" && looksLikeLocalBaseUrl(legacy.baseUrl)
          ? legacy.baseUrl
          : "http://localhost:1234/v1";
      const localModel = legacy && legacy.provider !== "MOCK" ? legacy.model : "";

      this.db.run(
        "INSERT INTO ai_profiles (id, name, kind, providerType, baseUrl, model, endpointMode, workspaceSlug, anythingllmMode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        [
          DEFAULT_LOCAL_PROFILE_ID,
          "Local (LM Studio)",
          "LOCAL",
          "LM_STUDIO_OPENAI_COMPAT",
          localBaseUrl,
          localModel,
          "chat_completions",
          "",
          "chat",
          t,
          t
        ]
      );
      this.db.run(
        "INSERT INTO ai_profiles (id, name, kind, providerType, baseUrl, model, endpointMode, workspaceSlug, anythingllmMode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        [
          DEFAULT_ANYTHINGLLM_PROFILE_ID,
          "AnythingLLM",
          "LOCAL",
          "ANYTHINGLLM_DEV_API",
          "http://localhost:3001",
          "",
          "chat_completions",
          "",
          "chat",
          t,
          t
        ]
      );
      this.db.run(
        "INSERT INTO ai_profiles (id, name, kind, providerType, baseUrl, model, endpointMode, workspaceSlug, anythingllmMode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        [
          DEFAULT_OPENAI_PROFILE_ID,
          "OpenAI Cloud",
          "OPENAI_CLOUD",
          "LM_STUDIO_OPENAI_COMPAT",
          "https://api.openai.com/v1",
          "",
          "chat_completions",
          "",
          "chat",
          t,
          t
        ]
      );
    }

    // Ensure AnythingLLM profile exists after upgrades.
    const anythingCount = this.db.exec("SELECT COUNT(*) AS c FROM ai_profiles WHERE id=?;", [DEFAULT_ANYTHINGLLM_PROFILE_ID])?.[0]?.values?.[0]?.[0];
    if (typeof anythingCount === "number" && anythingCount === 0) {
      const t = nowMs();
      this.db.run(
        "INSERT INTO ai_profiles (id, name, kind, providerType, baseUrl, model, endpointMode, workspaceSlug, anythingllmMode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        [
          DEFAULT_ANYTHINGLLM_PROFILE_ID,
          "AnythingLLM",
          "LOCAL",
          "ANYTHINGLLM_DEV_API",
          "http://localhost:3001",
          "",
          "chat_completions",
          "",
          "chat",
          t,
          t
        ]
      );
    }

    const appCount = this.db.exec("SELECT COUNT(*) AS c FROM app_settings;")?.[0]?.values?.[0]?.[0];
    if (typeof appCount === "number" && appCount === 0) {
      this.db.run("INSERT INTO app_settings (id, activeProfileId) VALUES (1, ?);", [DEFAULT_LOCAL_PROFILE_ID]);
    }
  }

  private getLegacySettingsForMigration(): null | { provider: string; baseUrl: string; model: string } {
    try {
      const stmt = this.db.prepare("SELECT provider, baseUrl, model FROM settings WHERE id=1;");
      try {
        const row = stmt.step() ? (stmt.getAsObject() as Record<string, unknown>) : null;
        if (!row) return null;
        return {
          provider: asText(row.provider, "MOCK"),
          baseUrl: asText(row.baseUrl, ""),
          model: asText(row.model, "")
        };
      } finally {
        stmt.free();
      }
    } catch {
      return null;
    }
  }

  private seedDemo() {
    const sessionId = getStableUuid();
    const t = nowMs();
    this.db.run(
      "INSERT INTO sessions (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?);",
      [sessionId, "Demo session", t, t]
    );
    this.db.run(
      "INSERT INTO messages (id, sessionId, role, content, createdAt) VALUES (?, ?, ?, ?, ?);",
      [
        getStableUuid(),
        sessionId,
        "assistant",
        "Hi! Open Settings to pick an AI profile (LM Studio / AnythingLLM), then press Hablar.",
        t
      ]
    );
  }

  private schedulePersist() {
    if (this.persistTimer) window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => void this.persistNow(), 250);
  }

  async persistNow() {
    const data = this.db.export();
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    await set(DB_KEY, buf);
  }

  listAiProfiles(): AiProfile[] {
    const stmt = this.db.prepare(
      "SELECT id, name, providerType, baseUrl, model, workspaceSlug, anythingllmMode, createdAt, updatedAt FROM ai_profiles ORDER BY createdAt ASC;"
    );
    try {
      const rows = rowsFromStmt<Record<string, unknown>>(stmt);
      return rows.map((r) => ({
        id: asText(r.id),
        name: asText(r.name),
        providerType: asProviderType(r.providerType),
        baseUrl: asText(r.baseUrl),
        model: asText(r.model),
        workspaceSlug: asText(r.workspaceSlug),
        anythingllmMode: asAnythingMode(r.anythingllmMode),
        createdAt: asNumber(r.createdAt),
        updatedAt: asNumber(r.updatedAt)
      }));
    } finally {
      stmt.free();
    }
  }

  upsertAiProfile(
    profile: Pick<
      AiProfile,
      "id" | "name" | "providerType" | "baseUrl" | "model" | "workspaceSlug" | "anythingllmMode"
    >
  ) {
    const now = nowMs();
    const existing = this.db.exec("SELECT COUNT(*) AS c FROM ai_profiles WHERE id=?;", [profile.id])?.[0]?.values?.[0]?.[0];
    const has = typeof existing === "number" && existing > 0;

    if (!has) {
      this.db.run(
        "INSERT INTO ai_profiles (id, name, kind, providerType, baseUrl, model, endpointMode, workspaceSlug, anythingllmMode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        [
          profile.id,
          profile.name,
          "LOCAL",
          profile.providerType,
          profile.baseUrl,
          profile.model,
          "chat_completions",
          profile.workspaceSlug,
          profile.anythingllmMode,
          now,
          now
        ]
      );
    } else {
      this.db.run(
        "UPDATE ai_profiles SET name=?, providerType=?, baseUrl=?, model=?, workspaceSlug=?, anythingllmMode=?, updatedAt=? WHERE id=?;",
        [profile.name, profile.providerType, profile.baseUrl, profile.model, profile.workspaceSlug, profile.anythingllmMode, now, profile.id]
      );
    }
    this.schedulePersist();
  }

  getActiveAiProfileId(): string {
    const stmt = this.db.prepare("SELECT activeProfileId FROM app_settings WHERE id=1;");
    try {
      const row = stmt.step() ? (stmt.getAsObject() as Record<string, unknown>) : null;
      const id = row ? asText(row.activeProfileId, DEFAULT_LOCAL_PROFILE_ID) : DEFAULT_LOCAL_PROFILE_ID;
      return id || DEFAULT_LOCAL_PROFILE_ID;
    } finally {
      stmt.free();
    }
  }

  setActiveAiProfileId(profileId: string) {
    this.db.run(
      "INSERT INTO app_settings (id, activeProfileId) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET activeProfileId=excluded.activeProfileId;",
      [profileId]
    );
    this.schedulePersist();
  }

  listSessions(): SessionRow[] {
    const stmt = this.db.prepare(
      "SELECT id, title, createdAt, updatedAt FROM sessions ORDER BY updatedAt DESC;"
    );
    try {
      return rowsFromStmt<SessionRow>(stmt);
    } finally {
      stmt.free();
    }
  }

  createSession(title?: string): string {
    const sessionId = getStableUuid();
    const t = nowMs();
    this.db.run(
      "INSERT INTO sessions (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?);",
      [sessionId, title || "New session", t, t]
    );
    this.schedulePersist();
    return sessionId;
  }

  renameSession(sessionId: string, title: string) {
    this.db.run("UPDATE sessions SET title=?, updatedAt=? WHERE id=?;", [title, nowMs(), sessionId]);
    this.schedulePersist();
  }

  listMessages(sessionId: string): MessageRow[] {
    const stmt = this.db.prepare(
      "SELECT id, sessionId, role, content, createdAt FROM messages WHERE sessionId=? ORDER BY createdAt ASC;",
      [sessionId]
    );
    try {
      return rowsFromStmt<MessageRow>(stmt) as MessageRow[];
    } finally {
      stmt.free();
    }
  }

  addMessage(sessionId: string, role: MessageRow["role"], content: string) {
    const t = nowMs();
    this.db.run(
      "INSERT INTO messages (id, sessionId, role, content, createdAt) VALUES (?, ?, ?, ?, ?);",
      [getStableUuid(), sessionId, role, content, t]
    );
    this.db.run("UPDATE sessions SET updatedAt=? WHERE id=?;", [t, sessionId]);
    this.schedulePersist();
  }

  addTurn(sessionId: string, turn: Omit<TurnRow, "id" | "sessionId" | "createdAt">) {
    const t = nowMs();
    this.db.run(
      "INSERT INTO turns (id, sessionId, kind, transcriptText, correctedUserText, explanationEs, styleSuggestionsJson, assistantReplyText, targetText, pronunciationTokensJson, providerUsed, warning, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      [
        getStableUuid(),
        sessionId,
        turn.kind,
        turn.transcriptText,
        turn.correctedUserText,
        turn.explanationEs,
        turn.styleSuggestionsJson,
        turn.assistantReplyText,
        turn.targetText,
        turn.pronunciationTokensJson,
        turn.providerUsed,
        turn.warning,
        t
      ]
    );
    this.db.run("UPDATE sessions SET updatedAt=? WHERE id=?;", [t, sessionId]);
    this.schedulePersist();
  }

  getLastTurn(sessionId: string): TurnRow | null {
    const stmt = this.db.prepare(
      "SELECT id, sessionId, kind, transcriptText, correctedUserText, explanationEs, styleSuggestionsJson, assistantReplyText, targetText, pronunciationTokensJson, providerUsed, warning, createdAt FROM turns WHERE sessionId=? ORDER BY createdAt DESC LIMIT 1;",
      [sessionId]
    );
    try {
      const rows = rowsFromStmt<TurnRow>(stmt);
      return rows[0] ?? null;
    } finally {
      stmt.free();
    }
  }

  listLessonsProgress(): LessonProgressRow[] {
    const stmt = this.db.prepare(
      "SELECT lessonId, status, startedAt, completedAt, lastStepId, scoreSummaryJson FROM lessons_progress ORDER BY startedAt DESC;"
    );
    try {
      return rowsFromStmt<LessonProgressRow>(stmt);
    } finally {
      stmt.free();
    }
  }

  getLessonProgress(lessonId: string): LessonProgressRow | null {
    const stmt = this.db.prepare(
      "SELECT lessonId, status, startedAt, completedAt, lastStepId, scoreSummaryJson FROM lessons_progress WHERE lessonId=?;",
      [lessonId]
    );
    try {
      const row = stmt.step() ? (stmt.getAsObject() as LessonProgressRow) : null;
      if (!row) return null;
      return {
        lessonId: asText((row as unknown as Record<string, unknown>).lessonId),
        status: asText((row as unknown as Record<string, unknown>).status) as LessonProgressRow["status"],
        startedAt: asNumber((row as unknown as Record<string, unknown>).startedAt),
        completedAt: (row as unknown as Record<string, unknown>).completedAt == null ? null : asNumber((row as unknown as Record<string, unknown>).completedAt),
        lastStepId: asText((row as unknown as Record<string, unknown>).lastStepId, "") || null,
        scoreSummaryJson: asText((row as unknown as Record<string, unknown>).scoreSummaryJson, "{}")
      };
    } finally {
      stmt.free();
    }
  }

  ensureLessonStarted(lessonId: string) {
    const existing = this.db.exec("SELECT COUNT(*) AS c FROM lessons_progress WHERE lessonId=?;", [lessonId])?.[0]?.values?.[0]?.[0];
    const has = typeof existing === "number" && existing > 0;
    if (has) return;

    const t = nowMs();
    this.db.run(
      "INSERT INTO lessons_progress (lessonId, status, startedAt, completedAt, lastStepId, scoreSummaryJson) VALUES (?, ?, ?, ?, ?, ?);",
      [lessonId, "in_progress", t, null, null, "{}"]
    );
    this.schedulePersist();
  }

  setLessonLastStep(lessonId: string, stepId: string | null) {
    this.ensureLessonStarted(lessonId);
    this.db.run("UPDATE lessons_progress SET lastStepId=? WHERE lessonId=?;", [stepId, lessonId]);
    this.schedulePersist();
  }

  setLessonCompleted(lessonId: string, scoreSummaryJson: string) {
    this.ensureLessonStarted(lessonId);
    const t = nowMs();
    this.db.run(
      "UPDATE lessons_progress SET status='completed', completedAt=?, scoreSummaryJson=? WHERE lessonId=?;",
      [t, scoreSummaryJson, lessonId]
    );
    this.schedulePersist();
  }

  recordLessonStepAttempt(lessonId: string, stepId: string, score: number): LessonStepProgressRow {
    this.ensureLessonStarted(lessonId);
    const now = nowMs();

    const stmt = this.db.prepare(
      "SELECT attempts, bestScore FROM lesson_step_progress WHERE lessonId=? AND stepId=?;",
      [lessonId, stepId]
    );
    let attempts = 0;
    let bestScore = 0;
    try {
      const row = stmt.step() ? (stmt.getAsObject() as Record<string, unknown>) : null;
      if (row) {
        attempts = asNumber(row.attempts, 0);
        bestScore = asNumber(row.bestScore, 0);
      }
    } finally {
      stmt.free();
    }

    attempts += 1;
    bestScore = Math.max(bestScore, score);

    const exists = this.db.exec(
      "SELECT COUNT(*) AS c FROM lesson_step_progress WHERE lessonId=? AND stepId=?;",
      [lessonId, stepId]
    )?.[0]?.values?.[0]?.[0];
    const has = typeof exists === "number" && exists > 0;
    if (has) {
      this.db.run(
        "UPDATE lesson_step_progress SET attempts=?, bestScore=?, lastAttemptAt=? WHERE lessonId=? AND stepId=?;",
        [attempts, bestScore, now, lessonId, stepId]
      );
    } else {
      this.db.run(
        "INSERT INTO lesson_step_progress (lessonId, stepId, attempts, bestScore, lastAttemptAt) VALUES (?, ?, ?, ?, ?);",
        [lessonId, stepId, attempts, bestScore, now]
      );
    }
    this.schedulePersist();

    return { lessonId, stepId, attempts, bestScore, lastAttemptAt: now };
  }

  listLessonStepProgress(lessonId: string): LessonStepProgressRow[] {
    const stmt = this.db.prepare(
      "SELECT lessonId, stepId, attempts, bestScore, lastAttemptAt FROM lesson_step_progress WHERE lessonId=?;",
      [lessonId]
    );
    try {
      return rowsFromStmt<LessonStepProgressRow>(stmt);
    } finally {
      stmt.free();
    }
  }

  bumpVocabWrong(lang: string, term: string) {
    const l = (lang || "en").trim().toLowerCase() || "en";
    const t = term.trim();
    if (!t) return;
    const now = nowMs();
    const existing = this.db.exec("SELECT countWrong FROM vocab_stats WHERE lang=? AND term=?;", [l, t])?.[0]?.values?.[0]?.[0];
    const count = typeof existing === "number" ? existing : 0;
    if (count > 0) {
      this.db.run("UPDATE vocab_stats SET countWrong=?, lastWrongAt=? WHERE lang=? AND term=?;", [count + 1, now, l, t]);
    } else {
      this.db.run("INSERT INTO vocab_stats (lang, term, countWrong, lastWrongAt) VALUES (?, ?, ?, ?);", [l, t, 1, now]);
    }
    this.schedulePersist();
  }

  bumpPhraseLowAccuracy(lang: string, phrase: string) {
    const l = (lang || "en").trim().toLowerCase() || "en";
    const p = phrase.trim();
    if (!p) return;
    const now = nowMs();
    const existing = this.db.exec("SELECT countLowAccuracy FROM phrase_stats WHERE lang=? AND phrase=?;", [l, p])?.[0]?.values?.[0]?.[0];
    const count = typeof existing === "number" ? existing : 0;
    if (count > 0) {
      this.db.run("UPDATE phrase_stats SET countLowAccuracy=?, lastAt=? WHERE lang=? AND phrase=?;", [count + 1, now, l, p]);
    } else {
      this.db.run("INSERT INTO phrase_stats (lang, phrase, countLowAccuracy, lastAt) VALUES (?, ?, ?, ?);", [l, p, 1, now]);
    }
    this.schedulePersist();
  }

  listTopVocabStats(lang: string, limit = 10): VocabStatRow[] {
    const l = (lang || "en").trim().toLowerCase() || "en";
    const stmt = this.db.prepare(
      "SELECT term, countWrong, lastWrongAt FROM vocab_stats WHERE lang=? ORDER BY countWrong DESC, lastWrongAt DESC LIMIT ?;",
      [l, limit]
    );
    try {
      return rowsFromStmt<VocabStatRow>(stmt);
    } finally {
      stmt.free();
    }
  }

  listTopPhraseStats(lang: string, limit = 10): PhraseStatRow[] {
    const l = (lang || "en").trim().toLowerCase() || "en";
    const stmt = this.db.prepare(
      "SELECT phrase, countLowAccuracy, lastAt FROM phrase_stats WHERE lang=? ORDER BY countLowAccuracy DESC, lastAt DESC LIMIT ?;",
      [l, limit]
    );
    try {
      return rowsFromStmt<PhraseStatRow>(stmt);
    } finally {
      stmt.free();
    }
  }

  markVocabMastered(lang: string, term: string) {
    const l = (lang || "en").trim().toLowerCase() || "en";
    const t = term.trim();
    if (!t) return;
    this.db.run("DELETE FROM vocab_stats WHERE lang=? AND term=?;", [l, t]);
    this.schedulePersist();
  }

  markPhraseMastered(lang: string, phrase: string) {
    const l = (lang || "en").trim().toLowerCase() || "en";
    const p = phrase.trim();
    if (!p) return;
    this.db.run("DELETE FROM phrase_stats WHERE lang=? AND phrase=?;", [l, p]);
    this.schedulePersist();
  }
}
