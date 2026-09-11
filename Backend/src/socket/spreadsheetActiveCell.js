/**
 * Spreadsheet active-cell handlers (Phase 2.2).
 *
 * Events (client → server):
 *   spreadsheet:active-cell { spreadsheet_id, worksheet_id, cell }
 *
 * Events (server → client):
 *   spreadsheet:active-cell { spreadsheet_id, userId, userName, worksheet_id, cell }
 *   spreadsheet:error       { message }
 *
 * On spreadsheet:join, the joining socket receives one spreadsheet:active-cell
 * event per existing user (snapshot). Live updates continue to use broadcast.
 *
 * Active-cell state is in-memory only. Cleared automatically on
 * spreadsheet:leave and disconnect. Does not modify Phase 2.1 presence.
 */

const activeCellStore = require("./activeCellStore");
const {
  PAYLOAD_LIMITS,
  RATE_LIMITS,
  consumeSocketRateLimit,
  emitSpreadsheetError,
  isPayloadWithinLimit,
  normalizeSocketPayload,
  resolveRequestId,
  roomName,
  validateCell,
  validateClientSequence,
  validateRequestId,
  validateSpreadsheetId,
  validateWorksheetId,
} = require("./spreadsheetProtocol");
const {
  authorizeSpreadsheetSocketEvent,
  isSocketInSpreadsheetRoom,
} = require("./spreadsheetSocketAccess");
const {
  leaveSpreadsheetSession,
} = require("./spreadsheetSessionLifecycle");

/**
 * Broadcast active-cell update to every other socket in the room.
 *
 * @param {import("socket.io").Socket} socket
 * @param {string} spreadsheetId
 * @param {{ userId: number|string, userName: string, worksheetId: string|null, cell: string|null }} payload
 */
function broadcastActiveCell(socket, spreadsheetId, payload) {
  socket.to(roomName(spreadsheetId)).emit("spreadsheet:active-cell", {
    spreadsheet_id: spreadsheetId,
    userId: payload.userId,
    userName: payload.userName,
    worksheet_id: payload.worksheetId,
    cell: payload.cell,
  });
}

/**
 * Register active-cell event handlers on a connected socket.
 *
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
function registerSpreadsheetActiveCell(
  io,
  socket,
  { authorize = authorizeSpreadsheetSocketEvent } = {}
) {
  // Publish the user's currently focused cell
  socket.on("spreadsheet:active-cell", async (payload = {}, acknowledgement) => {
    payload = normalizeSocketPayload(payload);
    const spreadsheetId = payload.spreadsheet_id;
    const worksheetId = payload.worksheet_id;
    const cell = payload.cell;
    const clientSequence = payload.client_sequence;
    const requestId = resolveRequestId(payload);

    if (
      !validateRequestId(payload.request_id) ||
      !isPayloadWithinLimit(payload, PAYLOAD_LIMITS.activeCell)
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_ACTIVE_CELL_REQUEST",
          message: "Active-cell payload is invalid or too large",
          eventName: "spreadsheet:active-cell",
          requestId,
          spreadsheetId: null,
        },
        acknowledgement
      );
      return;
    }

    if (
      !consumeSocketRateLimit(
        socket,
        "spreadsheet:active-cell",
        RATE_LIMITS.activeCell
      )
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "RATE_LIMITED",
          message: "Too many active-cell updates",
          eventName: "spreadsheet:active-cell",
          requestId,
          spreadsheetId: validateSpreadsheetId(spreadsheetId)
            ? spreadsheetId
            : null,
        },
        acknowledgement
      );
      return;
    }

    if (
      !validateSpreadsheetId(spreadsheetId) ||
      !validateWorksheetId(worksheetId) ||
      !validateCell(cell) ||
      (clientSequence != null && !validateClientSequence(clientSequence))
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_ACTIVE_CELL_REQUEST",
          message:
            "Valid spreadsheet_id, worksheet_id, cell and client_sequence are required",
          eventName: "spreadsheet:active-cell",
          requestId,
          spreadsheetId: validateSpreadsheetId(spreadsheetId)
            ? spreadsheetId
            : null,
        },
        acknowledgement
      );
      return;
    }

    // Only sockets currently in the spreadsheet room may publish
    if (!isSocketInSpreadsheetRoom(socket, spreadsheetId)) {
      emitSpreadsheetError(
        socket,
        {
          code: "ROOM_MEMBERSHIP_REQUIRED",
          message:
            "You must join the spreadsheet room before publishing active-cell",
          eventName: "spreadsheet:active-cell",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    try {
      const access = await authorize({ socket, spreadsheetId });
      if (!access.allowed) {
        leaveSpreadsheetSession(io, socket, spreadsheetId);
        emitSpreadsheetError(
          socket,
          {
            code: "SPREADSHEET_ACCESS_REVOKED",
            message: "Spreadsheet access has been revoked",
            eventName: "spreadsheet:active-cell",
            requestId,
            spreadsheetId,
          },
          acknowledgement
        );
        return;
      }

      const trimmedCell = cell.trim().toUpperCase();
      const trimmedWorksheetId = worksheetId.trim();

      activeCellStore.set(spreadsheetId, {
        userId: socket.user.id,
        userName: socket.user.name,
        socketId: socket.id,
        worksheetId: trimmedWorksheetId,
        cell: trimmedCell,
      });

      broadcastActiveCell(socket, spreadsheetId, {
        userId: socket.user.id,
        userName: socket.user.name,
        worksheetId: trimmedWorksheetId,
        cell: trimmedCell,
      });

      if (typeof acknowledgement === "function") {
        acknowledgement({
          ok: true,
          spreadsheet_id: spreadsheetId,
          request_id: requestId,
          client_sequence: clientSequence ?? null,
        });
      }
    } catch {
      emitSpreadsheetError(
        socket,
        {
          code: "AUTHORIZATION_UNAVAILABLE",
          message: "Unable to verify spreadsheet access",
          eventName: "spreadsheet:active-cell",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
    }
  });
}

module.exports = {
  registerSpreadsheetActiveCell,
};
