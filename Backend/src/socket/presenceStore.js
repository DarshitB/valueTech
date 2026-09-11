/**
 * In-memory presence store for spreadsheet rooms.
 *
 * Structure:
 *   rooms: Map<spreadsheetId, Map<userId, { userId, userName, socketId }>>
 *   socketIndex: Map<socketId, { spreadsheetId, userId }>
 *
 * One entry per user per room — refresh replaces the previous socket
 * instead of creating a duplicate.
 */

const rooms = new Map();
const socketIndex = new Map();

/**
 * Add or replace a user in a spreadsheet room.
 * If the user already has a presence entry (e.g. page refresh),
 * the old socket mapping is removed and replaced.
 *
 * @param {string} spreadsheetId
 * @param {{ userId: number|string, userName: string, socketId: string }} user
 */
function join(spreadsheetId, user) {
  const { userId, userName, socketId } = user;

  // Leave any previous room this socket was in
  leaveBySocket(socketId);

  if (!rooms.has(spreadsheetId)) {
    rooms.set(spreadsheetId, new Map());
  }

  const room = rooms.get(spreadsheetId);
  const existing = room.get(userId);
  const replacedSocketId =
    existing && existing.socketId !== socketId ? existing.socketId : null;

  // Drop stale socket index if the user is reconnecting
  if (existing && existing.socketId !== socketId) {
    socketIndex.delete(existing.socketId);
  }

  room.set(userId, { userId, userName, socketId });
  socketIndex.set(socketId, { spreadsheetId, userId });
  return { replacedSocketId };
}

/**
 * Remove a user from a spreadsheet room by userId.
 *
 * @param {string} spreadsheetId
 * @param {number|string} userId
 * @returns {boolean} true if the user was present
 */
function leave(spreadsheetId, userId) {
  const room = rooms.get(spreadsheetId);
  if (!room) return false;

  const entry = room.get(userId);
  if (!entry) return false;

  room.delete(userId);
  socketIndex.delete(entry.socketId);

  if (room.size === 0) {
    rooms.delete(spreadsheetId);
  }

  return true;
}

/**
 * Remove presence by socketId (disconnect / leave).
 * Only removes the user if this socket is still the active one
 * for that user in the room (avoids wiping a refreshed connection).
 *
 * @param {string} socketId
 * @returns {{ spreadsheetId: string, userId: number|string }|null}
 */
function leaveBySocket(socketId) {
  const mapping = socketIndex.get(socketId);
  if (!mapping) return null;

  const { spreadsheetId, userId } = mapping;
  const room = rooms.get(spreadsheetId);

  if (room) {
    const entry = room.get(userId);
    // Only remove if this socket is still the active presence entry
    if (entry && entry.socketId === socketId) {
      room.delete(userId);
      if (room.size === 0) {
        rooms.delete(spreadsheetId);
      }
    }
  }

  socketIndex.delete(socketId);
  return { spreadsheetId, userId };
}

/**
 * Get the online user list for a spreadsheet room.
 *
 * @param {string} spreadsheetId
 * @returns {Array<{ userId: number|string, userName: string, socketId: string }>}
 */
function getUsers(spreadsheetId) {
  const room = rooms.get(spreadsheetId);
  if (!room) return [];
  return Array.from(room.values());
}

/**
 * Check whether a room currently has any users.
 *
 * @param {string} spreadsheetId
 * @returns {boolean}
 */
function hasRoom(spreadsheetId) {
  return rooms.has(spreadsheetId);
}

module.exports = {
  join,
  leave,
  leaveBySocket,
  getUsers,
  hasRoom,
};
