/**
 * Dashboard and orders filters stay in this browser.
 * The key includes the user id, so one login does not keep another user's filters.
 * Older keys without a user id are left unread.
 */
export function userFilterStorageKey(baseKey, userId) {
  if (userId == null || userId === "") return null;
  return `${baseKey}__u${userId}`;
}

export function readUserFilter(baseKey, userId) {
  const key = userFilterStorageKey(baseKey, userId);
  if (!key) return "";
  return localStorage.getItem(key) || "";
}

export function writeUserFilter(baseKey, userId, value) {
  const key = userFilterStorageKey(baseKey, userId);
  if (!key) return;
  if (value == null || value === "") {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, String(value));
}

export function removeUserFilter(baseKey, userId) {
  const key = userFilterStorageKey(baseKey, userId);
  if (!key) return;
  localStorage.removeItem(key);
}
