/**
 * Spreadsheet collaboration identity helpers.
 * Session-unique colors are assigned by SpreadsheetSessionColorRegistry — not here.
 */

const GOLDEN_ANGLE = 137.508;

function getFirstName(userName) {
  return String(userName || "")
    .trim()
    .split(/\s+/)[0];
}

export function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = s * Math.min(l, 1 - l);

  const channel = (offset) => {
    const k = (offset + hue / 30) % 12;
    return l - chroma * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };

  const toHex = (value) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(channel(0))}${toHex(channel(8))}${toHex(channel(4))}`;
}

/**
 * Deterministic HSL palette entry for a session color index.
 * Uses the golden angle so hues stay evenly spaced for any number of users.
 */
export function colorFromSessionIndex(index) {
  const safeIndex = Number.isFinite(index) && index >= 0 ? index : 0;
  const hue = (safeIndex * GOLDEN_ANGLE) % 360;
  const saturation = 65 + (safeIndex % 3) * 5;
  const lightness = 45 + (Math.floor(safeIndex / 3) % 3) * 5;
  return hslToHex(hue, saturation, lightness);
}

/**
 * Resolve initials for a list of users, upgrading to two letters when first
 * initials collide (e.g. Darshit + Deep → DA, DE).
 */
export function resolveUserInitials(users = []) {
  const normalized = users.map((user) => ({
    userId: user?.userId,
    firstName: getFirstName(user?.userName),
  }));

  const singleInitialCounts = normalized.reduce((counts, user) => {
    const initial = user.firstName[0]?.toUpperCase();
    if (!initial) return counts;
    counts[initial] = (counts[initial] || 0) + 1;
    return counts;
  }, {});

  const initialsByUserId = new Map();

  normalized.forEach((user) => {
    const firstName = user.firstName;
    const singleInitial = firstName[0]?.toUpperCase() || "?";

    if (singleInitialCounts[singleInitial] > 1 && firstName.length >= 2) {
      initialsByUserId.set(
        String(user.userId),
        (firstName[0] + firstName[1]).toUpperCase()
      );
      return;
    }

    initialsByUserId.set(String(user.userId), singleInitial);
  });

  return initialsByUserId;
}

/**
 * Build the shared identity object from an already-assigned session color.
 */
export function buildUserIdentity(sessionColor, userName = "", initials = null) {
  const firstName = getFirstName(userName);
  const resolvedInitials =
    initials || firstName[0]?.toUpperCase() || "?";
  const color = sessionColor || "#6b7280";

  return {
    borderColor: color,
    labelBackground: color,
    labelColor: "#ffffff",
    avatarBackground: color,
    avatarTextColor: "#ffffff",
    initials: resolvedInitials,
  };
}

/**
 * @deprecated Use useSpreadsheetSessionColors().getUserIdentity inside a spreadsheet session.
 */
export function getUserIdentity(userId, userName = "", initials = null) {
  return buildUserIdentity("#6b7280", userName, initials);
}

/** @deprecated Use useSpreadsheetSessionColors().getUserIdentity */
export function getUserColor(userId, userName = "", initials = null) {
  return getUserIdentity(userId, userName, initials);
}

/** @deprecated Use useSpreadsheetSessionColors().getUserIdentity */
export function getPresenceColor(userId, userName = "", initials = null) {
  return getUserIdentity(userId, userName, initials);
}
