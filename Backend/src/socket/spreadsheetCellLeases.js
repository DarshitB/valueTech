/**
 * Spreadsheet cell-lease and draft-preview handlers (Phase 4).
 *
 * Events (client → server):
 *   spreadsheet:lease-acquire
 *   spreadsheet:lease-heartbeat
 *   spreadsheet:lease-release
 *   spreadsheet:draft-preview
 *
 * Events (server → client):
 *   spreadsheet:lease
 *   spreadsheet:draft-preview
 */

const cellLeaseStore = require("./spreadsheetCellLeaseStore");
const {
  getSpreadsheetCollaborationConfig,
} = require("../config/spreadsheetCollaboration");
const {
  PAYLOAD_LIMITS,
  RATE_LIMITS,
  consumeSocketRateLimit,
  emitSpreadsheetError,
  isPayloadWithinLimit,
  normalizeSocketPayload,
  resolveRequestId,
  roomName,
  validateColumn,
  validateDraftPreview,
  validateRequestId,
  validateRow,
  validateSpreadsheetId,
  validateWorksheetId,
} = require("./spreadsheetProtocol");
const {
  authorizeSpreadsheetSocketEvent,
  isSocketInSpreadsheetRoom,
} = require("./spreadsheetSocketAccess");
const {
  leaveSpreadsheetSession,
} = require("./spreadsheetSessionLifecycle");
const {
  recordSpreadsheetCollaborationEvent,
} = require("./spreadsheetCollaborationTelemetry");

function broadcastLease(socket, spreadsheetId, payload, includeSender = false) {
  const event = {
    spreadsheet_id: spreadsheetId,
    userId: payload.userId,
    userName: payload.userName,
    worksheet_id: payload.worksheetId ?? null,
    row: Number.isSafeInteger(payload.row) ? payload.row : null,
    column: Number.isSafeInteger(payload.column) ? payload.column : null,
    state: payload.state,
    scope: payload.scope || "cell",
    expires_at: payload.expiresAt ?? null,
    generation: payload.generation ?? null,
  };

  if (includeSender) {
    socket.nsp.to(roomName(spreadsheetId)).emit("spreadsheet:lease", event);
    return;
  }

  socket.to(roomName(spreadsheetId)).emit("spreadsheet:lease", event);
}

function emitCellLeasesSnapshot(socket, spreadsheetId) {
  cellLeaseStore.listCellLeases(spreadsheetId).forEach((lease) => {
    if (String(lease.userId) === String(socket.user.id)) return;
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
  });
}

function broadcastReleasedLeases(socket, leases) {
  leases.forEach((lease) => {
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

function validateLeaseTarget(payload) {
  return (
    validateSpreadsheetId(payload.spreadsheet_id) &&
    validateWorksheetId(payload.worksheet_id) &&
    validateRow(payload.row) &&
    validateColumn(payload.column)
  );
}

function rejectIfLeasesDisabled(socket, eventName, requestId, spreadsheetId, acknowledgement) {
  emitSpreadsheetError(
    socket,
    {
      code: "LEASES_DISABLED",
      message: "Cell leases are not enabled",
      eventName,
      requestId,
      spreadsheetId,
    },
    acknowledgement
  );
}

function registerSpreadsheetCellLeases(
  io,
  socket,
  {
    authorize = authorizeSpreadsheetSocketEvent,
    getCollaborationConfig = getSpreadsheetCollaborationConfig,
    leases = cellLeaseStore,
  } = {}
) {
  const acquireOrHeartbeat = async (
    eventName,
    payload,
    acknowledgement,
    mode
  ) => {
    payload = normalizeSocketPayload(payload);
    const spreadsheetId = payload.spreadsheet_id;
    const requestId = resolveRequestId(payload);
    const config = getCollaborationConfig();

    if (!config.cellLeasesEnabled) {
      rejectIfLeasesDisabled(
        socket,
        eventName,
        requestId,
        validateSpreadsheetId(spreadsheetId) ? spreadsheetId : null,
        acknowledgement
      );
      return;
    }

    if (
      !validateRequestId(payload.request_id) ||
      !isPayloadWithinLimit(payload, PAYLOAD_LIMITS.lease)
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_LEASE_REQUEST",
          message: "Lease payload is invalid or too large",
          eventName,
          requestId,
          spreadsheetId: null,
        },
        acknowledgement
      );
      return;
    }

    const rateKey = mode === "heartbeat" ? "leaseHeartbeat" : "leaseAcquire";
    if (
      !consumeSocketRateLimit(
        socket,
        eventName,
        RATE_LIMITS[rateKey]
      )
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "RATE_LIMITED",
          message: "Too many cell-lease requests",
          eventName,
          requestId,
          spreadsheetId: validateSpreadsheetId(spreadsheetId)
            ? spreadsheetId
            : null,
        },
        acknowledgement
      );
      return;
    }

    if (!validateLeaseTarget(payload)) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_LEASE_REQUEST",
          message: "Valid spreadsheet_id, worksheet_id, row, and column are required",
          eventName,
          requestId,
          spreadsheetId: validateSpreadsheetId(spreadsheetId)
            ? spreadsheetId
            : null,
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
          message: "You must join the spreadsheet room before locking a cell",
          eventName,
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    try {
      const access = await authorize({
        socket,
        spreadsheetId,
        requiredPermission: "edit_spreadsheet",
        creatorBypassesPermission: true,
      });
      if (!access.allowed) {
        leaveSpreadsheetSession(io, socket, spreadsheetId);
        emitSpreadsheetError(
          socket,
          {
            code: "SPREADSHEET_ACCESS_REVOKED",
            message: "Spreadsheet access has been revoked",
            eventName,
            requestId,
            spreadsheetId,
          },
          acknowledgement
        );
        return;
      }

      const worksheetId = payload.worksheet_id.trim();
      const result =
        mode === "heartbeat"
          ? leases.heartbeatCellLease({
              spreadsheetId,
              worksheetId,
              row: payload.row,
              column: payload.column,
              socketId: socket.id,
              ttlMs: config.cellLeaseTtlMs,
            })
          : leases.acquireCellLease({
              spreadsheetId,
              worksheetId,
              row: payload.row,
              column: payload.column,
              userId: socket.user.id,
              userName: socket.user.name,
              socketId: socket.id,
              ttlMs: config.cellLeaseTtlMs,
            });

      if (!result.ok) {
        recordSpreadsheetCollaborationEvent("cell_lease_denied", {
          spreadsheetId,
          userId: socket.user.id,
          reason: result.reason || "UNKNOWN",
          mode,
        });
        emitSpreadsheetError(
          socket,
          {
            code: result.reason,
            message:
              result.reason === "WORKBOOK_LEASE_HELD"
                ? "The workbook is temporarily locked for a structural change"
                : "Another user is editing this cell",
            eventName,
            requestId,
            spreadsheetId,
            details: {
              worksheet_id: worksheetId,
              row: payload.row,
              column: payload.column,
              ...(result.lease
                ? {
                    holder_user_id: result.lease.userId,
                    holder_user_name: result.lease.userName,
                  }
                : {}),
            },
          },
          acknowledgement
        );
        return;
      }

      if (Array.isArray(result.released)) {
        broadcastReleasedLeases(socket, result.released);
      }

      broadcastLease(socket, spreadsheetId, {
        ...result.lease,
        state: mode === "heartbeat" ? "heartbeat" : "acquired",
      });

      if (typeof acknowledgement === "function") {
        acknowledgement({
          ok: true,
          spreadsheet_id: spreadsheetId,
          request_id: requestId,
          expires_at: result.lease.expiresAt,
          generation: result.lease.generation,
        });
      }

      recordSpreadsheetCollaborationEvent(
        mode === "heartbeat" ? "cell_lease_heartbeat" : "cell_lease_acquired",
        {
          spreadsheetId,
          userId: socket.user.id,
        }
      );
    } catch {
      emitSpreadsheetError(
        socket,
        {
          code: "AUTHORIZATION_UNAVAILABLE",
          message: "Unable to verify spreadsheet access",
          eventName,
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
    }
  };

  socket.on("spreadsheet:lease-acquire", (payload, acknowledgement) =>
    acquireOrHeartbeat(
      "spreadsheet:lease-acquire",
      payload,
      acknowledgement,
      "acquire"
    )
  );

  socket.on("spreadsheet:lease-heartbeat", (payload, acknowledgement) =>
    acquireOrHeartbeat(
      "spreadsheet:lease-heartbeat",
      payload,
      acknowledgement,
      "heartbeat"
    )
  );

  socket.on("spreadsheet:lease-release", (payload = {}, acknowledgement) => {
    payload = normalizeSocketPayload(payload);
    const spreadsheetId = payload.spreadsheet_id;
    const requestId = resolveRequestId(payload);
    const config = getCollaborationConfig();

    if (!config.cellLeasesEnabled) {
      if (typeof acknowledgement === "function") {
        acknowledgement({ ok: true, disabled: true, request_id: requestId });
      }
      return;
    }

    if (
      !validateRequestId(payload.request_id) ||
      !isPayloadWithinLimit(payload, PAYLOAD_LIMITS.lease) ||
      !consumeSocketRateLimit(
        socket,
        "spreadsheet:lease-release",
        RATE_LIMITS.leaseRelease
      )
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_LEASE_REQUEST",
          message: "Lease release is invalid or rate limited",
          eventName: "spreadsheet:lease-release",
          requestId,
          spreadsheetId: validateSpreadsheetId(spreadsheetId)
            ? spreadsheetId
            : null,
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
          message: "You must join the spreadsheet room before releasing a cell",
          eventName: "spreadsheet:lease-release",
          requestId,
          spreadsheetId: validateSpreadsheetId(spreadsheetId)
            ? spreadsheetId
            : null,
        },
        acknowledgement
      );
      return;
    }

    const released =
      validateWorksheetId(payload.worksheet_id) &&
      validateRow(payload.row) &&
      validateColumn(payload.column)
        ? leases.releaseCellLease({
            spreadsheetId,
            worksheetId: payload.worksheet_id.trim(),
            row: payload.row,
            column: payload.column,
            socketId: socket.id,
          })
        : { ok: true, lease: null, all: leases.releaseBySocket(socket.id) };

    if (released.ok === false) {
      recordSpreadsheetCollaborationEvent("cell_lease_denied", {
        spreadsheetId,
        userId: socket.user?.id ?? null,
        reason: released.reason || "UNKNOWN",
        mode: "release",
      });
      emitSpreadsheetError(
        socket,
        {
          code: released.reason,
          message: "This cell lease belongs to another user",
          eventName: "spreadsheet:lease-release",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    const leasesToBroadcast = released.all || (released.lease ? [released.lease] : []);
    broadcastReleasedLeases(socket, leasesToBroadcast);
    if (leasesToBroadcast.length > 0) {
      recordSpreadsheetCollaborationEvent("cell_lease_released", {
        spreadsheetId,
        userId: socket.user?.id ?? null,
        count: leasesToBroadcast.length,
      });
    }

    if (typeof acknowledgement === "function") {
      acknowledgement({
        ok: true,
        spreadsheet_id: spreadsheetId,
        request_id: requestId,
      });
    }
  });

  socket.on("spreadsheet:draft-preview", async (payload = {}, acknowledgement) => {
    payload = normalizeSocketPayload(payload);
    const spreadsheetId = payload.spreadsheet_id;
    const requestId = resolveRequestId(payload);
    const config = getCollaborationConfig();

    if (!config.cellLeasesEnabled) {
      if (typeof acknowledgement === "function") {
        acknowledgement({ ok: true, disabled: true, request_id: requestId });
      }
      return;
    }

    if (
      !validateRequestId(payload.request_id) ||
      !isPayloadWithinLimit(payload, PAYLOAD_LIMITS.draftPreview) ||
      !validateLeaseTarget(payload) ||
      !validateDraftPreview(payload.preview)
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "INVALID_DRAFT_PREVIEW",
          message: "Draft preview payload is invalid",
          eventName: "spreadsheet:draft-preview",
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
        "spreadsheet:draft-preview",
        RATE_LIMITS.draftPreview
      )
    ) {
      emitSpreadsheetError(
        socket,
        {
          code: "RATE_LIMITED",
          message: "Too many draft previews",
          eventName: "spreadsheet:draft-preview",
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
          message: "You must join the spreadsheet room before sending drafts",
          eventName: "spreadsheet:draft-preview",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    const lease = leases.getCellLease(
      spreadsheetId,
      payload.worksheet_id.trim(),
      payload.row,
      payload.column
    );
    if (!lease || lease.socketId !== socket.id) {
      emitSpreadsheetError(
        socket,
        {
          code: "DRAFT_PREVIEW_NOT_ALLOWED",
          message: "Draft preview requires an active cell lease",
          eventName: "spreadsheet:draft-preview",
          requestId,
          spreadsheetId,
        },
        acknowledgement
      );
      return;
    }

    socket.to(roomName(spreadsheetId)).emit("spreadsheet:draft-preview", {
      spreadsheet_id: spreadsheetId,
      userId: socket.user.id,
      userName: socket.user.name,
      worksheet_id: payload.worksheet_id.trim(),
      row: payload.row,
      column: payload.column,
      preview: payload.preview,
    });

    if (typeof acknowledgement === "function") {
      acknowledgement({
        ok: true,
        spreadsheet_id: spreadsheetId,
        request_id: requestId,
      });
    }
  });
}

module.exports = {
  broadcastReleasedLeases,
  emitCellLeasesSnapshot,
  registerSpreadsheetCellLeases,
};
