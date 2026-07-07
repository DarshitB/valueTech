/**
 * Spreadsheet presence handlers (Phase 2.1).
 *
 * Events (client → server):
 *   spreadsheet:join  { spreadsheet_id }
 *   spreadsheet:leave { spreadsheet_id }
 *
 * Events (server → client):
 *   spreadsheet:presence { spreadsheet_id, users: [{ userId, userName, socketId }] }
 *   spreadsheet:error   { message }
 *
 * Presence is in-memory only — no DB writes, no collaboration, no workbook sync.
 */

const { validate: isUuid } = require("uuid");
const presenceStore = require("./presenceStore");

const ROOM_PREFIX = "spreadsheet:";

function roomName(spreadsheetId) {
  return `${ROOM_PREFIX}${spreadsheetId}`;
}

function broadcastPresence(io, spreadsheetId) {
  io.to(roomName(spreadsheetId)).emit("spreadsheet:presence", {
    spreadsheet_id: spreadsheetId,
    users: presenceStore.getUsers(spreadsheetId),
  });
}

function validateSpreadsheetId(spreadsheetId) {
  return (
    typeof spreadsheetId === "string" &&
    spreadsheetId.length > 0 &&
    isUuid(spreadsheetId)
  );
}

/**
 * Register presence event handlers on a connected socket.
 *
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
function registerSpreadsheetPresence(io, socket) {
  // Join a spreadsheet presence room
  socket.on("spreadsheet:join", (payload = {}) => {
    const spreadsheetId = payload.spreadsheet_id;

    if (!validateSpreadsheetId(spreadsheetId)) {
      socket.emit("spreadsheet:error", {
        message: "Valid spreadsheet_id is required",
      });
      return;
    }

    const previous = presenceStore.leaveBySocket(socket.id);
    if (previous?.spreadsheetId && previous.spreadsheetId !== spreadsheetId) {
      socket.leave(roomName(previous.spreadsheetId));
      broadcastPresence(io, previous.spreadsheetId);
    }

    presenceStore.join(spreadsheetId, {
      userId: socket.user.id,
      userName: socket.user.name,
      socketId: socket.id,
    });

    socket.join(roomName(spreadsheetId));
    broadcastPresence(io, spreadsheetId);
  });

  // Explicit leave (e.g. navigating away without disconnect)
  socket.on("spreadsheet:leave", (payload = {}) => {
    const spreadsheetId = payload.spreadsheet_id;

    if (!validateSpreadsheetId(spreadsheetId)) {
      socket.emit("spreadsheet:error", {
        message: "Valid spreadsheet_id is required",
      });
      return;
    }

    const mapping = presenceStore.leaveBySocket(socket.id);
    const roomToLeave = mapping?.spreadsheetId || spreadsheetId;

    socket.leave(roomName(roomToLeave));
    broadcastPresence(io, roomToLeave);
  });

  // Disconnect — remove presence and notify remaining users
  socket.on("disconnect", () => {
    const mapping = presenceStore.leaveBySocket(socket.id);
    if (!mapping) return;

    broadcastPresence(io, mapping.spreadsheetId);
  });
}

module.exports = {
  registerSpreadsheetPresence,
  roomName,
};
