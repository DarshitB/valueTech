const {
  evaluateSpreadsheetAccess,
} = require("../services/spreadsheets/spreadsheetAccessPolicy");
const { roomName } = require("./spreadsheetProtocol");

async function authorizeSpreadsheetSocketEvent({
  socket,
  spreadsheetId,
  requiredPermission = "view_spreadsheet",
  creatorBypassesPermission = false,
  evaluateAccess = evaluateSpreadsheetAccess,
}) {
  if (!socket.user?.id) {
    return {
      allowed: false,
      reason: "authentication_required",
    };
  }

  return evaluateAccess({
    spreadsheetId,
    user: socket.user,
    requiredPermission,
    creatorBypassesPermission,
  });
}

function isSocketInSpreadsheetRoom(socket, spreadsheetId) {
  return socket.rooms.has(roomName(spreadsheetId));
}

module.exports = {
  authorizeSpreadsheetSocketEvent,
  isSocketInSpreadsheetRoom,
};
