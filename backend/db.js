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
    user_id TEXT,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

ensureColumn("decisions", "user_id", "TEXT");
ensureColumn("alerts", "user_id", "TEXT");

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

export function listDecisions(userId) {
  return db
    .prepare("SELECT payload FROM decisions WHERE user_id = ? ORDER BY updated_at DESC")
    .all(userId)
    .map((row) => JSON.parse(row.payload));
}

export function upsertDecision(userId, decision) {
  db.prepare(`
    INSERT INTO decisions (id, user_id, payload, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `).run(decision.id, userId, JSON.stringify({ ...decision, userId }), decision.updatedAt || Date.now());
}

export function deleteDecision(userId, id) {
  db.prepare("DELETE FROM decisions WHERE user_id = ? AND id = ?").run(userId, id);
}

export function listAlerts(userId) {
  return db
    .prepare("SELECT payload FROM alerts WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId)
    .map((row) => JSON.parse(row.payload));
}

export function upsertAlert(userId, alert) {
  db.prepare(`
    INSERT INTO alerts (id, user_id, payload, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      payload = excluded.payload,
      created_at = excluded.created_at
  `).run(alert.id, userId, JSON.stringify({ ...alert, userId }), alert.createdAt || Date.now());
}

export function updateAlertReview(userId, alertId, reviewPatch) {
  const alert = listAlerts(userId).find((item) => item.id === alertId);
  if (!alert) return null;
  const nextAlert = {
    ...alert,
    review: {
      ...(alert.review || {}),
      ...reviewPatch,
      updatedAt: Date.now(),
    },
  };
  upsertAlert(userId, nextAlert);
  return nextAlert;
}

export function getDatabaseStats() {
  return {
    users: db.prepare("SELECT COUNT(*) AS total FROM users").get().total,
    sessions: db.prepare("SELECT COUNT(*) AS total FROM sessions").get().total,
    decisions: db.prepare("SELECT COUNT(*) AS total FROM decisions").get().total,
    alerts: db.prepare("SELECT COUNT(*) AS total FROM alerts").get().total,
    orphanDecisions: db.prepare("SELECT COUNT(*) AS total FROM decisions WHERE user_id IS NULL").get().total,
    orphanAlerts: db.prepare("SELECT COUNT(*) AS total FROM alerts WHERE user_id IS NULL").get().total,
  };
}
