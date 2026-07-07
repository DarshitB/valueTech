/**
 * In-memory active-cell store for spreadsheet rooms (Phase 2.2).
 *
 * Structure:
 *   rooms: Map<spreadsheetId, Map<userId, { userId, userName, socketId, cell }>>
 *   socketIndex: Map<socketId, { spreadsheetId, userId }>
 *
 * One active-cell entry per user per room. Cleared on leave / disconnect.
 * Empty rooms are removed automatically.
 */

const rooms = new Map();
const socketIndex = new Map();

/**
 * Set or replace a user's active cell in a spreadsheet room.
 *
 * @param {string} spreadsheetId
 * @param {{ userId: number|string, userName: string, socketId: string, cell: string }} entry
 */
function set(spreadsheetId, entry) {
  const { userId, userName, socketId, cell } = entry;

  // Drop any previous active-cell entry for this socket
  clearBySocket(socketId);

  if (!rooms.has(spreadsheetId)) {
    rooms.set(spreadsheetId, new Map());
  }

  const room = rooms.get(spreadsheetId);
  const existing = room.get(userId);

  if (existing && existing.socketId !== socketId) {
    socketIndex.delete(existing.socketId);
  }

  room.set(userId, { userId, userName, socketId, cell });
  socketIndex.set(socketId, { spreadsheetId, userId });
}

/**
 * Remove active-cell entry by socketId.
 * Only clears if this socket is still the active entry for that user.
 *
 * @param {string} socketId
 * @returns {{ spreadsheetId: string, userId: number|string, userName: string, cell: string }|null}
 */
function clearBySocket(socketId) {
  const mapping = socketIndex.get(socketId);
  if (!mapping) return null;

  const { spreadsheetId, userId } = mapping;
  const room = rooms.get(spreadsheetId);
  let cleared = null;

  if (room) {
    const entry = room.get(userId);
    if (entry && entry.socketId === socketId) {
      cleared = { ...entry, spreadsheetId };
      room.delete(userId);
      if (room.size === 0) {
        rooms.delete(spreadsheetId);
      }
    }
  }

  socketIndex.delete(socketId);
  return cleared;
}

/**
 * Get all active-cell entries for a spreadsheet room.
 *
 * @param {string} spreadsheetId
 * @returns {Array<{ userId: number|string, userName: string, socketId: string, cell: string }>}
 */
function getCells(spreadsheetId) {
  const room = rooms.get(spreadsheetId);
  if (!room) return [];
  return Array.from(room.values());
}

/**
 * Check whether a room currently has any active-cell entries.
 *
 * @param {string} spreadsheetId
 * @returns {boolean}
 */
function hasRoom(spreadsheetId) {
  return rooms.has(spreadsheetId);
}

module.exports = {
  set,
  clearBySocket,
  getCells,
  hasRoom,
};
