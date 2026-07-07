/**
 * Spreadsheet workbook realtime sync handlers (Phase 2.4).
 *
 * Events (client → server):
 *   spreadsheet:workbook-update { spreadsheet_id, workbook_data, client_sequence? }
 *
 * Events (server → client):
 *   spreadsheet:workbook-update {
 *     spreadsheet_id,
 *     userId,
 *     userName,
 *     workbook_data,
 *     sequence,
 *     client_sequence?
 *   }
 *   spreadsheet:error { message }
 *
 * Relay-only: no database writes, no REST calls, no workbook persistence.
 * Independent from Phase 2.1 presence and Phase 2.2 active-cell.
 *
 * Workbook payloads are opaque IWorkbookData snapshots produced by the
 * public Univer Facade API (workbook.save() on the client).
 */

const { validate: isUuid } = require("uuid");
const { roomName } = require("./spreadsheetPresence");
const { nextSequence, clearSequence } = require("./workbookSyncSequence");

function validateSpreadsheetId(spreadsheetId) {
  return (
    typeof spreadsheetId === "string" &&
    spreadsheetId.length > 0 &&
    isUuid(spreadsheetId)
  );
}

function validateWorkbookData(workbookData) {
  if (
    workbookData === null ||
    workbookData === undefined ||
    typeof workbookData !== "object" ||
    Array.isArray(workbookData)
  ) {
    return false;
  }

  // Minimum IWorkbookData shape from Univer workbook.save() — O(1) checks only
  if (typeof workbookData.id !== "string" || workbookData.id.length === 0) {
    return false;
  }

  const { sheets, sheetOrder, styles } = workbookData;

  if (
    typeof sheets !== "object" ||
    sheets === null ||
    Array.isArray(sheets)
  ) {
    return false;
  }

  if (!Array.isArray(sheetOrder)) {
    return false;
  }

  if (
    typeof styles !== "object" ||
    styles === null ||
    Array.isArray(styles)
  ) {
    return false;
  }

  return true;
}

function isInSpreadsheetRoom(socket, spreadsheetId) {
  return socket.rooms.has(roomName(spreadsheetId));
}

function emitSpreadsheetError(socket, message) {
  socket.emit("spreadsheet:error", { message });
}

/**
 * Broadcast a workbook update to every other socket in the spreadsheet room.
 *
 * @param {import("socket.io").Socket} socket
 * @param {string} spreadsheetId
 * @param {object} workbookData
 * @param {number} sequence
 * @param {number|undefined} clientSequence
 */
function broadcastWorkbookUpdate(
  socket,
  spreadsheetId,
  workbookData,
  sequence,
  clientSequence
) {
  const payload = {
    spreadsheet_id: spreadsheetId,
    userId: socket.user.id,
    userName: socket.user.name,
    workbook_data: workbookData,
    sequence,
  };

  if (typeof clientSequence === "number" && Number.isFinite(clientSequence)) {
    payload.client_sequence = clientSequence;
  }

  socket.to(roomName(spreadsheetId)).emit("spreadsheet:workbook-update", payload);
}

/**
 * Remove the sequence counter when the Socket.IO room has no members.
 * Deferred so presence leave handlers finish updating room membership first.
 *
 * @param {import("socket.io").Server} io
 * @param {string} spreadsheetId
 */
function scheduleSequenceCleanupIfRoomEmpty(io, spreadsheetId) {
  setImmediate(() => {
    const room = io.sockets.adapter.rooms.get(roomName(spreadsheetId));
    if (!room || room.size === 0) {
      clearSequence(spreadsheetId);
    }
  });
}

/**
 * Register workbook realtime sync handlers on a connected socket.
 *
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
function registerSpreadsheetWorkbookSync(io, socket) {
  let trackedSpreadsheetId = null;

  socket.on("spreadsheet:workbook-update", (payload = {}) => {
    const spreadsheetId = payload.spreadsheet_id;
    const workbookData = payload.workbook_data;

    if (!socket.user?.id) {
      emitSpreadsheetError(socket, "Authentication required");
      return;
    }

    if (!validateSpreadsheetId(spreadsheetId)) {
      emitSpreadsheetError(socket, "Valid spreadsheet_id is required");
      return;
    }

    if (!validateWorkbookData(workbookData)) {
      emitSpreadsheetError(socket, "workbook_data must be a valid Univer workbook snapshot");
      return;
    }

    if (!isInSpreadsheetRoom(socket, spreadsheetId)) {
      emitSpreadsheetError(
        socket,
        "You must join the spreadsheet room before publishing workbook updates"
      );
      return;
    }

    const sequence = nextSequence(spreadsheetId);
    const clientSequence = payload.client_sequence;

    broadcastWorkbookUpdate(
      socket,
      spreadsheetId,
      workbookData,
      sequence,
      clientSequence
    );
  });

  // Sequence cleanup — independent from the workbook-update relay flow
  socket.on("spreadsheet:join", (payload = {}) => {
    const spreadsheetId = payload.spreadsheet_id;
    if (!validateSpreadsheetId(spreadsheetId)) return;

    const previousSpreadsheetId = trackedSpreadsheetId;
    trackedSpreadsheetId = spreadsheetId;

    if (previousSpreadsheetId && previousSpreadsheetId !== spreadsheetId) {
      scheduleSequenceCleanupIfRoomEmpty(io, previousSpreadsheetId);
    }
  });

  socket.on("spreadsheet:leave", (payload = {}) => {
    const spreadsheetId = payload.spreadsheet_id;
    if (!validateSpreadsheetId(spreadsheetId)) return;

    if (trackedSpreadsheetId === spreadsheetId) {
      trackedSpreadsheetId = null;
    }

    scheduleSequenceCleanupIfRoomEmpty(io, spreadsheetId);
  });

  socket.on("disconnect", () => {
    const spreadsheetId = trackedSpreadsheetId;
    trackedSpreadsheetId = null;

    if (spreadsheetId) {
      scheduleSequenceCleanupIfRoomEmpty(io, spreadsheetId);
    }
  });
}

module.exports = {
  registerSpreadsheetWorkbookSync,
};
