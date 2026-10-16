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

function buildPresencePayload(spreadsheetId) {
  return {
    spreadsheet_id: spreadsheetId,
    users: getPublicPresenceUsers(spreadsheetId),
  };
}

function broadcastPresence(io, spreadsheetId, extraSockets = []) {
  const payload = buildPresencePayload(spreadsheetId);
  const room = roomName(spreadsheetId);
  io.to(room).emit("spreadsheet:presence", payload);

  // A socket can still be the active presence entry after it drops out of the
  // Socket.IO room. Deliver the same roster directly so that client updates.
  const notified = new Set();
  const targets = [
    ...extraSockets,
    ...presenceStore.getUsers(spreadsheetId).map((user) =>
      io.sockets.sockets?.get(user.socketId)
    ),
  ];

  for (const target of targets) {
    if (!target || notified.has(target.id) || target.rooms?.has(room)) {
      continue;
    }
    notified.add(target.id);
    target.emit("spreadsheet:presence", payload);
  }
}

function emitPresenceToSocket(socket, spreadsheetId) {
  socket.emit("spreadsheet:presence", buildPresencePayload(spreadsheetId));
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

  broadcastClearedActiveCell(socket, activeCell);
  broadcastClearedLeases(socket, releasedLeases);
  // Broadcast while this socket is still in the room. Leaving first dropped
  // the update, so the person who just joined kept a stale roster.
  broadcastPresence(io, spreadsheetId, [socket]);
  socket.leave(roomName(spreadsheetId));
  if (socket.data?.spreadsheetId === spreadsheetId) {
    socket.data.spreadsheetId = null;
    socket.data.collaborationProtocol = "v1";
    socket.data.authoritativeRevision = null;
  }

  scheduleRoomStateCleanup(io, spreadsheetId);
  return spreadsheetId;
}

async function joinSpreadsheetSession(io, socket, spreadsheetId) {
  const previousSpreadsheetId = socket.data?.spreadsheetId || null;
  if (previousSpreadsheetId && previousSpreadsheetId !== spreadsheetId) {
    leaveSpreadsheetSession(io, socket, previousSpreadsheetId);
  }

  const { replacedSocketId } = presenceStore.join(spreadsheetId, {
    userId: socket.user.id,
    userName: socket.user.name,
    socketId: socket.id,
  });

  await socket.join(roomName(spreadsheetId));
  socket.data ||= {};
  socket.data.spreadsheetId = spreadsheetId;
  clearUserDedup(spreadsheetId, socket.user.id);

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

  broadcastPresence(io, spreadsheetId);
  emitActiveCellsSnapshot(socket, spreadsheetId);
  emitCellLeasesSnapshot(socket, spreadsheetId);
}

module.exports = {
  broadcastPresence,
  emitActiveCellsSnapshot,
  emitPresenceToSocket,
  getPublicPresenceUsers,
  joinSpreadsheetSession,
  leaveSpreadsheetSession,
  scheduleRoomStateCleanup,
};
