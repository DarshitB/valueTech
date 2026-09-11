import { isLocalOnlyRealtimeCommand } from "@spreadsheet-wrapper/realtime/localOnlyCommands";

/** Max applied sequence IDs retained for duplicate detection. */
const MAX_APPLIED_SEQUENCES = 1000;

/** Max remote snapshots queued before pruning oldest non-critical entries. */
const MAX_REMOTE_QUEUE_SIZE = 500;

/** In-flight publish/apply older than this is treated as stuck and recovered. */
export const SYNC_IN_FLIGHT_STUCK_MS = 30_000;

/**
 * Shared in-memory coordination state for Phase 2.5 workbook sync.
 *
 * Bridges the publisher and subscriber without coupling them directly.
 * Relay-only — no persistence, no merge logic on the server.
 */
export function createWorkbookSyncCoordinator() {
  return {
    /** Incremented on every local workbook change eligible for realtime publish. */
    changeGeneration: 0,
    /** Generation captured when the last publish cycle completed. */
    publishedGeneration: 0,
    /** Last client_sequence emitted to the server. */
    lastPublishedClientSequence: 0,
    /** True while a publish serialization/emit is in progress. */
    publishInFlight: false,
    /** Timestamp when publishInFlight was set (for stuck recovery). */
    publishInFlightSince: 0,
    /** True while local edits have not yet been included in a completed publish. */
    localChangesPending: false,
    /** Highest server sequence applied to this client. */
    lastAppliedSequence: 0,
    /** Server sequences already applied — prevents duplicate applies. */
    appliedSequences: new Set(),
    /** Remote snapshots waiting to be applied, sorted by ascending sequence. */
    remoteQueue: [],
    /** Local commands waiting to be published in order. */
    localCommandQueue: [],
    /** Assigned by the subscriber — drains the remote queue in order. */
    flushRemoteQueue: async () => false,
  };
}

/**
 * Hold remotes only while this client is applying or publishing, so
 * executeCommand is not re-entered. Do not hold for localChangesPending:
 * that blocked incoming live updates until a local publish succeeded, which
 * never happened if the server dropped the local sequence.
 *
 * @param {ReturnType<typeof createWorkbookSyncCoordinator>} coordinator
 */
export function shouldHoldRemoteApplies(coordinator, isApplyingRemoteWorkbook) {
  return (
    coordinator.publishInFlight || Boolean(isApplyingRemoteWorkbook)
  );
}

/**
 * Record an applied server sequence and prune old entries to bound memory.
 *
 * @param {ReturnType<typeof createWorkbookSyncCoordinator>} coordinator
 * @param {number} sequence
 */
export function recordAppliedSequence(coordinator, sequence) {
  coordinator.appliedSequences.add(sequence);

  const pruneBelow = coordinator.lastAppliedSequence - MAX_APPLIED_SEQUENCES;
  if (pruneBelow > 0) {
    for (const appliedSequence of coordinator.appliedSequences) {
      if (appliedSequence < pruneBelow) {
        coordinator.appliedSequences.delete(appliedSequence);
      }
    }
  }

  while (coordinator.appliedSequences.size > MAX_APPLIED_SEQUENCES) {
    let oldestSequence = Infinity;
    for (const appliedSequence of coordinator.appliedSequences) {
      if (appliedSequence < oldestSequence) {
        oldestSequence = appliedSequence;
      }
    }
    if (!Number.isFinite(oldestSequence)) {
      break;
    }
    coordinator.appliedSequences.delete(oldestSequence);
  }
}

/**
 * Drop the oldest queued snapshots only when the queue exceeds the safety limit.
 * Full snapshots make the newest entries sufficient under pathological load.
 *
 * Ordering is preserved (filter only). The next sequence required for apply
 * (lastAppliedSequence + 1) is never pruned when it is still in the queue.
 *
 * @param {ReturnType<typeof createWorkbookSyncCoordinator>} coordinator
 */
export function pruneRemoteQueue(coordinator) {
  const queue = coordinator.remoteQueue;
  if (queue.length <= MAX_REMOTE_QUEUE_SIZE || queue.length === 0) {
    return;
  }

  const nextRequiredSequence = coordinator.lastAppliedSequence + 1;
  const highestSequence = queue[queue.length - 1].sequence;
  let minKeepSequence = Math.max(
    nextRequiredSequence,
    highestSequence - MAX_REMOTE_QUEUE_SIZE + 1
  );

  if (
    queue.some((entry) => entry.sequence === nextRequiredSequence) &&
    minKeepSequence > nextRequiredSequence
  ) {
    minKeepSequence = nextRequiredSequence;
  }

  coordinator.remoteQueue = queue.filter(
    (entry) => entry.sequence >= minKeepSequence
  );
}

/**
 * Insert a remote update into the queue, ignoring duplicates and stale sequences.
 *
 * @returns {boolean} Whether the queue changed.
 */
export function enqueueRemoteWorkbookUpdate(coordinator, update) {
  const { sequence } = update;

  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    return false;
  }

  if (sequence <= coordinator.lastAppliedSequence) {
    return false;
  }

  if (coordinator.appliedSequences.has(sequence)) {
    return false;
  }

  const queue = coordinator.remoteQueue;
  const existingIndex = queue.findIndex((entry) => entry.sequence === sequence);

  if (existingIndex >= 0) {
    queue[existingIndex] = update;
    return false;
  }

  const lastQueuedSequence =
    queue.length > 0 ? queue[queue.length - 1].sequence : null;

  if (lastQueuedSequence == null || sequence > lastQueuedSequence) {
    queue.push(update);
  } else {
    let inserted = false;
    for (let index = 0; index < queue.length; index += 1) {
      if (sequence < queue[index].sequence) {
        queue.splice(index, 0, update);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      queue.push(update);
    }
  }

  pruneRemoteQueue(coordinator);
  return true;
}

/**
 * Inspect the remote queue head without mutating it.
 *
 * V1 may skip gaps. V2 must pause and request replay instead.
 *
 * @param {ReturnType<typeof createWorkbookSyncCoordinator>} coordinator
 * @returns {{
 *   action: "empty" | "apply" | "drop_stale" | "gap",
 *   index?: number,
 *   expectedSequence?: number,
 *   receivedSequence?: number,
 * }}
 */
export function inspectRemoteQueueHead(coordinator) {
  if (!coordinator?.remoteQueue?.length) {
    return { action: "empty" };
  }

  const expectedSequence = coordinator.lastAppliedSequence + 1;
  const nextIndex = coordinator.remoteQueue.findIndex(
    (entry) => entry.sequence === expectedSequence
  );

  if (nextIndex >= 0) {
    return { action: "apply", index: nextIndex, expectedSequence };
  }

  const lowest = coordinator.remoteQueue[0];
  if (!lowest || lowest.sequence <= coordinator.lastAppliedSequence) {
    return { action: "drop_stale" };
  }

  return {
    action: "gap",
    expectedSequence,
    receivedSequence: lowest.sequence,
  };
}

export function shouldSkipRemoteSequenceGap(protocol) {
  return protocol !== "v2";
}

/**
 * Queue a local command for realtime publishing.
 *
 * @param {ReturnType<typeof createWorkbookSyncCoordinator>} coordinator
 * @param {{
 *   commandId: string,
 *   commandParams?: any,
 *   operationId?: string,
 *   clientId?: string,
 *   clientSequence?: number,
 *   requestId?: string,
 * }} command
 * @returns {boolean}
 */
export function enqueueLocalCommand(coordinator, command) {
  const commandId = String(command?.commandId ?? "").trim();
  if (!commandId || isLocalOnlyRealtimeCommand(commandId)) {
    return false;
  }

  coordinator.localCommandQueue.push({
    commandId,
    commandParams: command?.commandParams ?? null,
    operationId: command?.operationId || null,
    clientId: command?.clientId || null,
    clientSequence: command?.clientSequence || null,
    requestId: command?.requestId || null,
    inFlight: false,
  });
  return true;
}

export function peekNextLocalCommand(coordinator) {
  const head = coordinator.localCommandQueue[0];
  if (!head || head.inFlight) {
    return null;
  }
  return head;
}

export function markLocalCommandInFlight(coordinator, operationId) {
  const entry = coordinator.localCommandQueue.find(
    (item) => item.operationId === operationId
  );
  if (!entry) {
    return false;
  }
  entry.inFlight = true;
  return true;
}

export function clearLocalCommandInFlight(coordinator) {
  coordinator.localCommandQueue.forEach((entry) => {
    entry.inFlight = false;
  });
}

export function acknowledgeLocalCommand(coordinator, identity = {}) {
  const index = coordinator.localCommandQueue.findIndex((entry) => {
    if (
      identity.operationId &&
      entry.operationId &&
      entry.operationId === identity.operationId
    ) {
      return true;
    }
    if (
      identity.requestId &&
      entry.requestId &&
      entry.requestId === identity.requestId
    ) {
      return true;
    }
    return Boolean(
      identity.clientId &&
        Number.isSafeInteger(identity.clientSequence) &&
        entry.clientId === identity.clientId &&
        entry.clientSequence === identity.clientSequence
    );
  });

  if (index < 0) {
    return false;
  }

  coordinator.localCommandQueue.splice(index, 1);
  return true;
}

export function findOwnQueuedOperation(coordinator, identity = {}) {
  return (
    coordinator.localCommandQueue.find((entry) => {
      if (
        identity.operationId &&
        entry.operationId &&
        entry.operationId === identity.operationId
      ) {
        return true;
      }
      return Boolean(
        identity.clientId &&
          Number.isSafeInteger(identity.clientSequence) &&
          entry.clientId === identity.clientId &&
          entry.clientSequence === identity.clientSequence
      );
    }) || null
  );
}

/**
 * Clear a publish lock that was left behind by an unexpected failure.
 *
 * @param {ReturnType<typeof createWorkbookSyncCoordinator>} coordinator
 * @returns {boolean} Whether a stuck publish lock was recovered.
 */
export function recoverStuckPublish(coordinator) {
  if (!coordinator.publishInFlight) {
    return false;
  }

  if (Date.now() - coordinator.publishInFlightSince < SYNC_IN_FLIGHT_STUCK_MS) {
    return false;
  }

  coordinator.publishInFlight = false;
  coordinator.publishInFlightSince = 0;
  coordinator.localChangesPending = true;
  clearLocalCommandInFlight(coordinator);
  return true;
}

/**
 * @param {ReturnType<typeof createWorkbookSyncCoordinator>} coordinator
 */
export function beginPublishInFlight(coordinator) {
  coordinator.publishInFlight = true;
  coordinator.publishInFlightSince = Date.now();
}

/**
 * @param {ReturnType<typeof createWorkbookSyncCoordinator>} coordinator
 */
export function endPublishInFlight(coordinator) {
  coordinator.publishInFlight = false;
  coordinator.publishInFlightSince = 0;
}

/**
 * @param {ReturnType<typeof createWorkbookSyncCoordinator>} coordinator
 */
export function resetWorkbookSyncCoordinator(coordinator) {
  coordinator.changeGeneration = 0;
  coordinator.publishedGeneration = 0;
  coordinator.lastPublishedClientSequence = 0;
  coordinator.publishInFlight = false;
  coordinator.publishInFlightSince = 0;
  coordinator.localChangesPending = false;
  coordinator.lastAppliedSequence = 0;
  coordinator.appliedSequences.clear();
  coordinator.remoteQueue.length = 0;
  coordinator.localCommandQueue.length = 0;
}
