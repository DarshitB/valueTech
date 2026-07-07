import { colorFromSessionIndex } from "./spreadsheetPresenceColors";

/** Default grace period before a departed user's color index is released. */
export const DEFAULT_RECONNECT_GRACE_MS = 25_000;

const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * True when the id is a finite integer string (e.g. "42", "-3").
 * Used for deterministic ordering — not for authentication.
 */
function isNumericUserId(userId) {
  const value = String(userId ?? "").trim();
  return value.length > 0 && /^-?\d+$/.test(value);
}

/**
 * Deterministic ordering: numeric ids sort numerically, otherwise lexicographically.
 * Every client sorting the same user-id list produces the same assignment order.
 */
export function compareUserIds(left, right) {
  const a = String(left ?? "").trim();
  const b = String(right ?? "").trim();

  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  const aIsNumeric = isNumericUserId(a);
  const bIsNumeric = isNumericUserId(b);

  if (aIsNumeric && bIsNumeric) {
    const aNumber = Number(a);
    const bNumber = Number(b);
    if (aNumber < bNumber) return -1;
    if (aNumber > bNumber) return 1;
    return 0;
  }

  return a.localeCompare(b);
}

export function sortUserIdsDeterministically(userIds) {
  return [...userIds].sort(compareUserIds);
}

function isValidUserId(userId) {
  return typeof userId === "string" && userId.trim().length > 0;
}

function isValidColorIndex(index) {
  return Number.isInteger(index) && index >= 0;
}

function insertFreeIndexSorted(freeIndices, index) {
  let low = 0;
  let high = freeIndices.length;

  while (low < high) {
    const mid = (low + high) >> 1;
    if (freeIndices[mid] < index) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  freeIndices.splice(low, 0, index);
}

/**
 * Canonical snapshot shape for signatures and sessionStorage writes.
 * Sorting assignments and freeIndices keeps comparisons stable across calls.
 */
export function normalizeSessionColorSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return {
      assignments: {},
      nextIndex: 0,
      freeIndices: [],
    };
  }

  const rawAssignments = snapshot.assignments;
  const assignments = {};

  if (rawAssignments && typeof rawAssignments === "object") {
    sortUserIdsDeterministically(Object.keys(rawAssignments)).forEach((userId) => {
      const index = rawAssignments[userId];
      if (isValidUserId(userId) && isValidColorIndex(index)) {
        assignments[userId] = index;
      }
    });
  }

  const freeIndices = Array.isArray(snapshot.freeIndices)
    ? [...snapshot.freeIndices]
        .filter((index) => isValidColorIndex(index))
        .sort((left, right) => left - right)
    : [];

  const nextIndex =
    typeof snapshot.nextIndex === "number" &&
    Number.isInteger(snapshot.nextIndex) &&
    snapshot.nextIndex >= 0
      ? snapshot.nextIndex
      : 0;

  return {
    assignments,
    nextIndex,
    freeIndices,
  };
}

export function getSessionColorSnapshotSignature(snapshot) {
  return JSON.stringify(normalizeSessionColorSnapshot(snapshot));
}

/**
 * Development-only invariant checks. Never runs in production builds.
 */
function validateRegistryState(registry) {
  if (!IS_DEV) {
    return;
  }

  const indexOwners = new Map();
  const seenUserIds = new Set();
  const assignedIndices = new Set();

  registry.userIdToIndex.forEach((index, userId) => {
    if (seenUserIds.has(userId)) {
      console.warn(
        "[SpreadsheetSessionColorRegistry] Duplicate user id detected.",
        { userId }
      );
    } else {
      seenUserIds.add(userId);
    }

    if (indexOwners.has(index)) {
      console.warn(
        "[SpreadsheetSessionColorRegistry] Duplicate color index detected.",
        {
          index,
          users: [indexOwners.get(index), userId],
        }
      );
    } else {
      indexOwners.set(index, userId);
    }

    assignedIndices.add(index);
  });

  registry.freeIndices.forEach((index, position) => {
    if (assignedIndices.has(index)) {
      console.warn(
        "[SpreadsheetSessionColorRegistry] Free index overlaps an assigned index.",
        { index }
      );
    }

    if (position > 0 && registry.freeIndices[position - 1] >= index) {
      console.warn(
        "[SpreadsheetSessionColorRegistry] freeIndices is not strictly ascending.",
        { freeIndices: [...registry.freeIndices] }
      );
    }
  });

  const maxAssignedIndex = registry.userIdToIndex.size
    ? Math.max(...registry.userIdToIndex.values())
    : -1;
  const maxFreeIndex = registry.freeIndices.length
    ? Math.max(...registry.freeIndices)
    : -1;
  const minimumNextIndex = Math.max(maxAssignedIndex + 1, maxFreeIndex + 1, 0);

  if (registry.nextIndex < minimumNextIndex) {
    console.warn(
      "[SpreadsheetSessionColorRegistry] nextIndex is smaller than required.",
      {
        nextIndex: registry.nextIndex,
        minimumNextIndex,
      }
    );
  }
}

/**
 * Session color registry.
 *
 * Deterministic assignment:
 *   New online users receive indices in sorted user-id order so every browser
 *   converges on the same mapping for the same online set.
 *
 * Reconnect grace period:
 *   Departed users keep their index until the grace timer expires. Reconnecting
 *   during grace cancels the timer and restores the previous index.
 *
 * Release lifecycle:
 *   After grace expires, finalizePendingRelease() removes the user, returns the
 *   index to the sorted free pool, and notifies the persistence handler.
 *
 * Session restore:
 *   restoreFromSnapshot() rebuilds in-memory state from sessionStorage. syncOnlineUsers()
 *   then reconciles against live presence and pruneOrphanAssignments() drops stale rows.
 */
export class SpreadsheetSessionColorRegistry {
  constructor({ reconnectGraceMs = DEFAULT_RECONNECT_GRACE_MS } = {}) {
    this.reconnectGraceMs = reconnectGraceMs;
    this.userIdToIndex = new Map();
    this.pendingRelease = new Map();
    this.freeIndices = [];
    this.nextIndex = 0;
    this.persistHandler = null;
  }

  reset() {
    this.cancelAllPendingReleases();
    this.userIdToIndex.clear();
    this.freeIndices.length = 0;
    this.nextIndex = 0;
    this.persistHandler = null;
  }

  normalizeOnlineUserIds(users = []) {
    const onlineIds = new Set();

    users.forEach((user) => {
      const userId = String(user?.userId ?? "").trim();
      if (userId) {
        onlineIds.add(userId);
      }
    });

    return onlineIds;
  }

  /**
   * Signature of user→index mappings for users currently online.
   * Used to decide whether React identity consumers need to re-render.
   */
  getOnlineAssignmentSignature(onlineIds) {
    return sortUserIdsDeterministically([...onlineIds])
      .map((userId) => `${userId}:${this.userIdToIndex.get(userId) ?? "-"}`)
      .join("|");
  }

  getSnapshotSignature() {
    return getSessionColorSnapshotSignature(this.toSnapshot());
  }

  /**
   * Reconcile registry with the latest online user list.
   *
   * Persistence lifecycle:
   *   Returns snapshotChanged when stored state should be rewritten. The provider
   *   persists only when that flag is true.
   *
   * @returns {{ onlineAssignmentsChanged: boolean, snapshotChanged: boolean }}
   */
  syncOnlineUsers(users = []) {
    const onlineIds = this.normalizeOnlineUserIds(users);
    const beforeOnlineSignature = this.getOnlineAssignmentSignature(onlineIds);
    const beforeSnapshotSignature = this.getSnapshotSignature();

    onlineIds.forEach((userId) => {
      this.cancelPendingRelease(userId);
    });

    for (const userId of [...this.userIdToIndex.keys()]) {
      if (!onlineIds.has(userId) && !this.pendingRelease.has(userId)) {
        this.schedulePendingRelease(userId);
      }
    }

    const newUserIds = sortUserIdsDeterministically(
      [...onlineIds].filter((userId) => !this.userIdToIndex.has(userId))
    );

    newUserIds.forEach((userId) => {
      this.assignUser(userId);
    });

    this.pruneOrphanAssignments(onlineIds);

    validateRegistryState(this);

    return {
      onlineAssignmentsChanged:
        beforeOnlineSignature !== this.getOnlineAssignmentSignature(onlineIds),
      snapshotChanged:
        beforeSnapshotSignature !== this.getSnapshotSignature(),
    };
  }

  /**
   * Drop assignments that are neither online nor in an active reconnect grace window.
   * Keeps sessionStorage aligned with the current spreadsheet session.
   */
  pruneOrphanAssignments(onlineIds) {
    for (const userId of [...this.userIdToIndex.keys()]) {
      if (!onlineIds.has(userId) && !this.pendingRelease.has(userId)) {
        this.releaseUser(userId);
      }
    }
  }

  assignUser(userId) {
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId) {
      return undefined;
    }

    const existingIndex = this.userIdToIndex.get(normalizedUserId);
    if (existingIndex !== undefined) {
      return existingIndex;
    }

    const index = this.acquireIndex();
    this.userIdToIndex.set(normalizedUserId, index);
    return index;
  }

  schedulePendingRelease(userId) {
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId || this.pendingRelease.has(normalizedUserId)) {
      return;
    }

    const index = this.userIdToIndex.get(normalizedUserId);
    if (index === undefined) {
      return;
    }

    const timerId = setTimeout(() => {
      this.finalizePendingRelease(normalizedUserId);
    }, this.reconnectGraceMs);

    this.pendingRelease.set(normalizedUserId, { index, timerId });
  }

  cancelPendingRelease(userId) {
    const normalizedUserId = String(userId ?? "").trim();
    const pending = this.pendingRelease.get(normalizedUserId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timerId);
    this.pendingRelease.delete(normalizedUserId);
  }

  cancelAllPendingReleases() {
    this.pendingRelease.forEach(({ timerId }) => {
      clearTimeout(timerId);
    });
    this.pendingRelease.clear();
  }

  finalizePendingRelease(userId) {
    const normalizedUserId = String(userId ?? "").trim();
    const pending = this.pendingRelease.get(normalizedUserId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timerId);
    this.pendingRelease.delete(normalizedUserId);
    this.releaseUser(normalizedUserId);
    validateRegistryState(this);
    this.persistHandler?.();
  }

  setPersistHandler(handler) {
    this.persistHandler = typeof handler === "function" ? handler : null;
  }

  releaseUser(userId) {
    const normalizedUserId = String(userId ?? "").trim();
    const index = this.userIdToIndex.get(normalizedUserId);
    if (index === undefined) {
      return;
    }

    this.userIdToIndex.delete(normalizedUserId);
    insertFreeIndexSorted(this.freeIndices, index);
  }

  acquireIndex() {
    if (this.freeIndices.length > 0) {
      return this.freeIndices.shift();
    }

    const index = this.nextIndex;
    this.nextIndex += 1;
    return index;
  }

  getColorIndex(userId) {
    return this.userIdToIndex.get(String(userId ?? "").trim());
  }

  getColorForUser(userId) {
    const index = this.getColorIndex(userId);
    if (index === undefined) {
      return null;
    }

    return colorFromSessionIndex(index);
  }

  toSnapshot() {
    return normalizeSessionColorSnapshot({
      assignments: Object.fromEntries(this.userIdToIndex),
      nextIndex: this.nextIndex,
      freeIndices: [...this.freeIndices],
    });
  }

  /**
   * Restore in-memory assignments from sessionStorage.
   * Invalid, duplicate, or corrupted entries are ignored. Never throws.
   */
  restoreFromSnapshot(snapshot) {
    try {
      this.cancelAllPendingReleases();
      this.userIdToIndex.clear();
      this.freeIndices.length = 0;
      this.nextIndex = 0;

      if (!snapshot || typeof snapshot !== "object") {
        return;
      }

      const assignments = snapshot.assignments;
      if (!assignments || typeof assignments !== "object") {
        return;
      }

      const usedIndices = new Set();
      const seenUserIds = new Set();

      Object.entries(assignments).forEach(([rawUserId, rawIndex]) => {
        const normalizedUserId = String(rawUserId ?? "").trim();
        const index = rawIndex;

        if (!isValidUserId(normalizedUserId)) {
          return;
        }
        if (!isValidColorIndex(index)) {
          return;
        }
        if (seenUserIds.has(normalizedUserId)) {
          return;
        }
        if (usedIndices.has(index)) {
          return;
        }

        seenUserIds.add(normalizedUserId);
        usedIndices.add(index);
        this.userIdToIndex.set(normalizedUserId, index);
      });

      const seenFreeIndices = new Set(usedIndices);
      const restoredFreeIndices = Array.isArray(snapshot.freeIndices)
        ? snapshot.freeIndices
        : [];

      restoredFreeIndices.forEach((rawIndex) => {
        if (!isValidColorIndex(rawIndex)) {
          return;
        }
        if (seenFreeIndices.has(rawIndex)) {
          return;
        }

        seenFreeIndices.add(rawIndex);
        insertFreeIndexSorted(this.freeIndices, rawIndex);
      });

      const maxAssignedIndex = this.userIdToIndex.size
        ? Math.max(...this.userIdToIndex.values())
        : -1;
      const maxFreeIndex = this.freeIndices.length
        ? Math.max(...this.freeIndices)
        : -1;
      const restoredNextIndex =
        typeof snapshot.nextIndex === "number" &&
        Number.isInteger(snapshot.nextIndex) &&
        snapshot.nextIndex >= 0
          ? snapshot.nextIndex
          : 0;

      this.nextIndex = Math.max(
        restoredNextIndex,
        maxAssignedIndex + 1,
        maxFreeIndex + 1,
        0
      );

      validateRegistryState(this);
    } catch {
      this.cancelAllPendingReleases();
      this.userIdToIndex.clear();
      this.freeIndices.length = 0;
      this.nextIndex = 0;
    }
  }
}

export function createSpreadsheetSessionColorRegistry(options) {
  return new SpreadsheetSessionColorRegistry(options);
}
