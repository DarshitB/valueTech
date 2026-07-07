/**
 * Spreadsheet active-cell handlers (Phase 2.2).
 *
 * Events (client → server):
 *   spreadsheet:active-cell { spreadsheet_id, cell }
 *
 * Events (server → client):
 *   spreadsheet:active-cell { spreadsheet_id, userId, userName, cell }
 *   spreadsheet:error       { message }
 *
 * On spreadsheet:join, the joining socket receives one spreadsheet:active-cell
 * event per existing user (snapshot). Live updates continue to use broadcast.
 *
 * Active-cell state is in-memory only. Cleared automatically on
 * spreadsheet:leave and disconnect. Does not modify Phase 2.1 presence.
 */

const { validate: isUuid } = require("uuid");
const activeCellStore = require("./activeCellStore");
const { roomName } = require("./spreadsheetPresence");

function validateSpreadsheetId(spreadsheetId) {
  return (
    typeof spreadsheetId === "string" &&
    spreadsheetId.length > 0 &&
    isUuid(spreadsheetId)
  );
}

function validateCell(cell) {
  return typeof cell === "string" && cell.trim().length > 0;
}

function isInSpreadsheetRoom(socket, spreadsheetId) {
  return socket.rooms.has(roomName(spreadsheetId));
}

/**
 * Broadcast active-cell update to every other socket in the room.
 *
 * @param {import("socket.io").Socket} socket
 * @param {string} spreadsheetId
 * @param {{ userId: number|string, userName: string, cell: string|null }} payload
 */
function broadcastActiveCell(socket, spreadsheetId, payload) {
  socket.to(roomName(spreadsheetId)).emit("spreadsheet:active-cell", {
    spreadsheet_id: spreadsheetId,
    userId: payload.userId,
    userName: payload.userName,
    cell: payload.cell,
  });
}

/**
 * Clear active-cell for this socket and notify remaining users in the room.
 *
 * @param {import("socket.io").Socket} socket
 */
function clearAndBroadcast(socket) {
  const cleared = activeCellStore.clearBySocket(socket.id);
  if (!cleared) return;

  broadcastActiveCell(socket, cleared.spreadsheetId, {
    userId: cleared.userId,
    userName: cleared.userName,
    cell: null,
  });
}

/**
 * Send the current active-cell snapshot to a newly joined socket only.
 * One event per existing user; excludes the joining user.
 *
 * @param {import("socket.io").Socket} socket
 * @param {string} spreadsheetId
 */
function emitActiveCellsSnapshot(socket, spreadsheetId) {
  const cells = activeCellStore.getCells(spreadsheetId);

  for (const entry of cells) {
    if (entry.userId === socket.user.id) continue;

    socket.emit("spreadsheet:active-cell", {
      spreadsheet_id: spreadsheetId,
      userId: entry.userId,
      userName: entry.userName,
      cell: entry.cell,
    });
  }
}

/**
 * Register active-cell event handlers on a connected socket.
 *
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
function registerSpreadsheetActiveCell(io, socket) {
  // Publish the user's currently focused cell
  socket.on("spreadsheet:active-cell", (payload = {}) => {
    const spreadsheetId = payload.spreadsheet_id;
    const cell = payload.cell;

    if (!validateSpreadsheetId(spreadsheetId)) {
      socket.emit("spreadsheet:error", {
        message: "Valid spreadsheet_id is required",
      });
      return;
    }

    if (!validateCell(cell)) {
      socket.emit("spreadsheet:error", {
        message: "cell must be a non-empty string",
      });
      return;
    }

    // Only sockets currently in the spreadsheet room may publish
    if (!isInSpreadsheetRoom(socket, spreadsheetId)) {
      socket.emit("spreadsheet:error", {
        message: "You must join the spreadsheet room before publishing active-cell",
      });
      return;
    }

    const trimmedCell = cell.trim();

    activeCellStore.set(spreadsheetId, {
      userId: socket.user.id,
      userName: socket.user.name,
      socketId: socket.id,
      cell: trimmedCell,
    });

    broadcastActiveCell(socket, spreadsheetId, {
      userId: socket.user.id,
      userName: socket.user.name,
      cell: trimmedCell,
    });
  });

  // Clear active-cell when the user leaves a spreadsheet room
  socket.on("spreadsheet:leave", (payload = {}) => {
    if (!validateSpreadsheetId(payload.spreadsheet_id)) return;
    clearAndBroadcast(socket);
  });

  // On join: clear previous active-cell, then send existing cursors to this socket only
  socket.on("spreadsheet:join", (payload = {}) => {
    const spreadsheetId = payload.spreadsheet_id;
    if (!validateSpreadsheetId(spreadsheetId)) return;

    clearAndBroadcast(socket);

    // Presence join runs first — only send snapshot if the room join succeeded
    if (!isInSpreadsheetRoom(socket, spreadsheetId)) return;

    emitActiveCellsSnapshot(socket, spreadsheetId);
  });

  // Clear active-cell on disconnect
  socket.on("disconnect", () => {
    clearAndBroadcast(socket);
  });
}

module.exports = {
  registerSpreadsheetActiveCell,
};
