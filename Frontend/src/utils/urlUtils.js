const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

export const isAbsoluteUrl = (value) =>
  typeof value === "string" && /^https?:\/\//i.test(value);

export const resolveAssetUrl = (value) => {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  if (isAbsoluteUrl(trimmed)) return trimmed;

  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${API_BASE_URL}${cleanPath}`;
};
