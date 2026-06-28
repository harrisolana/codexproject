import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { db, getDatabaseStats } from "../db.js";

const databasePath = join(process.cwd(), "data", "trading-alert-system.db");

const size = existsSync(databasePath) ? statSync(databasePath).size : 0;
const stats = getDatabaseStats();

console.log("SQLite database check");
console.log(`Path: ${databasePath}`);
console.log(`Size: ${size} bytes`);

console.log(`users: ${stats.users}`);
console.log(`sessions: ${stats.sessions}`);
console.log(`decisions: ${stats.decisions}`);
console.log(`alerts: ${stats.alerts}`);
console.log(`orphan decisions: ${stats.orphanDecisions}`);
console.log(`orphan alerts: ${stats.orphanAlerts}`);

if (stats.orphanAlerts || stats.orphanDecisions) {
  console.log("Note: orphan rows were created before user isolation and are hidden from normal user APIs.");
}

console.log("Status: ok");
