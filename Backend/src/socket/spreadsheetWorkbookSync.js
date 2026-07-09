/**
 * Spreadsheet Univer command realtime relay (Phase 2.4).
 *
 * Events (client → server):
 *   spreadsheet:command { spreadsheet_id, command_id, command_params, client_sequence }
 *
 * Events (server → client):
 *   spreadsheet:command {
 *     spreadsheet_id,
 *     userId,
 *     userName,
 *     command_id,
 *     command_params,
 *     sequence,
 *     client_sequence
 *   }
 *   spreadsheet:error { message }
 *
 * Relay-only: no database writes, no REST calls, no server-side command execution.
 * Independent from Phase 2.1 presence and Phase 2.2 active-cell.
 *
 * Commands are opaque Univer command envelopes produced by the public Facade API
 * (univerAPI.executeCommand / onCommandExecuted) on the client.
 */

const { validate: isUuid } = require("uuid");
const { roomName } = require("./spreadsheetPresence");
const { nextSequence, clearSequence } = require("./workbookSyncSequence");
const {
  isDuplicateClientSequence,
  clearSpreadsheetDedup,
} = require("./commandRelayDedup");

const COMMAND_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]{0,254}$/;

function validateSpreadsheetId(spreadsheetId) {
  return (
    typeof spreadsheetId === "string" &&
    spreadsheetId.length > 0 &&
    isUuid(spreadsheetId)
  );
}

function validateCommandId(commandId) {
  return (
    typeof commandId === "string" &&
    commandId.trim().length > 0 &&
    COMMAND_ID_PATTERN.test(commandId.trim())
  );
}

function validateCommandParams(commandParams) {
  return (
    commandParams !== null &&
    commandParams !== undefined &&
    typeof commandParams === "object" &&
    !Array.isArray(commandParams)
  );
}

function validateClientSequence(clientSequence) {
  return (
    typeof clientSequence === "number" &&
    Number.isFinite(clientSequence) &&
    clientSequence > 0
  );
}

function isInSpreadsheetRoom(socket, spreadsheetId) {
  return socket.rooms.has(roomName(spreadsheetId));
}

function emitSpreadsheetError(socket, message) {
  socket.emit("spreadsheet:error", { message });
}

/**
 * Broadcast a Univer command to every other socket in the spreadsheet room.
 *
 * @param {import("socket.io").Socket} socket
 * @param {string} spreadsheetId
 * @param {string} commandId
 * @param {object} commandParams
 * @param {number} sequence
 * @param {number} clientSequence
 */
function broadcastCommand(
  socket,
  spreadsheetId,
  commandId,
  commandParams,
  sequence,
  clientSequence
) {
  socket.to(roomName(spreadsheetId)).emit("spreadsheet:command", {
    spreadsheet_id: spreadsheetId,
    userId: socket.user.id,
    userName: socket.user.name,
    command_id: commandId,
    command_params: commandParams,
    sequence,
    client_sequence: clientSequence,
  });
}

/**
 * Remove relay state when the Socket.IO room has no members.
 * Deferred so presence leave handlers finish updating room membership first.
 *
 * @param {import("socket.io").Server} io
 * @param {string} spreadsheetId
 */
function scheduleRelayCleanupIfRoomEmpty(io, spreadsheetId) {
  setImmediate(() => {
    const room = io.sockets.adapter.rooms.get(roomName(spreadsheetId));
    if (!room || room.size === 0) {
      clearSequence(spreadsheetId);
      clearSpreadsheetDedup(spreadsheetId);
    }
  });
}

/**
 * Register command relay handlers on a connected socket.
 *
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
function registerSpreadsheetWorkbookSync(io, socket) {
  let trackedSpreadsheetId = null;

  socket.on("spreadsheet:command", (payload = {}) => {
    const spreadsheetId = payload.spreadsheet_id;
    const commandId = payload.command_id;
    const commandParams = payload.command_params;
    const clientSequence = payload.client_sequence;

    if (!socket.user?.id) {
      emitSpreadsheetError(socket, "Authentication required");
      return;
    }

    if (!validateSpreadsheetId(spreadsheetId)) {
      emitSpreadsheetError(socket, "Valid spreadsheet_id is required");
      return;
    }

    if (!validateCommandId(commandId)) {
      emitSpreadsheetError(socket, "Valid command_id is required");
      return;
    }

    if (!validateCommandParams(commandParams)) {
      emitSpreadsheetError(socket, "command_params must be an object");
      return;
    }

    if (!validateClientSequence(clientSequence)) {
      emitSpreadsheetError(socket, "Valid client_sequence is required");
      return;
    }

    if (!isInSpreadsheetRoom(socket, spreadsheetId)) {
      emitSpreadsheetError(
        socket,
        "You must join the spreadsheet room before publishing commands"
      );
      return;
    }

    if (
      isDuplicateClientSequence(
        spreadsheetId,
        socket.user.id,
        clientSequence
      )
    ) {
      return;
    }

    const sequence = nextSequence(spreadsheetId);

    broadcastCommand(
      socket,
      spreadsheetId,
      commandId.trim(),
      commandParams,
      sequence,
      clientSequence
    );
  });

  // Relay cleanup — independent from the command relay flow
  socket.on("spreadsheet:join", (payload = {}) => {
    const spreadsheetId = payload.spreadsheet_id;
    if (!validateSpreadsheetId(spreadsheetId)) return;

    const previousSpreadsheetId = trackedSpreadsheetId;
    trackedSpreadsheetId = spreadsheetId;

    if (previousSpreadsheetId && previousSpreadsheetId !== spreadsheetId) {
      scheduleRelayCleanupIfRoomEmpty(io, previousSpreadsheetId);
    }
  });

  socket.on("spreadsheet:leave", (payload = {}) => {
    const spreadsheetId = payload.spreadsheet_id;
    if (!validateSpreadsheetId(spreadsheetId)) return;

    if (trackedSpreadsheetId === spreadsheetId) {
      trackedSpreadsheetId = null;
    }

    scheduleRelayCleanupIfRoomEmpty(io, spreadsheetId);
  });

  socket.on("disconnect", () => {
    const spreadsheetId = trackedSpreadsheetId;
    trackedSpreadsheetId = null;

    if (spreadsheetId) {
      scheduleRelayCleanupIfRoomEmpty(io, spreadsheetId);
    }
  });
}

module.exports = {
  registerSpreadsheetWorkbookSync,
};
