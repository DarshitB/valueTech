/**
 * Socket.IO bootstrap.
 * Attaches authenticated sockets and registers feature handlers.
 */

const { Server } = require("socket.io");
const socketAuth = require("./socketAuth");
const { registerSpreadsheetPresence } = require("./spreadsheetPresence");
const { registerSpreadsheetActiveCell } = require("./spreadsheetActiveCell");
const { registerSpreadsheetCellLeases } = require("./spreadsheetCellLeases");
const { registerSpreadsheetWorkbookSync } = require("./spreadsheetWorkbookSync");
const {
  setSpreadsheetSocketServer,
} = require("./spreadsheetSocketRegistry");

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://sandbox.valuetechsolutions.in",
  "http://www.sandbox.valuetechsolutions.in",
  "http://valuetechsolutions.in",
  "http://www.valuetechsolutions.in",
  "https://sandbox.valuetechsolutions.in",
  "https://www.sandbox.valuetechsolutions.in",
  "https://valuetechsolutions.in",
  "https://www.valuetechsolutions.in",
  "https://new.valuetechsolutions.org",
  "http://new.valuetechsolutions.org",
];

/**
 * Initialize Socket.IO on the given HTTP server.
 *
 * @param {import("http").Server} httpServer
 * @returns {import("socket.io").Server}
 */
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    maxHttpBufferSize: 300 * 1024,
    cors: {
      origin: ALLOWED_ORIGINS,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
  setSpreadsheetSocketServer(io);

  // Authenticate every connection with the same JWT rules as REST APIs
  io.use(socketAuth);

  io.on("connection", (socket) => {
    registerSpreadsheetPresence(io, socket);
    registerSpreadsheetActiveCell(io, socket);
    registerSpreadsheetCellLeases(io, socket);
    registerSpreadsheetWorkbookSync(io, socket);
  });

  return io;
}

module.exports = { initSocket };
