import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io } from "socket.io-client";
import { getSpreadsheetCollaborationConfig } from "./collaborationConfig";
import { recordSpreadsheetCollaborationEvent } from "./collaborationTelemetry";
import { createSpreadsheetRequestId } from "./protocolRequest";

const SOCKET_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

const SpreadsheetRealtimeContext = createContext({
  socket: null,
  spreadsheetId: null,
  isRoomReady: false,
  collaborationProtocol: "v1",
  collaborationV2Enabled: false,
  durableActiveEnabled: false,
  lastAuthoritativeRevision: null,
  syncStart: null,
  reportAuthoritativeRevision: () => {},
  getAuthoritativeRevision: () => null,
});

/**
 * Leave the spreadsheet room and close the socket.
 * Idempotent — safe to call from React cleanup and pagehide.
 */
function teardownSpreadsheetSession(socket, spreadsheetId, joinRoom) {
  if (!socket) return;

  socket.off("connect", joinRoom);

  if (spreadsheetId && socket.connected) {
    socket.emit("spreadsheet:leave", {
      spreadsheet_id: spreadsheetId,
      request_id: createSpreadsheetRequestId("leave"),
    });
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
export function SpreadsheetRealtimeProvider({
  spreadsheetId,
  initialRevision = null,
  children,
}) {
  const [socket, setSocket] = useState(null);
  const [isRoomReady, setIsRoomReady] = useState(false);
  const [collaborationProtocol, setCollaborationProtocol] = useState("v1");
  const [lastAuthoritativeRevision, setLastAuthoritativeRevision] =
    useState(
      Number.isSafeInteger(initialRevision) ? initialRevision : null
    );
  const [syncStart, setSyncStart] = useState(null);
  const spreadsheetIdRef = useRef(spreadsheetId);
  const authoritativeRevisionRef = useRef(
    Number.isSafeInteger(initialRevision) ? initialRevision : null
  );
  const collaborationConfig = getSpreadsheetCollaborationConfig();

  const reportAuthoritativeRevision = useCallback((revision) => {
    if (!Number.isSafeInteger(revision) || revision < 0) {
      return;
    }

    if (
      authoritativeRevisionRef.current == null ||
      revision >= authoritativeRevisionRef.current
    ) {
      authoritativeRevisionRef.current = revision;
      setLastAuthoritativeRevision(revision);
    }
  }, []);

  const getAuthoritativeRevision = useCallback(
    () => authoritativeRevisionRef.current,
    []
  );

  useLayoutEffect(() => {
    spreadsheetIdRef.current = spreadsheetId;

    if (!spreadsheetId) {
      setSocket(null);
      setIsRoomReady(false);
      setCollaborationProtocol("v1");
      authoritativeRevisionRef.current = Number.isSafeInteger(initialRevision)
        ? initialRevision
        : null;
      setLastAuthoritativeRevision(authoritativeRevisionRef.current);
      setSyncStart(null);
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
    let pendingJoinRequestId = null;
    let presenceFallbackTimer = null;

    const markRoomReady = (requestId, source) => {
      if (
        requestId &&
        pendingJoinRequestId &&
        requestId !== pendingJoinRequestId
      ) {
        return;
      }

      pendingJoinRequestId = null;
      if (presenceFallbackTimer) {
        clearTimeout(presenceFallbackTimer);
        presenceFallbackTimer = null;
      }
      setIsRoomReady(true);
      recordSpreadsheetCollaborationEvent("join_acknowledged", {
        spreadsheetId,
        requestId: requestId || null,
        source,
      });
    };

    const joinRoom = () => {
      setIsRoomReady(false);
      setSyncStart(null);
      const requestId = createSpreadsheetRequestId("join");
      pendingJoinRequestId = requestId;
      if (presenceFallbackTimer) {
        clearTimeout(presenceFallbackTimer);
        presenceFallbackTimer = null;
      }
      recordSpreadsheetCollaborationEvent("join_requested", {
        spreadsheetId,
        requestId,
      });
      nextSocket.timeout(10_000).emit(
        "spreadsheet:join",
        {
          spreadsheet_id: spreadsheetId,
          request_id: requestId,
          ...(collaborationConfig.durableActiveEnabled
            ? {
                protocol: "v2",
                last_revision:
                  authoritativeRevisionRef.current > 0
                    ? authoritativeRevisionRef.current
                    : null,
              }
            : {}),
        },
        (error, response) => {
          if (error) {
            recordSpreadsheetCollaborationEvent("join_ack_timeout", {
              spreadsheetId,
              requestId,
            });
            return;
          }

          if (
            response?.ok &&
            response.spreadsheet_id === spreadsheetIdRef.current &&
            response.request_id === requestId &&
            pendingJoinRequestId === requestId
          ) {
            setCollaborationProtocol(
              response.protocol === "v2" ? "v2" : "v1"
            );
            markRoomReady(requestId, "ack_callback");
          }
        }
      );
    };

    const handleJoined = (payload = {}) => {
      if (payload.spreadsheet_id !== spreadsheetIdRef.current) return;
      if (!payload.ok) return;
      if (
        !payload.request_id ||
        payload.request_id !== pendingJoinRequestId
      ) {
        return;
      }
      setCollaborationProtocol(payload.protocol === "v2" ? "v2" : "v1");
      markRoomReady(payload.request_id, "joined_event");
    };

    const handleSyncStart = (payload = {}) => {
      if (payload.spreadsheet_id !== spreadsheetIdRef.current) return;
      if (payload.protocol !== "v2") return;
      if (!Number.isSafeInteger(payload.last_revision)) return;
      setSyncStart(payload);
      reportAuthoritativeRevision(payload.last_revision);
    };

    const handlePresence = (payload = {}) => {
      if (payload.spreadsheet_id !== spreadsheetIdRef.current) return;
      recordSpreadsheetCollaborationEvent("room_ready", {
        spreadsheetId,
        participantCount: Array.isArray(payload.users)
          ? payload.users.length
          : null,
      });

      // Rolling-deploy compatibility for an older backend without join ACKs.
      if (pendingJoinRequestId && !presenceFallbackTimer) {
        const fallbackRequestId = pendingJoinRequestId;
        presenceFallbackTimer = setTimeout(() => {
          if (pendingJoinRequestId === fallbackRequestId) {
            markRoomReady(fallbackRequestId, "legacy_presence_fallback");
          }
        }, 1500);
      }
    };

    const handleConnectError = (error) => {
      recordSpreadsheetCollaborationEvent("connection_error", {
        spreadsheetId,
        reason: error?.message || "unknown",
      });
    };

    const handleDisconnect = (reason) => {
      setIsRoomReady(false);
      setCollaborationProtocol("v1");
      setSyncStart(null);
      pendingJoinRequestId = null;
      if (presenceFallbackTimer) {
        clearTimeout(presenceFallbackTimer);
        presenceFallbackTimer = null;
      }
      recordSpreadsheetCollaborationEvent("disconnected", {
        spreadsheetId,
        reason: reason || "unknown",
      });
    };

    const handleSpreadsheetError = (payload = {}) => {
      recordSpreadsheetCollaborationEvent("protocol_error", {
        spreadsheetId,
        code: payload.code || "UNKNOWN",
        eventName: payload.event || null,
        requestId: payload.request_id || null,
      });

      if (
        payload.code === "SPREADSHEET_ACCESS_DENIED" ||
        payload.code === "SPREADSHEET_ACCESS_REVOKED" ||
        payload.code === "SPREADSHEET_SESSION_REPLACED" ||
        payload.code === "REPLAY_UNAVAILABLE"
      ) {
        setIsRoomReady(false);
      }
    };

    function teardown() {
      if (tornDown) return;
      tornDown = true;

      if (presenceFallbackTimer) {
        clearTimeout(presenceFallbackTimer);
        presenceFallbackTimer = null;
      }
      window.removeEventListener("pagehide", handlePageHide);
      nextSocket.off("spreadsheet:presence", handlePresence);
      nextSocket.off("spreadsheet:joined", handleJoined);
      nextSocket.off("spreadsheet:sync-start", handleSyncStart);
      nextSocket.off("spreadsheet:error", handleSpreadsheetError);
      nextSocket.off("connect_error", handleConnectError);
      nextSocket.off("disconnect", handleDisconnect);
      teardownSpreadsheetSession(nextSocket, spreadsheetId, joinRoom);
      setIsRoomReady(false);
    }

    function handlePageHide() {
      teardown();
    }

    nextSocket.on("connect", joinRoom);
    nextSocket.on("spreadsheet:presence", handlePresence);
    nextSocket.on("spreadsheet:joined", handleJoined);
    nextSocket.on("spreadsheet:sync-start", handleSyncStart);
    nextSocket.on("spreadsheet:error", handleSpreadsheetError);
    nextSocket.on("connect_error", handleConnectError);
    nextSocket.on("disconnect", handleDisconnect);
    window.addEventListener("pagehide", handlePageHide);

    if (nextSocket.connected) {
      joinRoom();
    }

    setSocket(nextSocket);

    return () => {
      teardown();
      setSocket(null);
    };
  }, [spreadsheetId, initialRevision, reportAuthoritativeRevision]);

  const value = useMemo(
    () => {
      return {
        socket,
        spreadsheetId: spreadsheetId || null,
        isRoomReady,
        collaborationProtocol,
        collaborationV2Enabled: collaborationConfig.v2Enabled,
        durableActiveEnabled: collaborationConfig.durableActiveEnabled,
        lastAuthoritativeRevision,
        syncStart,
        reportAuthoritativeRevision,
        getAuthoritativeRevision,
      };
    },
    [
      socket,
      spreadsheetId,
      isRoomReady,
      collaborationProtocol,
      collaborationConfig.v2Enabled,
      collaborationConfig.durableActiveEnabled,
      lastAuthoritativeRevision,
      syncStart,
      reportAuthoritativeRevision,
      getAuthoritativeRevision,
    ]
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
