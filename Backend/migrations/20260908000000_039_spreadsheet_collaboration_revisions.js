/**
 * Add durable spreadsheet collaboration revisions in shadow mode.
 *
 * The existing workbook snapshot and V1 Socket.IO relay remain authoritative.
 * These additions are safe while SPREADSHEET_COLLAB_V2 is disabled.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn("spreadsheets", "workbook_data"))) {
    await knex.schema.alterTable("spreadsheets", (table) => {
      table.jsonb("workbook_data").nullable();
    });

    await knex.raw(`
      UPDATE spreadsheets AS s
      SET workbook_data = latest.workbook_data
      FROM (
        SELECT DISTINCT ON (spreadsheet_id)
          spreadsheet_id,
          workbook_data
        FROM spreadsheet_versions
        ORDER BY spreadsheet_id, version DESC
      ) AS latest
      WHERE latest.spreadsheet_id = s.id
        AND s.workbook_data IS NULL
    `);
  }

  if (!(await knex.schema.hasColumn("spreadsheets", "current_version"))) {
    await knex.schema.alterTable("spreadsheets", (table) => {
      table.integer("current_version").notNullable().defaultTo(1);
    });
  }

  if (!(await knex.schema.hasColumn("spreadsheets", "current_revision"))) {
    await knex.schema.alterTable("spreadsheets", (table) => {
      table.bigInteger("current_revision").notNullable().defaultTo(0);
    });
  }

  // Existing code previously had only a non-unique index. Normalize any
  // accidental duplicate version numbers before enforcing uniqueness.
  await knex.raw(`
    WITH ranked_versions AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY spreadsheet_id
          ORDER BY created_at ASC, id ASC
        ) AS normalized_version
      FROM spreadsheet_versions
    )
    UPDATE spreadsheet_versions AS versions
    SET version = ranked_versions.normalized_version
    FROM ranked_versions
    WHERE versions.id = ranked_versions.id
      AND versions.version IS DISTINCT FROM ranked_versions.normalized_version
  `);

  await knex.raw(`
    UPDATE spreadsheets AS sheets
    SET current_version = latest.version
    FROM (
      SELECT spreadsheet_id, MAX(version) AS version
      FROM spreadsheet_versions
      GROUP BY spreadsheet_id
    ) AS latest
    WHERE latest.spreadsheet_id = sheets.id
      AND sheets.current_version IS DISTINCT FROM latest.version
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS
      spreadsheet_versions_spreadsheet_version_unique
    ON spreadsheet_versions (spreadsheet_id, version)
  `);

  if (!(await knex.schema.hasTable("spreadsheet_collaboration_commands"))) {
    await knex.schema.createTable(
      "spreadsheet_collaboration_commands",
      (table) => {
        table.bigIncrements("id").primary();
        table
          .uuid("spreadsheet_id")
          .notNullable()
          .references("id")
          .inTable("spreadsheets")
          .onDelete("CASCADE");
        table.bigInteger("revision").notNullable();
        table.string("operation_id", 128).notNullable();
        table.string("client_id", 128).notNullable();
        table.bigInteger("client_sequence").notNullable();
        table
          .integer("actor_id")
          .unsigned()
          .nullable()
          .references("id")
          .inTable("users")
          .onDelete("SET NULL");
        table.string("command_id", 128).notNullable();
        table.jsonb("command_params").notNullable();
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

        table.unique(
          ["spreadsheet_id", "revision"],
          "spreadsheet_collaboration_commands_revision_unique"
        );
        table.unique(
          ["spreadsheet_id", "operation_id"],
          "spreadsheet_collaboration_commands_operation_unique"
        );
        table.unique(
          ["spreadsheet_id", "client_id", "client_sequence"],
          "spreadsheet_collaboration_commands_client_sequence_unique"
        );
        table.index(
          ["spreadsheet_id", "created_at"],
          "spreadsheet_collaboration_commands_created_at_idx"
        );
      }
    );
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("spreadsheet_collaboration_commands");
  await knex.raw(`
    DROP INDEX IF EXISTS spreadsheet_versions_spreadsheet_version_unique
  `);

  if (await knex.schema.hasColumn("spreadsheets", "current_revision")) {
    await knex.schema.alterTable("spreadsheets", (table) => {
      table.dropColumn("current_revision");
    });
  }
};
