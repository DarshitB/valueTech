const activeCellStore = require("./activeCellStore");
const cellLeaseStore = require("./spreadsheetCellLeaseStore");
const presenceStore = require("./presenceStore");
const {
  clearSpreadsheetDedup,
  clearUserDedup,
} = require("./commandRelayDedup");
const { roomName } = require("./spreadsheetProtocol");
const { clearSequence } = require("./workbookSyncSequence");

function getPublicPresenceUsers(spreadsheetId) {
  return presenceStore.getUsers(spreadsheetId).map(({ userId, userName }) => ({
    userId,
    userName,
  }));
}

function broadcastPresence(io, spreadsheetId) {
  io.to(roomName(spreadsheetId)).emit("spreadsheet:presence", {
    spreadsheet_id: spreadsheetId,
    users: getPublicPresenceUsers(spreadsheetId),
  });
}

function broadcastClearedActiveCell(socket, cleared) {
  if (!cleared) return;

  socket.to(roomName(cleared.spreadsheetId)).emit("spreadsheet:active-cell", {
    spreadsheet_id: cleared.spreadsheetId,
    userId: cleared.userId,
    userName: cleared.userName,
    worksheet_id: cleared.worksheetId,
    cell: null,
  });
}

function scheduleRoomStateCleanup(io, spreadsheetId) {
  setImmediate(() => {
    const room = io.sockets.adapter.rooms.get(roomName(spreadsheetId));
    if (!room || room.size === 0) {
      clearSequence(spreadsheetId);
      clearSpreadsheetDedup(spreadsheetId);
    }
  });
}

function broadcastClearedLeases(socket, leases) {
  (leases || []).forEach((lease) => {
    if (!lease?.spreadsheetId) return;
    socket.to(roomName(lease.spreadsheetId)).emit("spreadsheet:lease", {
      spreadsheet_id: lease.spreadsheetId,
      userId: lease.userId,
      userName: lease.userName,
      worksheet_id: lease.worksheetId ?? null,
      row: Number.isSafeInteger(lease.row) ? lease.row : null,
      column: Number.isSafeInteger(lease.column) ? lease.column : null,
      state: "released",
      scope: lease.scope || "cell",
      expires_at: null,
      generation: lease.generation ?? null,
    });
  });
}

function emitCellLeasesSnapshot(socket, spreadsheetId) {
  for (const lease of cellLeaseStore.listCellLeases(spreadsheetId)) {
    if (String(lease.userId) === String(socket.user.id)) continue;
    socket.emit("spreadsheet:lease", {
      spreadsheet_id: spreadsheetId,
      userId: lease.userId,
      userName: lease.userName,
      worksheet_id: lease.worksheetId,
      row: lease.row,
      column: lease.column,
      state: "acquired",
      scope: "cell",
      expires_at: lease.expiresAt,
      generation: lease.generation,
    });
  }
}

function emitActiveCellsSnapshot(socket, spreadsheetId) {
  for (const entry of activeCellStore.getCells(spreadsheetId)) {
    if (String(entry.userId) === String(socket.user.id)) continue;

    socket.emit("spreadsheet:active-cell", {
      spreadsheet_id: spreadsheetId,
      userId: entry.userId,
      userName: entry.userName,
      worksheet_id: entry.worksheetId,
      cell: entry.cell,
    });
  }
}

function leaveSpreadsheetSession(io, socket, requestedSpreadsheetId = null) {
  const presence = presenceStore.leaveBySocket(socket.id);
  const activeCell = activeCellStore.clearBySocket(socket.id);
  const releasedLeases = cellLeaseStore.releaseBySocket(socket.id);
  const spreadsheetId =
    presence?.spreadsheetId ||
    socket.data?.spreadsheetId ||
    activeCell?.spreadsheetId ||
    releasedLeases[0]?.spreadsheetId ||
    requestedSpreadsheetId;

  if (!spreadsheetId) {
    return null;
  }

  socket.leave(roomName(spreadsheetId));
  if (socket.data?.spreadsheetId === spreadsheetId) {
    socket.data.spreadsheetId = null;
    socket.data.collaborationProtocol = "v1";
    socket.data.authoritativeRevision = null;
  }

  broadcastClearedActiveCell(socket, activeCell);
  broadcastClearedLeases(socket, releasedLeases);
  broadcastPresence(io, spreadsheetId);
  scheduleRoomStateCleanup(io, spreadsheetId);
  return spreadsheetId;
}

function joinSpreadsheetSession(io, socket, spreadsheetId) {
  const previousSpreadsheetId = socket.data?.spreadsheetId || null;
  if (previousSpreadsheetId) {
    leaveSpreadsheetSession(io, socket, previousSpreadsheetId);
  }

  const { replacedSocketId } = presenceStore.join(spreadsheetId, {
    userId: socket.user.id,
    userName: socket.user.name,
    socketId: socket.id,
  });

  if (replacedSocketId && replacedSocketId !== socket.id) {
    const replacedSocket = io.sockets.sockets?.get(replacedSocketId);
    if (replacedSocket) {
      leaveSpreadsheetSession(io, replacedSocket, spreadsheetId);
      replacedSocket.emit("spreadsheet:error", {
        ok: false,
        code: "SPREADSHEET_SESSION_REPLACED",
        message: "This spreadsheet session was replaced by a newer connection",
        event: "spreadsheet:join",
        request_id: null,
        spreadsheet_id: spreadsheetId,
      });
    }
  }

  socket.join(roomName(spreadsheetId));
  socket.data ||= {};
  socket.data.spreadsheetId = spreadsheetId;
  clearUserDedup(spreadsheetId, socket.user.id);

  broadcastPresence(io, spreadsheetId);
  emitActiveCellsSnapshot(socket, spreadsheetId);
  emitCellLeasesSnapshot(socket, spreadsheetId);
}

module.exports = {
  broadcastPresence,
  emitActiveCellsSnapshot,
  getPublicPresenceUsers,
  joinSpreadsheetSession,
  leaveSpreadsheetSession,
  scheduleRoomStateCleanup,
};
