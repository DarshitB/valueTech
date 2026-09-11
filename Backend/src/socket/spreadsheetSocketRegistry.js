let socketServer = null;

function setSpreadsheetSocketServer(io) {
  socketServer = io || null;
}

function getSpreadsheetSocketServer() {
  return socketServer;
}

module.exports = {
  getSpreadsheetSocketServer,
  setSpreadsheetSocketServer,
};
