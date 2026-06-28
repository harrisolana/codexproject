import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { db } from "../db.js";

const databasePath = join(process.cwd(), "data", "trading-alert-system.db");

function count(tableName) {
  return db.prepare(`SELECT COUNT(*) AS total FROM ${tableName}`).get().total;
}

const size = existsSync(databasePath) ? statSync(databasePath).size : 0;
const tables = ["users", "sessions", "decisions", "alerts"];

console.log("SQLite database check");
console.log(`Path: ${databasePath}`);
console.log(`Size: ${size} bytes`);

for (const table of tables) {
  console.log(`${table}: ${count(table)}`);
}

console.log("Status: ok");
