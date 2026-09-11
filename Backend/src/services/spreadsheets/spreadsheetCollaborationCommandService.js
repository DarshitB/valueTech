const db = require("../../../db");
const { isDeepStrictEqual } = require("node:util");

const COMMAND_TABLE = "spreadsheet_collaboration_commands";
const DEFAULT_MAX_COMMANDS_PER_SPREADSHEET = 50_000;
const DEFAULT_REPLAY_COMMAND_LIMIT = 500;

function toSafeRevision(value) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Allocated spreadsheet revision is invalid");
  }
  return revision;
}

const CANONICAL_COMMAND_COLUMNS = [
  "spreadsheet_id",
  "revision",
  "operation_id",
  "client_id",
  "client_sequence",
  "actor_id",
  "command_id",
  "command_params",
  "created_at",
];

function findCommandByOperation(database, spreadsheetId, operationId) {
  return database(COMMAND_TABLE)
    .select(CANONICAL_COMMAND_COLUMNS)
    .where({
      spreadsheet_id: spreadsheetId,
      operation_id: operationId,
    })
    .first();
}

function findCommandByClientSequence(
  database,
  spreadsheetId,
  clientId,
  clientSequence
) {
  return database(COMMAND_TABLE)
    .select(CANONICAL_COMMAND_COLUMNS)
    .where({
      spreadsheet_id: spreadsheetId,
      client_id: clientId,
      client_sequence: clientSequence,
    })
    .first();
}

function assertMatchingCommand(existing, command) {
  if (
    existing.operation_id !== command.operationId ||
    existing.client_id !== command.clientId ||
    Number(existing.client_sequence) !== command.clientSequence ||
    existing.command_id !== command.commandId ||
    !isDeepStrictEqual(existing.command_params, command.commandParams)
  ) {
    const error = new Error(
      "Operation ID or client sequence conflicts with another command"
    );
    error.code = "COLLABORATION_OPERATION_CONFLICT";
    throw error;
  }
}

async function findExistingCommand(database, command) {
  const [byOperation, byClientSequence] = await Promise.all([
    findCommandByOperation(
      database,
      command.spreadsheetId,
      command.operationId
    ),
    findCommandByClientSequence(
      database,
      command.spreadsheetId,
      command.clientId,
      command.clientSequence
    ),
  ]);

  if (
    byOperation &&
    byClientSequence &&
    Number(byOperation.revision) !== Number(byClientSequence.revision)
  ) {
    const error = new Error(
      "Operation ID and client sequence resolve to different commands"
    );
    error.code = "COLLABORATION_OPERATION_CONFLICT";
    throw error;
  }

  const existing = byOperation || byClientSequence || null;
  if (existing) {
    assertMatchingCommand(existing, command);
  }
  return existing;
}

function normalizeCommandRow(row) {
  return {
    spreadsheetId: row.spreadsheet_id,
    revision: toSafeRevision(row.revision),
    operationId: row.operation_id,
    clientId: row.client_id,
    clientSequence: Number(row.client_sequence),
    actorId: row.actor_id == null ? null : Number(row.actor_id),
    commandId: row.command_id,
    commandParams: row.command_params,
    createdAt: row.created_at,
  };
}

/**
 * Allocate a gap-free per-spreadsheet revision and append its command in one
 * PostgreSQL transaction. Unique constraints make retries deterministic across
 * reconnects and backend processes.
 */
async function recordSpreadsheetCollaborationCommand(
  {
    spreadsheetId,
    operationId,
    clientId,
    clientSequence,
    actorId,
    commandId,
    commandParams,
  },
  database = db
) {
  try {
    return await database.transaction(async (trx) => {
      const command = {
        spreadsheetId,
        operationId,
        clientId,
        clientSequence,
        commandId,
        commandParams,
      };
      const existing = await findExistingCommand(trx, command);
      if (existing) {
        return {
          duplicate: true,
          revision: toSafeRevision(existing.revision),
          command: normalizeCommandRow(existing),
        };
      }

      const [spreadsheet] = await trx("spreadsheets")
        .where({ id: spreadsheetId })
        .whereNull("deleted_at")
        .increment("current_revision", 1)
        .returning("current_revision");

      if (!spreadsheet) {
        const error = new Error("Spreadsheet not found while allocating revision");
        error.code = "SPREADSHEET_NOT_FOUND";
        throw error;
      }

      const revision = toSafeRevision(spreadsheet.current_revision);
      const row = {
        spreadsheet_id: spreadsheetId,
        revision,
        operation_id: operationId,
        client_id: clientId,
        client_sequence: clientSequence,
        actor_id: actorId,
        command_id: commandId,
        command_params: commandParams,
        created_at: trx.fn.now(),
      };
      await trx(COMMAND_TABLE).insert(row);

      return {
        duplicate: false,
        revision,
        command: normalizeCommandRow(row),
      };
    });
  } catch (error) {
    if (error?.code !== "23505") {
      throw error;
    }

    const existing = await findExistingCommand(database, {
      spreadsheetId,
      operationId,
      clientId,
      clientSequence,
      commandId,
      commandParams,
    });
    if (!existing) {
      throw error;
    }

    return {
      duplicate: true,
      revision: toSafeRevision(existing.revision),
      command: normalizeCommandRow(existing),
    };
  }
}

async function prepareSpreadsheetCollaborationReplay(
  spreadsheetId,
  lastRevision,
  {
    limit = DEFAULT_REPLAY_COMMAND_LIMIT,
    database = db,
  } = {}
) {
  const spreadsheet = await database("spreadsheets")
    .select("current_revision", "snapshot_revision")
    .where({ id: spreadsheetId })
    .whereNull("deleted_at")
    .first();

  if (!spreadsheet) {
    return { ok: false, reason: "SPREADSHEET_NOT_FOUND" };
  }

  const currentRevision = Number(spreadsheet.current_revision || 0);
  const snapshotRevision =
    spreadsheet.snapshot_revision == null
      ? null
      : Number(spreadsheet.snapshot_revision);
  const requestedRevision =
    lastRevision == null ? snapshotRevision : Number(lastRevision);

  if (!Number.isSafeInteger(currentRevision) || currentRevision < 0) {
    return { ok: false, reason: "INVALID_SERVER_REVISION" };
  }
  if (
    requestedRevision == null ||
    !Number.isSafeInteger(requestedRevision) ||
    requestedRevision < 0
  ) {
    return {
      ok: false,
      reason: "CHECKPOINT_UNAVAILABLE",
      currentRevision,
      snapshotRevision,
    };
  }
  if (requestedRevision > currentRevision) {
    return {
      ok: false,
      reason: "CLIENT_REVISION_AHEAD",
      currentRevision,
      snapshotRevision,
    };
  }

  const rows = await database(COMMAND_TABLE)
    .select(CANONICAL_COMMAND_COLUMNS)
    .where({ spreadsheet_id: spreadsheetId })
    .where("revision", ">", requestedRevision)
    .where("revision", "<=", currentRevision)
    .orderBy("revision", "asc")
    .limit(limit + 1);

  if (rows.length > limit) {
    return {
      ok: false,
      reason: "REPLAY_LIMIT_EXCEEDED",
      currentRevision,
      snapshotRevision,
    };
  }

  let expectedRevision = requestedRevision + 1;
  for (const row of rows) {
    if (Number(row.revision) !== expectedRevision) {
      return {
        ok: false,
        reason: "HISTORY_GAP",
        currentRevision,
        snapshotRevision,
        oldestAvailableRevision:
          rows.length > 0 ? Number(rows[0].revision) : null,
      };
    }
    expectedRevision += 1;
  }

  if (expectedRevision - 1 !== currentRevision) {
    return {
      ok: false,
      reason: "HISTORY_GAP",
      currentRevision,
      snapshotRevision,
      oldestAvailableRevision:
        rows.length > 0 ? Number(rows[0].revision) : null,
    };
  }

  return {
    ok: true,
    fromRevision: requestedRevision,
    currentRevision,
    snapshotRevision,
    commands: rows.map(normalizeCommandRow),
  };
}

/**
 * Shadow logs are bounded by both age and row count. This never runs in the
 * command transaction, so cleanup cannot delay or roll back collaboration.
 */
async function pruneSpreadsheetCollaborationCommands(
  spreadsheetId,
  {
    retentionDays,
    maxCommands = DEFAULT_MAX_COMMANDS_PER_SPREADSHEET,
  },
  database = db
) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  await database(COMMAND_TABLE)
    .where({ spreadsheet_id: spreadsheetId })
    .where("created_at", "<", cutoff)
    .del();

  const staleIds = database(COMMAND_TABLE)
    .select("id")
    .where({ spreadsheet_id: spreadsheetId })
    .orderBy("revision", "desc")
    .offset(maxCommands);

  await database(COMMAND_TABLE).whereIn("id", staleIds).del();
}

module.exports = {
  DEFAULT_MAX_COMMANDS_PER_SPREADSHEET,
  DEFAULT_REPLAY_COMMAND_LIMIT,
  prepareSpreadsheetCollaborationReplay,
  pruneSpreadsheetCollaborationCommands,
  recordSpreadsheetCollaborationCommand,
  toSafeRevision,
};
