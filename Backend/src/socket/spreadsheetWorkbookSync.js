/**
 * Spreadsheet Univer command realtime relay (Phase 2.4).
 *
 * Events (client → server):
 *   spreadsheet:command { spreadsheet_id, command_id, command_params, client_sequence }
 *
 * Events (server → client):
 *   spreadsheet:command {
 *     spreadsheet_id,
 *     userId,
 *     userName,
 *     command_id,
 *     command_params,
 *     sequence,
 *     client_sequence
 *   }
 *   spreadsheet:error { message }
 *
 * Relay-only: no database writes, no REST calls, no server-side command execution.
 * Independent from Phase 2.1 presence and Phase 2.2 active-cell.
 *
 * Commands are opaque Univer command envelopes produced by the public Facade API
 * (univerAPI.executeCommand / onCommandExecuted) on the client.
 */

const { nextSequence } = require("./workbookSyncSequence");
const { isDuplicateClientSequence } = require("./commandRelayDedup");
const {
  getSpreadsheetCollaborationConfig,
  isDurableV2AllowedForTarget,
} = require("../config/spreadsheetCollaboration");
const {
  prepareSpreadsheetCollaborationReplay,
  pruneSpreadsheetCollaborationCommands,
  recordSpreadsheetCollaborationCommand,
} = require("../services/spreadsheets/spreadsheetCollaborationCommandService");
const {
  recordSpreadsheetCollaborationEvent,
} = require("./spreadsheetCollaborationTelemetry");
const {
  PAYLOAD_LIMITS,
  RATE_LIMITS,
  consumeSocketRateLimit,
  emitSpreadsheetError,
  isAllowedRealtimeCommand,
  isPayloadWithinLimit,
  normalizeSocketPayload,
  resolveRequestId,
  roomName,
  validateClientSequence,
  validateClientId,
  validateCommandId,
  validateCommandParams,
  validateRequestId,
  validateRevision,
  validateSpreadsheetId,
} = require("./spreadsheetProtocol");
const {
  authorizeSpreadsheetSocketEvent,
  isSocketInSpreadsheetRoom,
} = require("./spreadsheetSocketAccess");
const {
  leaveSpreadsheetSession,
} = require("./spreadsheetSessionLifecycle");
const cellLeaseStore = require("./spreadsheetCellLeaseStore");
const {
  extractCommandCells,
  isStructuralRealtimeCommand,
} = require("./spreadsheetCommandCells");

/**
 * Broadcast a Univer command to every other socket in the spreadsheet room.
 *
 * @param {import("socket.io").Socket} socket
 * @param {string} spreadsheetId
 * @param {string} commandId
 * @param {object} commandParams
 * @param {number} sequence
 * @param {number} clientSequence
 */
function broadcastCommand(
  socket,
  spreadsheetId,
  commandId,
  commandParams,
  sequence,
  clientSequence,
  requestId
) {
  socket.to(roomName(spreadsheetId)).emit("spreadsheet:command", {
    spreadsheet_id: spreadsheetId,
    userId: socket.user.id,
    userName: socket.user.name,
    command_id: commandId,
    command_params: commandParams,
    sequence,
    client_sequence: clientSequence,
    request_id: requestId,
  });

  recordSpreadsheetCollaborationEvent("command_broadcast", {
    spreadsheetId,
    userId: socket.user.id,
    commandId,
    sequence,
    clientSequence,
  });
}

/**
 * Remove relay state when the Socket.IO room has no members.
 * Deferred so presence leave handlers finish updating room membership first.
 *
 * @param {import("socket.io").Server} io
 * @param {string} spreadsheetId
 */
/**
 * Register command relay handlers on a connected socket.
 *
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
function registerSpreadsheetWorkbookSync(
  io,
  socket,
  {
    authorize = authorizeSpreadsheetSocketEvent,
    getCollaborationConfig = getSpreadsheetCollaborationConfig,
    prepareReplay = prepareSpreadsheetCollaborationReplay,
    recordShadowCommand = recordSpreadsheetCollaborationCommand,
    pruneShadowCommands = pruneSpreadsheetCollaborationCommands,
  } = {}
) {
  socket.on("spreadsheet:command", async (payload = {}, acknowledgement) => {
    payload = normalizeSocketPayload(payload);
    const spreadsheetId = payload.spreadsheet_id;
    const commandId = payload.command_id;
    const commandParams = payload.command_params;
    const clientSequence = payload.client_sequence;
    const suppliedClientId = payload.client_id;
    const requestId = resolveRequestId(payload);

    if (!socket.user?.id) {
      emitSpreadsheetError(
        socket,
        {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required",
          eventName: "spreadsheet:command",
          requestId,
          spreadsheetId: null,
        },
        acknowledgement
      );
      return;
    }

    if (
      !validateRequestId(payload.request_id) ||
      !isPayloadWithinLimit(payload, PAYLOAD_LIMITS.command)
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_COMMAND_REQUEST",
          message: "Command payload is invalid or too large",
          eventName: "spreadsheet:command",
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
        "spreadsheet:command",
        RATE_LIMITS.command
      )
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "RATE_LIMITED",
          message: "Too many spreadsheet commands",
          eventName: "spreadsheet:command",
          requestId,
          spreadsheetId: validateSpreadsheetId(spreadsheetId)
            ? spreadsheetId
            : null,
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
          eventName: "spreadsheet:command",
          requestId,
          spreadsheetId: null,
        },
        acknowledgement
      );
      return;
    }

    const collaborationConfigForAllowlist = getCollaborationConfig();
    if (
      !validateCommandId(commandId) ||
      !isAllowedRealtimeCommand(commandId, {
        safeUndoEnabled: collaborationConfigForAllowlist.safeUndoEnabled,
      })
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "COMMAND_NOT_ALLOWED",
          message: "command_id is not allowed for realtime collaboration",
          eventName: "spreadsheet:command",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    if (!validateCommandParams(commandParams)) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_COMMAND_PARAMS",
          message: "command_params must be an object",
          eventName: "spreadsheet:command",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    if (!validateClientSequence(clientSequence)) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_CLIENT_SEQUENCE",
          message: "Valid safe-integer client_sequence is required",
          eventName: "spreadsheet:command",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    const collaborationConfig = getCollaborationConfig();
    if (
      collaborationConfig.durableShadowEnabled &&
      suppliedClientId != null &&
      !validateClientId(suppliedClientId)
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_CLIENT_ID",
          message: "Valid client_id is required for collaboration V2",
          eventName: "spreadsheet:command",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    if (!isSocketInSpreadsheetRoom(socket, spreadsheetId)) {
      emitSpreadsheetError(
        socket,
        {
          code: "ROOM_MEMBERSHIP_REQUIRED",
          message:
            "You must join the spreadsheet room before publishing commands",
          eventName: "spreadsheet:command",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    let access;
    try {
      access = await authorize({
        socket,
        spreadsheetId,
        requiredPermission: "edit_spreadsheet",
        creatorBypassesPermission: true,
      });
    } catch {
      emitSpreadsheetError(
        socket,
        {
          code: "AUTHORIZATION_UNAVAILABLE",
          message: "Unable to verify spreadsheet access",
          eventName: "spreadsheet:command",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    if (!access.allowed) {
      leaveSpreadsheetSession(io, socket, spreadsheetId);
      emitSpreadsheetError(
        socket,
        {
          code: "SPREADSHEET_ACCESS_REVOKED",
          message: "Spreadsheet access has been revoked",
          eventName: "spreadsheet:command",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    if (collaborationConfig.cellLeasesEnabled) {
      if (isStructuralRealtimeCommand(commandId.trim())) {
        const workbookLease = cellLeaseStore.acquireWorkbookLease({
          spreadsheetId,
          userId: socket.user.id,
          userName: socket.user.name,
          socketId: socket.id,
          ttlMs: collaborationConfig.workbookLeaseTtlMs,
        });
        if (!workbookLease.ok) {
          emitSpreadsheetError(
            socket,
            {
              code: "WORKBOOK_LEASE_HELD",
              message: "The workbook is temporarily locked for a structural change",
              eventName: "spreadsheet:command",
              requestId,
              spreadsheetId,
            },
            acknowledgement
          );
          return;
        }
        workbookLease.invalidated.forEach((lease) => {
          socket.to(roomName(spreadsheetId)).emit("spreadsheet:lease", {
            spreadsheet_id: spreadsheetId,
            userId: lease.userId,
            userName: lease.userName,
            worksheet_id: lease.worksheetId,
            row: lease.row,
            column: lease.column,
            state: "invalidated",
            scope: "cell",
            expires_at: null,
            generation: workbookLease.lease.generation,
          });
        });
        setTimeout(() => {
          cellLeaseStore.releaseWorkbookLease({
            spreadsheetId,
            socketId: socket.id,
          });
        }, collaborationConfig.workbookLeaseTtlMs || 3_000);
      } else {
        const foreignCell = extractCommandCells(commandParams).find((cell) => {
          const lease = cellLeaseStore.getCellLease(
            spreadsheetId,
            cell.worksheetId,
            cell.row,
            cell.column
          );
          return lease && String(lease.userId) !== String(socket.user.id);
        });
        if (foreignCell) {
          emitSpreadsheetError(
            socket,
            {
              code: "CELL_LEASE_HELD",
              message: "Another user is editing this cell",
              eventName: "spreadsheet:command",
              requestId,
              spreadsheetId,
              details: {
                worksheet_id: foreignCell.worksheetId,
                row: foreignCell.row,
                column: foreignCell.column,
              },
            },
            acknowledgement
          );
          return;
        }
      }
    }

    let shadowRevision = null;
    let durableRecord = null;
    if (collaborationConfig.durableShadowEnabled) {
      const clientId = validateClientId(suppliedClientId)
        ? suppliedClientId.trim()
        : `legacy:${socket.id}`;

      try {
        const shadowRecord = await recordShadowCommand({
          spreadsheetId,
          operationId: requestId,
          clientId,
          clientSequence,
          actorId: socket.user.id,
          commandId: commandId.trim(),
          commandParams,
        });
        durableRecord = shadowRecord;
        shadowRevision = shadowRecord.revision;

        recordSpreadsheetCollaborationEvent("shadow_command_recorded", {
          spreadsheetId,
          userId: socket.user.id,
          commandId: commandId.trim(),
          revision: shadowRevision,
          duplicate: shadowRecord.duplicate,
        });

        if (shadowRevision % 100 === 0) {
          void pruneShadowCommands(spreadsheetId, {
            retentionDays: collaborationConfig.commandRetentionDays,
          }).catch(() => {
            recordSpreadsheetCollaborationEvent("shadow_retention_failed", {
              spreadsheetId,
            });
          });
        }
      } catch (error) {
        const useAuthoritativeV2 = isDurableV2AllowedForTarget(
          collaborationConfig,
          {
            spreadsheetId,
            userId: socket.user.id,
          }
        );
        if (useAuthoritativeV2) {
          emitSpreadsheetError(
            socket,
            {
              code:
                error?.code === "COLLABORATION_OPERATION_CONFLICT"
                  ? "OPERATION_CONFLICT"
                  : "DURABLE_WRITE_FAILED",
              message:
                error?.code === "COLLABORATION_OPERATION_CONFLICT"
                  ? "Operation identity conflicts with an existing command"
                  : "Unable to commit the collaboration command",
              eventName: "spreadsheet:command",
              requestId,
              spreadsheetId,
            },
            acknowledgement
          );
          return;
        }

        // Shadow persistence must never interrupt the active V1 relay.
        recordSpreadsheetCollaborationEvent("shadow_command_record_failed", {
          spreadsheetId,
          userId: socket.user.id,
          commandId: commandId.trim(),
          protocol: "v1",
        });
      }
    }

    const useAuthoritativeV2 =
      Boolean(durableRecord) &&
      isDurableV2AllowedForTarget(collaborationConfig, {
        spreadsheetId,
        userId: socket.user.id,
      });

    if (useAuthoritativeV2) {
      const authoritativePayload = {
        spreadsheet_id: spreadsheetId,
        protocol: "v2",
        authoritative: true,
        replay: false,
        revision: durableRecord.revision,
        sequence: durableRecord.revision,
        operation_id: requestId,
        client_id: validateClientId(suppliedClientId)
          ? suppliedClientId.trim()
          : `legacy:${socket.id}`,
        client_sequence: clientSequence,
        userId: socket.user.id,
        userName: socket.user.name,
        command_id: commandId.trim(),
        command_params: commandParams,
      };

      if (durableRecord.duplicate) {
        if (socket.data?.collaborationProtocol === "v2") {
          socket.emit("spreadsheet:command", authoritativePayload);
        }
      } else if (socket.data?.collaborationProtocol === "v2") {
        io.to(roomName(spreadsheetId)).emit(
          "spreadsheet:command",
          authoritativePayload
        );
      } else {
        socket.to(roomName(spreadsheetId)).emit(
          "spreadsheet:command",
          authoritativePayload
        );
      }

      if (typeof acknowledgement === "function") {
        acknowledgement({
          ok: true,
          protocol: "v2",
          duplicate: durableRecord.duplicate,
          spreadsheet_id: spreadsheetId,
          request_id: requestId,
          operation_id: requestId,
          client_id: authoritativePayload.client_id,
          client_sequence: clientSequence,
          revision: durableRecord.revision,
          sequence: durableRecord.revision,
        });
      }
      return;
    }

    if (
      isDuplicateClientSequence(
        spreadsheetId,
        socket.user.id,
        clientSequence
      )
    ) {
      recordSpreadsheetCollaborationEvent("command_duplicate", {
        spreadsheetId,
        userId: socket.user.id,
        commandId: commandId.trim(),
        clientSequence,
      });
      if (typeof acknowledgement === "function") {
        acknowledgement({
          ok: true,
          duplicate: true,
          spreadsheet_id: spreadsheetId,
          request_id: requestId,
          shadow_revision: shadowRevision,
          client_sequence: clientSequence,
        });
      }
      return;
    }

    const sequence = nextSequence(spreadsheetId);

    broadcastCommand(
      socket,
      spreadsheetId,
      commandId.trim(),
      commandParams,
      sequence,
      clientSequence,
      requestId
    );

    if (typeof acknowledgement === "function") {
      acknowledgement({
        ok: true,
        duplicate: false,
        spreadsheet_id: spreadsheetId,
        request_id: requestId,
        sequence,
        shadow_revision: shadowRevision,
        client_sequence: clientSequence,
      });
    }
  });

  socket.on("spreadsheet:replay", async (payload = {}, acknowledgement) => {
    payload = normalizeSocketPayload(payload);
    const spreadsheetId = payload.spreadsheet_id;
    const requestId = resolveRequestId(payload);
    const afterRevision = payload.after_revision;
    const collaborationConfig = getCollaborationConfig();

    if (
      !isDurableV2AllowedForTarget(collaborationConfig, {
        spreadsheetId,
        userId: socket.user?.id,
      }) ||
      socket.data?.collaborationProtocol !== "v2"
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "REPLAY_NOT_AVAILABLE",
          message: "Durable replay is not active for this session",
          eventName: "spreadsheet:replay",
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
      !validateSpreadsheetId(spreadsheetId) ||
      !validateRevision(afterRevision) ||
      !isPayloadWithinLimit(payload, PAYLOAD_LIMITS.replay) ||
      !isSocketInSpreadsheetRoom(socket, spreadsheetId)
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_REPLAY_REQUEST",
          message: "Replay request is invalid",
          eventName: "spreadsheet:replay",
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
      !consumeSocketRateLimit(
        socket,
        "spreadsheet:replay",
        RATE_LIMITS.replay
      )
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "RATE_LIMITED",
          message: "Too many replay requests",
          eventName: "spreadsheet:replay",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    const access = await authorize({ socket, spreadsheetId });
    if (!access.allowed) {
      leaveSpreadsheetSession(io, socket, spreadsheetId);
      emitSpreadsheetError(
        socket,
        {
          code: "SPREADSHEET_ACCESS_REVOKED",
          message: "Spreadsheet access has been revoked",
          eventName: "spreadsheet:replay",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    const replay = await prepareReplay(spreadsheetId, afterRevision, {
      limit: collaborationConfig.replayCommandLimit,
    });
    if (!replay.ok) {
      recordSpreadsheetCollaborationEvent("replay_failed", {
        spreadsheetId,
        userId: socket.user.id,
        protocol: "v2",
        source: "replay",
        reason: replay.reason || "UNKNOWN",
        afterRevision,
      });
      emitSpreadsheetError(
        socket,
        {
          code: "REPLAY_UNAVAILABLE",
          message: "Requested command history is unavailable",
          eventName: "spreadsheet:replay",
          requestId,
          spreadsheetId,
          details: {
            protocol: "v2",
            reason: replay.reason,
            current_revision: replay.currentRevision ?? null,
            oldest_available_revision:
              replay.oldestAvailableRevision ?? null,
            resync_required: true,
          },
        },
        acknowledgement
      );
      return;
    }

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

    recordSpreadsheetCollaborationEvent("replay_served", {
      spreadsheetId,
      userId: socket.user.id,
      protocol: "v2",
      source: "replay",
      fromRevision: replay.fromRevision ?? null,
      currentRevision: replay.currentRevision ?? null,
      commandCount: replay.commands.length,
      afterRevision,
    });

    if (typeof acknowledgement === "function") {
      acknowledgement({
        ok: true,
        protocol: "v2",
        spreadsheet_id: spreadsheetId,
        request_id: requestId,
        from_revision: replay.fromRevision,
        replayed_through_revision: replay.currentRevision,
        command_count: replay.commands.length,
      });
    }
  });
}

module.exports = {
  registerSpreadsheetWorkbookSync,
};
