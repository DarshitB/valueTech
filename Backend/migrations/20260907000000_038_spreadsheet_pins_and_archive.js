/**
 * Spreadsheet list pin + archive.
 *
 * - spreadsheet_pins: per-user pin (one row per user + spreadsheet)
 * - spreadsheets.archived_at / archived_by: global archive (who + when)
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasPins = await knex.schema.hasTable("spreadsheet_pins");
  if (!hasPins) {
    await knex.schema.createTable("spreadsheet_pins", (table) => {
      table.increments("id").primary();

      table
        .uuid("spreadsheet_id")
        .notNullable()
        .references("id")
        .inTable("spreadsheets")
        .onDelete("CASCADE");

      table
        .integer("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");

      table.unique(["spreadsheet_id", "user_id"]);

      table.timestamp("created_at").defaultTo(knex.fn.now());

      table.index(["user_id"], "spreadsheet_pins_user_id_idx");
      table.index(["spreadsheet_id"], "spreadsheet_pins_spreadsheet_id_idx");
    });
  }

  const hasArchivedAt = await knex.schema.hasColumn(
    "spreadsheets",
    "archived_at"
  );
  if (!hasArchivedAt) {
    await knex.schema.alterTable("spreadsheets", (table) => {
      table.timestamp("archived_at").nullable();
      table
        .integer("archived_by")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");

      table.index(["archived_at"], "spreadsheets_archived_at_idx");
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasArchivedAt = await knex.schema.hasColumn(
    "spreadsheets",
    "archived_at"
  );
  if (hasArchivedAt) {
    await knex.schema.alterTable("spreadsheets", (table) => {
      table.dropIndex(["archived_at"], "spreadsheets_archived_at_idx");
      table.dropForeign(["archived_by"]);
      table.dropColumn("archived_by");
      table.dropColumn("archived_at");
    });
  }

  await knex.schema.dropTableIfExists("spreadsheet_pins");
};
