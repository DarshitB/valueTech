const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

export const isR2SyncFeatureEnabled = () => {
  const value = process.env.REACT_APP_R2_SYNC_ENABLED;
  if (value === undefined || value === null || String(value).trim() === "") {
    return false;
  }
  return String(value).toLowerCase() === "true";
};

export const isAbsoluteUrl = (value) =>
  typeof value === "string" && /^https?:\/\//i.test(value);

const isLocalUploadsPath = (value) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const pathOnly = trimmed.split("?")[0].split("#")[0];
  return pathOnly === "/uploads" || pathOnly.startsWith("/uploads/");
};

/** True when media_url points at R2/CDN storage (not VPS /uploads). */
export const isRemoteR2MediaUrl = (mediaUrl) => {
  if (typeof mediaUrl !== "string" || !mediaUrl.trim()) return false;

  const raw = mediaUrl.trim();

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.path) return isRemoteR2MediaUrl(String(parsed.path));
    if (parsed?.link) return isRemoteR2MediaUrl(String(parsed.link));
  } catch {
    // Plain path or absolute URL.
  }

  if (isLocalUploadsPath(raw)) return false;

  if (!isAbsoluteUrl(raw)) return false;

  try {
    const url = new URL(raw);
    if (isLocalUploadsPath(url.pathname)) return false;

    const apiOrigin = new URL(API_BASE_URL).origin;
    if (url.origin === apiOrigin) return false;

    return true;
  } catch {
    return false;
  }
};

export const resolveAssetUrl = (value) => {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  if (isAbsoluteUrl(trimmed)) return trimmed;

  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${API_BASE_URL}${cleanPath}`;
};
