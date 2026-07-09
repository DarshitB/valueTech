/**
 * In-memory duplicate protection for command relay (Phase 2.4).
 *
 * Tracks (spreadsheetId, userId, client_sequence) tuples so reconnect
 * retries do not broadcast the same command twice.
 *
 * Cleared when the spreadsheet Socket.IO room is emptied.
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
  clearSpreadsheetDedup,
};
