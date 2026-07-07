import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io } from "socket.io-client";

const SOCKET_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

const SpreadsheetRealtimeContext = createContext({
  socket: null,
  spreadsheetId: null,
  isRoomReady: false,
});

/**
 * Leave the spreadsheet room and close the socket.
 * Idempotent — safe to call from React cleanup and pagehide.
 */
function teardownSpreadsheetSession(socket, spreadsheetId, joinRoom) {
  if (!socket) return;

  socket.off("connect", joinRoom);

  if (spreadsheetId && socket.connected) {
    socket.emit("spreadsheet:leave", { spreadsheet_id: spreadsheetId });
  }

  socket.disconnect();
}

/**
 * Owns exactly one Socket.IO connection for a spreadsheet session.
 *
 * Joins/leaves the spreadsheet room. Feature hooks (presence, etc.)
 * subscribe to events on this shared socket — they must not create
 * their own connections.
 */
export function SpreadsheetRealtimeProvider({ spreadsheetId, children }) {
  const [socket, setSocket] = useState(null);
  const [isRoomReady, setIsRoomReady] = useState(false);
  const spreadsheetIdRef = useRef(spreadsheetId);

  useLayoutEffect(() => {
    spreadsheetIdRef.current = spreadsheetId;

    if (!spreadsheetId) {
      setSocket(null);
      setIsRoomReady(false);
      return undefined;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setSocket(null);
      setIsRoomReady(false);
      return undefined;
    }

    setIsRoomReady(false);

    const nextSocket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    let tornDown = false;

    const joinRoom = () => {
      setIsRoomReady(false);
      nextSocket.emit("spreadsheet:join", { spreadsheet_id: spreadsheetId });
    };

    const handlePresence = (payload = {}) => {
      if (payload.spreadsheet_id !== spreadsheetIdRef.current) return;
      setIsRoomReady(true);
    };

    function teardown() {
      if (tornDown) return;
      tornDown = true;

      window.removeEventListener("pagehide", handlePageHide);
      nextSocket.off("spreadsheet:presence", handlePresence);
      teardownSpreadsheetSession(nextSocket, spreadsheetId, joinRoom);
      setIsRoomReady(false);
    }

    function handlePageHide() {
      teardown();
    }

    nextSocket.on("connect", joinRoom);
    nextSocket.on("spreadsheet:presence", handlePresence);
    window.addEventListener("pagehide", handlePageHide);

    if (nextSocket.connected) {
      joinRoom();
    }

    setSocket(nextSocket);

    return () => {
      teardown();
      setSocket(null);
    };
  }, [spreadsheetId]);

  const value = useMemo(
    () => ({
      socket,
      spreadsheetId: spreadsheetId || null,
      isRoomReady,
    }),
    [socket, spreadsheetId, isRoomReady]
  );

  return (
    <SpreadsheetRealtimeContext.Provider value={value}>
      {children}
    </SpreadsheetRealtimeContext.Provider>
  );
}

/**
 * Access the shared spreadsheet realtime connection.
 * Future features (active cell, workbook sync, etc.) use this.
 */
export function useSpreadsheetRealtime() {
  return useContext(SpreadsheetRealtimeContext);
}
