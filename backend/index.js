import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import {
  deleteDecision,
  deleteSession,
  findSession,
  findUserByEmail,
  findUserById,
  insertSession,
  insertUser,
  listAlerts,
  listDecisions,
  updateAlertReview,
  upsertAlert,
  upsertDecision,
} from "./db.js";

const PORT = Number(process.env.PORT || 5173);
const rootDir = process.cwd();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function notFound(response) {
  sendJson(response, 404, { error: "not_found" });
}

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function hashSecret(value) {
  return createHash("sha256").update(value).digest("hex");
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || "trader",
    accountType: "backend_local",
    createdAt: user.createdAt || user.created_at,
  };
}

function bearerToken(request) {
  const header = request.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function currentUserFromRequest(request) {
  const token = bearerToken(request);
  if (!token) return null;
  const session = findSession(token);
  if (!session) return null;
  if (session.expires_at && session.expires_at <= Date.now()) return null;
  return findUserById(session.user_id);
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "personal-trading-alert-system",
      mode: "mvp-local-backend",
      now: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === "/api/auth/register" && request.method === "POST") {
    const body = await readBody(request);
    const email = normalizeEmail(body.email);
    const name = String(body.name || email.split("@")[0] || "交易员").trim();
    const passwordHash = String(body.passwordHash || "");
    if (!email || !passwordHash) {
      sendJson(response, 400, { error: "missing_credentials" });
      return;
    }

    if (findUserByEmail(email)) {
      sendJson(response, 409, { error: "user_exists" });
      return;
    }

    const salt = randomUUID();
    const user = {
      id: `user-${Date.now()}`,
      email,
      name,
      role: "trader",
      passwordHash: hashSecret(`${passwordHash}:${salt}`),
      salt,
      createdAt: Date.now(),
    };
    const token = randomUUID();
    insertUser(user);
    insertSession({ token, userId: user.id, createdAt: Date.now() });
    sendJson(response, 201, { user: publicUser(user), token });
    return;
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readBody(request);
    const email = normalizeEmail(body.email);
    const passwordHash = String(body.passwordHash || "");
    const user = findUserByEmail(email);
    if (!user || user.password_hash !== hashSecret(`${passwordHash}:${user.salt}`)) {
      sendJson(response, 401, { error: "invalid_credentials" });
      return;
    }
    const token = randomUUID();
    insertSession({ token, userId: user.id, createdAt: Date.now() });
    sendJson(response, 200, { user: publicUser(user), token });
    return;
  }

  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    const user = await currentUserFromRequest(request);
    if (!user) {
      sendJson(response, 401, { error: "unauthorized" });
      return;
    }
    sendJson(response, 200, { user: publicUser(user) });
    return;
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = bearerToken(request);
    deleteSession(token);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/decisions") {
    if (request.method === "GET") {
      sendJson(response, 200, listDecisions());
      return;
    }
    if (request.method === "POST") {
      const body = await readBody(request);
      const item = { ...body, id: body.id || `decision-${Date.now()}`, updatedAt: Date.now() };
      upsertDecision(item);
      sendJson(response, 201, item);
      return;
    }
  }

  const decisionMatch = url.pathname.match(/^\/api\/decisions\/([^/]+)$/);
  if (decisionMatch && request.method === "DELETE") {
    const decisionId = decodeURIComponent(decisionMatch[1]);
    deleteDecision(decisionId);
    sendJson(response, 200, { ok: true, id: decisionId });
    return;
  }

  if (url.pathname === "/api/alerts") {
    if (request.method === "GET") {
      sendJson(response, 200, listAlerts());
      return;
    }
    if (request.method === "POST") {
      const body = await readBody(request);
      const item = { ...body, id: body.id || `alert-${Date.now()}`, createdAt: body.createdAt || Date.now() };
      upsertAlert(item);
      sendJson(response, 201, item);
      return;
    }
  }

  const reviewMatch = url.pathname.match(/^\/api\/alerts\/([^/]+)\/review$/);
  if (reviewMatch && request.method === "PATCH") {
    const alertId = decodeURIComponent(reviewMatch[1]);
    const body = await readBody(request);
    sendJson(response, 200, updateAlertReview(alertId, body));
    return;
  }

  notFound(response);
}

async function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(decodeURIComponent(requestedPath))
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = safePath.startsWith("node_modules") || safePath.startsWith("shared")
    ? join(rootDir, safePath)
    : join(rootDir, "frontend", safePath);

  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { error: "server_error", message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Trading alert system running at http://127.0.0.1:${PORT}/`);
});
