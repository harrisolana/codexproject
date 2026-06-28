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

export function fetchBackendDecisions() {
  return requestJson("/api/decisions");
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

export function saveBackendDecision(decision) {
  return requestJson("/api/decisions", {
    method: "POST",
    body: JSON.stringify(decision),
  });
}

export function deleteBackendDecision(decisionId) {
  return requestJson(`/api/decisions/${encodeURIComponent(decisionId)}`, {
    method: "DELETE",
  });
}

export function fetchBackendAlerts() {
  return requestJson("/api/alerts");
}

export function saveBackendAlert(alert) {
  return requestJson("/api/alerts", {
    method: "POST",
    body: JSON.stringify(alert),
  });
}

export function saveBackendAlertReview(alertId, review) {
  return requestJson(`/api/alerts/${encodeURIComponent(alertId)}/review`, {
    method: "PATCH",
    body: JSON.stringify(review),
  });
}
