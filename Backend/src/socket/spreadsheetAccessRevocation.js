const {
  evaluateSpreadsheetAccess,
} = require("../services/spreadsheets/spreadsheetAccessPolicy");
const {
  emitSpreadsheetError,
  roomName,
} = require("./spreadsheetProtocol");
const {
  leaveSpreadsheetSession,
} = require("./spreadsheetSessionLifecycle");
const {
  getSpreadsheetSocketServer,
} = require("./spreadsheetSocketRegistry");

/**
 * Recheck every local/adapter-visible socket after assignments or spreadsheet
 * availability changes. Socket.IO's fetchSockets also works with Redis later.
 */
async function revalidateSpreadsheetRoomAccess(spreadsheetId) {
  const io = getSpreadsheetSocketServer();
  if (!io) return { checked: 0, evicted: 0 };

  const sockets = await io.in(roomName(spreadsheetId)).fetchSockets();
  let evicted = 0;

  for (const socket of sockets) {
    const access = await evaluateSpreadsheetAccess({
      spreadsheetId,
      user: socket.user,
      requiredPermission: "view_spreadsheet",
    });

    if (access.allowed) continue;

    leaveSpreadsheetSession(io, socket, spreadsheetId);
    emitSpreadsheetError(socket, {
      code: "SPREADSHEET_ACCESS_REVOKED",
      message: "Spreadsheet access has been revoked",
      eventName: "spreadsheet:access-revalidation",
      requestId: null,
      spreadsheetId,
    });
    evicted += 1;
  }

  return { checked: sockets.length, evicted };
}

module.exports = {
  revalidateSpreadsheetRoomAccess,
};
