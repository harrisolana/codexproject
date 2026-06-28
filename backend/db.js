import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = join(process.cwd(), "data", "trading-alert-system.db");
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new DatabaseSync(databasePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'trader',
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

export function getAllUsers() {
  return db.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
}

export function findUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
}

export function findUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function insertUser(user) {
  db.prepare(`
    INSERT INTO users (id, email, name, role, password_hash, salt, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(user.id, user.email, user.name, user.role, user.passwordHash, user.salt, user.createdAt);
}

export function insertSession(session) {
  db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(session.token, session.userId, session.createdAt, session.expiresAt || null);
}

export function findSession(token) {
  return db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
}

export function deleteSession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function listDecisions() {
  return db.prepare("SELECT payload FROM decisions ORDER BY updated_at DESC").all().map((row) => JSON.parse(row.payload));
}

export function upsertDecision(decision) {
  db.prepare(`
    INSERT INTO decisions (id, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).run(decision.id, JSON.stringify(decision), decision.updatedAt || Date.now());
}

export function deleteDecision(id) {
  db.prepare("DELETE FROM decisions WHERE id = ?").run(id);
}

export function listAlerts() {
  return db.prepare("SELECT payload FROM alerts ORDER BY created_at DESC").all().map((row) => JSON.parse(row.payload));
}

export function upsertAlert(alert) {
  db.prepare(`
    INSERT INTO alerts (id, payload, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at
  `).run(alert.id, JSON.stringify(alert), alert.createdAt || Date.now());
}

export function updateAlertReview(alertId, reviewPatch) {
  const alert = listAlerts().find((item) => item.id === alertId);
  if (!alert) return null;
  const nextAlert = {
    ...alert,
    review: {
      ...(alert.review || {}),
      ...reviewPatch,
      updatedAt: Date.now(),
    },
  };
  upsertAlert(nextAlert);
  return nextAlert;
}
