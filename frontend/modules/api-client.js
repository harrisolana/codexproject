async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }

  return response.json();
}

export async function isBackendAvailable() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const health = await requestJson("/api/health", { signal: controller.signal });
    clearTimeout(timer);
    return Boolean(health?.ok);
  } catch {
    return false;
  }
}

function authHeaders(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function fetchBackendDecisions(token) {
  return requestJson("/api/decisions", {
    headers: authHeaders(token),
  });
}

export function registerBackendUser({ email, name, passwordHash }) {
  return requestJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, name, passwordHash }),
  });
}

export function loginBackendUser({ email, passwordHash }) {
  return requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, passwordHash }),
  });
}

export function fetchBackendMe(token) {
  return requestJson("/api/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  });
}

export function logoutBackendUser(token) {
  return requestJson("/api/auth/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

export function saveBackendDecision(decision, token) {
  return requestJson("/api/decisions", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(decision),
  });
}

export function deleteBackendDecision(decisionId, token) {
  return requestJson(`/api/decisions/${encodeURIComponent(decisionId)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export function fetchBackendAlerts(token) {
  return requestJson("/api/alerts", {
    headers: authHeaders(token),
  });
}

export function saveBackendAlert(alert, token) {
  return requestJson("/api/alerts", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(alert),
  });
}

export function saveBackendAlertReview(alertId, review, token) {
  return requestJson(`/api/alerts/${encodeURIComponent(alertId)}/review`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(review),
  });
}

export function fetchDatabaseStats() {
  return requestJson("/api/admin/database-stats");
}
