/**
 * Spreadsheet presence handlers (Phase 2.1).
 *
 * Events (client → server):
 *   spreadsheet:join  { spreadsheet_id }
 *   spreadsheet:leave { spreadsheet_id }
 *
 * Events (server → client):
 *   spreadsheet:joined   { ok, spreadsheet_id, request_id, protocol }
 *   spreadsheet:presence { spreadsheet_id, users: [{ userId, userName }] }
 *   spreadsheet:error    { ok, code, message, event, request_id, spreadsheet_id }
 *
 * Presence is in-memory only — no DB writes, no collaboration, no workbook sync.
 */

const {
  PAYLOAD_LIMITS,
  RATE_LIMITS,
  consumeSocketRateLimit,
  emitSpreadsheetError,
  isPayloadWithinLimit,
  normalizeSocketPayload,
  resolveRequestId,
  roomName,
  validateRequestId,
  validateCollaborationProtocol,
  validateRevision,
  validateSpreadsheetId,
} = require("./spreadsheetProtocol");
const {
  getSpreadsheetCollaborationConfig,
  isDurableV2AllowedForTarget,
} = require("../config/spreadsheetCollaboration");
const {
  prepareSpreadsheetCollaborationReplay,
} = require("../services/spreadsheets/spreadsheetCollaborationCommandService");
const {
  authorizeSpreadsheetSocketEvent,
} = require("./spreadsheetSocketAccess");
const {
  joinSpreadsheetSession,
  leaveSpreadsheetSession,
} = require("./spreadsheetSessionLifecycle");
const {
  recordSpreadsheetCollaborationEvent,
} = require("./spreadsheetCollaborationTelemetry");

/**
 * Register presence event handlers on a connected socket.
 *
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
function registerSpreadsheetPresence(
  io,
  socket,
  {
    authorize = authorizeSpreadsheetSocketEvent,
    getCollaborationConfig = getSpreadsheetCollaborationConfig,
    prepareReplay = prepareSpreadsheetCollaborationReplay,
  } = {}
) {
  let joinAttempt = 0;

  // Join a spreadsheet presence room
  socket.on("spreadsheet:join", async (payload = {}, acknowledgement) => {
    payload = normalizeSocketPayload(payload);
    const spreadsheetId = payload.spreadsheet_id;
    const requestId = resolveRequestId(payload);
    const requestedProtocol = payload.protocol;
    const lastRevision = payload.last_revision;

    if (!validateRequestId(payload.request_id)) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_REQUEST_ID",
          message: "request_id is invalid",
          eventName: "spreadsheet:join",
          requestId,
          spreadsheetId: validateSpreadsheetId(spreadsheetId)
            ? spreadsheetId
            : null,
        },
        acknowledgement
      );
      return;
    }

    if (!isPayloadWithinLimit(payload, PAYLOAD_LIMITS.join)) {
      emitSpreadsheetError(
        socket,
        {
          code: "PAYLOAD_TOO_LARGE",
          message: "Join payload is too large",
          eventName: "spreadsheet:join",
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
        "spreadsheet:join",
        RATE_LIMITS.join
      )
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "RATE_LIMITED",
          message: "Too many spreadsheet join requests",
          eventName: "spreadsheet:join",
          requestId,
          spreadsheetId: null,
        },
        acknowledgement
      );
      return;
    }

    if (!validateSpreadsheetId(spreadsheetId)) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_SPREADSHEET_ID",
          message: "Valid spreadsheet_id is required",
          eventName: "spreadsheet:join",
          requestId,
          spreadsheetId: null,
        },
        acknowledgement
      );
      return;
    }

    if (
      !validateCollaborationProtocol(requestedProtocol) ||
      (requestedProtocol === "v2" &&
        !validateRevision(lastRevision, { allowNull: true }))
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_SYNC_REQUEST",
          message: "Collaboration protocol or last_revision is invalid",
          eventName: "spreadsheet:join",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    const currentAttempt = ++joinAttempt;

    try {
      const access = await authorize({ socket, spreadsheetId });
      if (currentAttempt !== joinAttempt) return;

      if (!access.allowed) {
        if (socket.data?.spreadsheetId === spreadsheetId) {
          leaveSpreadsheetSession(io, socket, spreadsheetId);
        }
        recordSpreadsheetCollaborationEvent("join_rejected", {
          spreadsheetId,
          userId: socket.user?.id ?? null,
          reason: access.reason,
        });
        emitSpreadsheetError(
          socket,
          {
            code: "SPREADSHEET_ACCESS_DENIED",
            message: "Spreadsheet access denied",
            eventName: "spreadsheet:join",
            requestId,
            spreadsheetId,
          },
          acknowledgement
        );
        return;
      }

      const collaborationConfig = getCollaborationConfig();
      const useDurableV2 =
        requestedProtocol === "v2" &&
        isDurableV2AllowedForTarget(collaborationConfig, {
          spreadsheetId,
          userId: socket.user?.id,
        });

      if (
        requestedProtocol === "v2" &&
        collaborationConfig.durableActiveEnabled &&
        !useDurableV2
      ) {
        recordSpreadsheetCollaborationEvent("join_v2_allowlist_denied", {
          spreadsheetId,
          userId: socket.user?.id ?? null,
          protocol: "v1",
        });
      }

      joinSpreadsheetSession(io, socket, spreadsheetId);
      socket.data.collaborationProtocol = useDurableV2 ? "v2" : "v1";

      let replay = null;
      if (useDurableV2) {
        replay = await prepareReplay(spreadsheetId, lastRevision, {
          limit: collaborationConfig.replayCommandLimit,
        });

        if (!replay.ok) {
          if (replay.reason === "CHECKPOINT_UNAVAILABLE") {
            socket.data.collaborationProtocol = "v1";
            recordSpreadsheetCollaborationEvent("join_v1_fallback", {
              spreadsheetId,
              userId: socket.user.id,
              reason: replay.reason,
              protocol: "v1",
            });
          } else {
            leaveSpreadsheetSession(io, socket, spreadsheetId);
            recordSpreadsheetCollaborationEvent("join_replay_failed", {
              spreadsheetId,
              userId: socket.user.id,
              reason: replay.reason || "UNKNOWN",
              protocol: "v2",
            });
            emitSpreadsheetError(
              socket,
              {
                code: "REPLAY_UNAVAILABLE",
                message: "Requested command history is unavailable",
                eventName: "spreadsheet:join",
                requestId,
                spreadsheetId,
                details: {
                  protocol: "v2",
                  reason: replay.reason,
                  current_revision: replay.currentRevision ?? null,
                  snapshot_revision: replay.snapshotRevision ?? null,
                  oldest_available_revision:
                    replay.oldestAvailableRevision ?? null,
                  resync_required: true,
                },
              },
              acknowledgement
            );
            return;
          }
        }

        if (socket.data.collaborationProtocol === "v2" && replay?.ok) {
          const accessAfterReplay = await authorize({ socket, spreadsheetId });
          if (!accessAfterReplay.allowed) {
            leaveSpreadsheetSession(io, socket, spreadsheetId);
            emitSpreadsheetError(
              socket,
              {
                code: "SPREADSHEET_ACCESS_REVOKED",
                message:
                  "Spreadsheet access was revoked during synchronization",
                eventName: "spreadsheet:join",
                requestId,
                spreadsheetId,
              },
              acknowledgement
            );
            return;
          }

          socket.emit("spreadsheet:sync-start", {
            spreadsheet_id: spreadsheetId,
            request_id: requestId,
            protocol: "v2",
            last_revision: replay.fromRevision,
            current_revision: replay.currentRevision,
          });

          replay.commands.forEach((command) => {
            socket.emit("spreadsheet:command", {
              spreadsheet_id: spreadsheetId,
              protocol: "v2",
              authoritative: true,
              replay: true,
              revision: command.revision,
              sequence: command.revision,
              operation_id: command.operationId,
              client_id: command.clientId,
              client_sequence: command.clientSequence,
              userId: command.actorId,
              command_id: command.commandId,
              command_params: command.commandParams,
            });
          });

          socket.data.authoritativeRevision = replay.currentRevision;
          const response = {
            ok: true,
            spreadsheet_id: spreadsheetId,
            request_id: requestId,
            protocol: "v2",
            current_revision: replay.currentRevision,
            replayed_through_revision: replay.currentRevision,
          };
          socket.emit("spreadsheet:joined", response);
          if (typeof acknowledgement === "function") {
            acknowledgement(response);
          }
          recordSpreadsheetCollaborationEvent("join_accepted", {
            spreadsheetId,
            userId: socket.user.id,
            protocol: "v2",
            replayCount: replay.commands.length,
          });
          recordSpreadsheetCollaborationEvent("replay_served", {
            spreadsheetId,
            userId: socket.user.id,
            protocol: "v2",
            source: "join",
            fromRevision: replay.fromRevision ?? null,
            currentRevision: replay.currentRevision ?? null,
            commandCount: replay.commands.length,
          });
          return;
        }
      }

      const response = {
        ok: true,
        spreadsheet_id: spreadsheetId,
        request_id: requestId,
        protocol: "v1",
      };
      socket.emit("spreadsheet:joined", response);
      if (typeof acknowledgement === "function") {
        acknowledgement(response);
      }
      recordSpreadsheetCollaborationEvent("join_accepted", {
        spreadsheetId,
        userId: socket.user.id,
        protocol: "v1",
      });
    } catch {
      emitSpreadsheetError(
        socket,
        {
          code: "AUTHORIZATION_UNAVAILABLE",
          message: "Unable to verify spreadsheet access",
          eventName: "spreadsheet:join",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
    }
  });

  // Explicit leave (e.g. navigating away without disconnect)
  socket.on("spreadsheet:leave", (payload = {}, acknowledgement) => {
    payload = normalizeSocketPayload(payload);
    const spreadsheetId = payload.spreadsheet_id;
    const requestId = resolveRequestId(payload);

    if (
      !consumeSocketRateLimit(
        socket,
        "spreadsheet:leave",
        RATE_LIMITS.leave
      )
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "RATE_LIMITED",
          message: "Too many spreadsheet leave requests",
          eventName: "spreadsheet:leave",
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
      !validateRequestId(payload.request_id) ||
      !isPayloadWithinLimit(payload, PAYLOAD_LIMITS.leave) ||
      !validateSpreadsheetId(spreadsheetId)
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_LEAVE_REQUEST",
          message: "Valid spreadsheet_id and request_id are required",
          eventName: "spreadsheet:leave",
          requestId,
          spreadsheetId: null,
        },
        acknowledgement
      );
      return;
    }

    leaveSpreadsheetSession(io, socket, spreadsheetId);
    if (typeof acknowledgement === "function") {
      acknowledgement({
        ok: true,
        spreadsheet_id: spreadsheetId,
        request_id: requestId,
      });
    }
  });

  // Disconnect — remove presence and notify remaining users
  socket.on("disconnect", () => {
    joinAttempt += 1;
    leaveSpreadsheetSession(io, socket);
  });
}

module.exports = {
  registerSpreadsheetPresence,
  roomName,
};
