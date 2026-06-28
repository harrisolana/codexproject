export function loadJson(key, fallback, storage = globalThis.localStorage) {
  try {
    if (!storage) return fallback;
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
}

export function removeItem(key, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.removeItem(key);
}
