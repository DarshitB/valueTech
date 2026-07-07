/**
 * In-memory sequence counters for workbook realtime updates (Phase 2.4).
 *
 * Assigns a monotonically increasing sequence per spreadsheet room so
 * clients can order incoming updates and Phase 2.5 can add conflict logic
 * without changing the event contract.
 *
 * Does not store workbook payloads — relay only.
 */

const roomSequences = new Map();

/**
 * Get the next sequence number for a spreadsheet room.
 *
 * @param {string} spreadsheetId
 * @returns {number}
 */
function nextSequence(spreadsheetId) {
  const current = roomSequences.get(spreadsheetId) || 0;
  const next = current + 1;
  roomSequences.set(spreadsheetId, next);
  return next;
}

/**
 * Remove the sequence counter for a spreadsheet room.
 * Called when the Socket.IO room is empty and no longer needed.
 *
 * @param {string} spreadsheetId
 */
function clearSequence(spreadsheetId) {
  roomSequences.delete(spreadsheetId);
}

module.exports = {
  nextSequence,
  clearSequence,
};
