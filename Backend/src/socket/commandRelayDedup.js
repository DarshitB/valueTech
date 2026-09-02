/**
 * In-memory duplicate protection for command relay (Phase 2.4).
 *
 * Tracks (spreadsheetId, userId, client_sequence) tuples so reconnect
 * retries do not broadcast the same command twice.
 *
 * Per-user keys are cleared on spreadsheet:join so a refreshed client that
 * starts sequences over is not silently dropped while others stay in the room.
 * The full spreadsheet set is still cleared when the Socket.IO room is emptied.
 */

const seenKeys = new Set();

function buildKey(spreadsheetId, userId, clientSequence) {
  return `${spreadsheetId}:${userId}:${clientSequence}`;
}

/**
 * Returns true when this client_sequence was already relayed for the user.
 *
 * @param {string} spreadsheetId
 * @param {number|string} userId
 * @param {number} clientSequence
 * @returns {boolean}
 */
function isDuplicateClientSequence(spreadsheetId, userId, clientSequence) {
  const key = buildKey(spreadsheetId, userId, clientSequence);
  if (seenKeys.has(key)) {
    return true;
  }

  seenKeys.add(key);
  return false;
}

/**
 * Remove duplicate-tracking entries for one user in a spreadsheet room.
 * Does not touch other users' keys.
 *
 * @param {string} spreadsheetId
 * @param {number|string} userId
 */
function clearUserDedup(spreadsheetId, userId) {
  if (!spreadsheetId || userId == null || userId === "") {
    return;
  }

  const prefix = `${spreadsheetId}:${userId}:`;

  for (const key of seenKeys) {
    if (key.startsWith(prefix)) {
      seenKeys.delete(key);
    }
  }
}

/**
 * Remove duplicate-tracking entries for a spreadsheet room.
 *
 * @param {string} spreadsheetId
 */
function clearSpreadsheetDedup(spreadsheetId) {
  const prefix = `${spreadsheetId}:`;

  for (const key of seenKeys) {
    if (key.startsWith(prefix)) {
      seenKeys.delete(key);
    }
  }
}

module.exports = {
  isDuplicateClientSequence,
  clearUserDedup,
  clearSpreadsheetDedup,
};
