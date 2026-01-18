import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "./migrate.js";

export type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
  tokenVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type PasswordResetRow = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
  requestedIp: string | null;
  requestedUserAgent: string | null;
};

export type SessionRow = {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type TurnRow = {
  id: string;
  sessionId: string;
  userId: string;
  role: "user" | "assistant";
  text: string;
  metaJson: string | null;
  createdAt: number;
};

function nowMs() {
  return Date.now();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function defaultDbPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // backend/src/db -> backend/db/lingua.sqlite
  return path.resolve(here, "../../db/lingua.sqlite");
}

async function ensureDirForFile(filePath: string) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

function coerceUserRow(row: unknown): UserRow {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    email: String(r.email),
    passwordHash: String(r.password_hash),
    tokenVersion: Number(r.token_version ?? 0),
    createdAt: Number(r.created_at ?? 0),
    updatedAt: Number(r.updated_at ?? 0)
  };
}

function coercePasswordResetRow(row: unknown): PasswordResetRow {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    userId: String(r.user_id),
    tokenHash: String(r.token_hash),
    createdAt: Number(r.created_at ?? 0),
    expiresAt: Number(r.expires_at ?? 0),
    usedAt: r.used_at == null ? null : Number(r.used_at),
    requestedIp: r.requested_ip == null ? null : String(r.requested_ip),
    requestedUserAgent: r.requested_user_agent == null ? null : String(r.requested_user_agent)
  };
}

function coerceSessionRow(row: unknown): SessionRow {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    userId: String(r.user_id),
    title: String(r.title),
    createdAt: Number(r.created_at ?? 0),
    updatedAt: Number(r.updated_at ?? 0)
  };
}

function coerceTurnRow(row: unknown): TurnRow {
  const r = row as Record<string, unknown>;
  const role = String(r.role);
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    userId: String(r.user_id),
    role: role === "assistant" ? "assistant" : "user",
    text: String(r.text),
    metaJson: r.meta_json == null ? null : String(r.meta_json),
    createdAt: Number(r.created_at ?? 0)
  };
}

export class LinguaDb {
  private readonly db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.db = db;
  }

  static async open(opts?: { dbPath?: string; migrationsPath?: string; logger?: { info?: (msg: string) => void } }) {
    const dbPath = opts?.dbPath ?? defaultDbPath();
    await ensureDirForFile(dbPath);

    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode=WAL;");
    db.exec("PRAGMA foreign_keys=ON;");
    db.exec("PRAGMA busy_timeout=5000;");

    await migrateDb(db, { migrationsPath: opts?.migrationsPath, logger: opts?.logger });

    return new LinguaDb(db);
  }

  close() {
    this.db.close();
  }

  // Users
  createUser(input: { email: string; passwordHash: string }): UserRow {
    const email = normalizeEmail(input.email);
    const t = nowMs();
    const id = crypto.randomUUID();
    const stmt = this.db.prepare(
      "INSERT INTO users (id, email, password_hash, token_version, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?);"
    );
    stmt.run(id, email, input.passwordHash, t, t);
    return this.getUserById(id)!;
  }

  getUserByEmail(email: string): UserRow | null {
    const stmt = this.db.prepare(
      "SELECT id, email, password_hash, token_version, created_at, updated_at FROM users WHERE email=? LIMIT 1;"
    );
    const row = stmt.get(normalizeEmail(email));
    return row ? coerceUserRow(row) : null;
  }

  getUserById(id: string): UserRow | null {
    const stmt = this.db.prepare(
      "SELECT id, email, password_hash, token_version, created_at, updated_at FROM users WHERE id=? LIMIT 1;"
    );
    const row = stmt.get(id);
    return row ? coerceUserRow(row) : null;
  }

  bumpUserTokenVersion(userId: string): number {
    const t = nowMs();
    this.db.prepare("UPDATE users SET token_version = token_version + 1, updated_at=? WHERE id=?;").run(t, userId);
    const row = this.getUserById(userId);
    return row?.tokenVersion ?? 0;
  }

  updateUserPassword(userId: string, passwordHash: string) {
    const t = nowMs();
    this.db.prepare("UPDATE users SET password_hash=?, token_version = token_version + 1, updated_at=? WHERE id=?;").run(
      passwordHash,
      t,
      userId
    );
  }

  // Password resets
  createPasswordReset(input: {
    userId: string;
    tokenHash: string;
    expiresAt: number;
    requestedIp?: string | null;
    requestedUserAgent?: string | null;
  }): PasswordResetRow {
    const t = nowMs();
    const id = crypto.randomUUID();
    this.db
      .prepare(
        "INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at, used_at, requested_ip, requested_user_agent) VALUES (?, ?, ?, ?, ?, NULL, ?, ?);"
      )
      .run(id, input.userId, input.tokenHash, t, input.expiresAt, input.requestedIp ?? null, input.requestedUserAgent ?? null);

    const row = this.getPasswordResetById(id);
    if (!row) throw new Error("Failed to create password reset");
    return row;
  }

  getPasswordResetById(id: string): PasswordResetRow | null {
    const stmt = this.db.prepare(
      "SELECT id, user_id, token_hash, created_at, expires_at, used_at, requested_ip, requested_user_agent FROM password_resets WHERE id=? LIMIT 1;"
    );
    const row = stmt.get(id);
    return row ? coercePasswordResetRow(row) : null;
  }

  getPasswordResetByTokenHash(tokenHash: string): PasswordResetRow | null {
    const stmt = this.db.prepare(
      "SELECT id, user_id, token_hash, created_at, expires_at, used_at, requested_ip, requested_user_agent FROM password_resets WHERE token_hash=? LIMIT 1;"
    );
    const row = stmt.get(tokenHash);
    return row ? coercePasswordResetRow(row) : null;
  }

  markPasswordResetUsed(id: string) {
    const t = nowMs();
    this.db.prepare("UPDATE password_resets SET used_at=? WHERE id=?;").run(t, id);
  }

  // History sessions
  createSession(input: { userId: string; title: string }): SessionRow {
    const t = nowMs();
    const id = crypto.randomUUID();
    this.db.prepare("INSERT INTO sessions (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?);").run(
      id,
      input.userId,
      input.title.trim() || "New session",
      t,
      t
    );
    return this.getSessionById({ userId: input.userId, sessionId: id })!;
  }

  listSessions(input: { userId: string; limit: number; beforeUpdatedAt?: number | null }) {
    const before = input.beforeUpdatedAt && input.beforeUpdatedAt > 0 ? input.beforeUpdatedAt : nowMs() + 1;
    const limit = Math.max(1, Math.min(100, input.limit));
    const stmt = this.db.prepare(
      "SELECT id, user_id, title, created_at, updated_at FROM sessions WHERE user_id=? AND updated_at < ? ORDER BY updated_at DESC LIMIT ?;"
    );
    const rows = stmt.all(input.userId, before, limit) as unknown[];
    const sessions = rows.map(coerceSessionRow);
    const nextCursor = sessions.length === limit ? sessions[sessions.length - 1]!.updatedAt : null;
    return { sessions, nextCursor };
  }

  getSessionById(input: { userId: string; sessionId: string }): SessionRow | null {
    const stmt = this.db.prepare(
      "SELECT id, user_id, title, created_at, updated_at FROM sessions WHERE id=? AND user_id=? LIMIT 1;"
    );
    const row = stmt.get(input.sessionId, input.userId);
    return row ? coerceSessionRow(row) : null;
  }

  deleteSession(input: { userId: string; sessionId: string }): boolean {
    const stmt = this.db.prepare("DELETE FROM sessions WHERE id=? AND user_id=?;");
    const res = stmt.run(input.sessionId, input.userId) as { changes?: number };
    return (res.changes ?? 0) > 0;
  }

  // Turns
  addTurn(input: {
    userId: string;
    sessionId: string;
    role: "user" | "assistant";
    text: string;
    metaJson?: string | null;
  }): TurnRow {
    const session = this.getSessionById({ userId: input.userId, sessionId: input.sessionId });
    if (!session) throw new Error("Session not found");

    const t = nowMs();
    const id = crypto.randomUUID();

    const meta = input.metaJson ?? null;
    this.db
      .prepare(
        "INSERT INTO turns (id, session_id, user_id, role, text, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);"
      )
      .run(id, input.sessionId, input.userId, input.role, input.text, meta, t);

    // Update session updated_at; optionally rename on first user turn.
    const newTitle =
      input.role === "user" && session.title === "New session" ? input.text.trim().slice(0, 40) || session.title : session.title;
    this.db.prepare("UPDATE sessions SET title=?, updated_at=? WHERE id=? AND user_id=?;").run(newTitle, t, input.sessionId, input.userId);

    const row = this.getTurnById({ userId: input.userId, turnId: id });
    if (!row) throw new Error("Failed to create turn");
    return row;
  }

  getTurnById(input: { userId: string; turnId: string }): TurnRow | null {
    const stmt = this.db.prepare(
      "SELECT id, session_id, user_id, role, text, meta_json, created_at FROM turns WHERE id=? AND user_id=? LIMIT 1;"
    );
    const row = stmt.get(input.turnId, input.userId);
    return row ? coerceTurnRow(row) : null;
  }

  listTurns(input: { userId: string; sessionId: string; limit: number; beforeCreatedAt?: number | null }) {
    const before = input.beforeCreatedAt && input.beforeCreatedAt > 0 ? input.beforeCreatedAt : nowMs() + 1;
    const limit = Math.max(1, Math.min(200, input.limit));

    // Ownership enforced by join on sessions.user_id.
    const stmt = this.db.prepare(
      `SELECT t.id, t.session_id, t.user_id, t.role, t.text, t.meta_json, t.created_at
       FROM turns t
       JOIN sessions s ON s.id=t.session_id
       WHERE t.session_id=? AND s.user_id=? AND t.created_at < ?
       ORDER BY t.created_at DESC
       LIMIT ?;`
    );
    const rows = stmt.all(input.sessionId, input.userId, before, limit) as unknown[];
    const desc = rows.map(coerceTurnRow);
    const turns = [...desc].reverse(); // chronological
    const nextCursor = desc.length === limit ? desc[desc.length - 1]!.createdAt : null;
    return { turns, nextCursor };
  }
}

