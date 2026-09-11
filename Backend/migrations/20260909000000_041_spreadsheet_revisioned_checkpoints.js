/**
 * Phase 5: tag spreadsheet_versions with the command-log revision they
 * represent, and store one personal in-progress draft per user/sheet.
 *
 * Existing versions stay revision=null. Checkpoints stay disabled until
 * SPREADSHEET_COLLAB_CHECKPOINTS is turned on.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn("spreadsheet_versions", "revision"))) {
    await knex.schema.alterTable("spreadsheet_versions", (table) => {
      table.bigInteger("revision").nullable();
    });
  }

  if (!(await knex.schema.hasTable("spreadsheet_personal_drafts"))) {
    await knex.schema.createTable("spreadsheet_personal_drafts", (table) => {
      table.uuid("spreadsheet_id").notNullable();
      table.integer("user_id").unsigned().notNullable();
      table.string("sheet_id", 255).notNullable();
      table.integer("row").notNullable();
      table.integer("column").notNullable();
      table.jsonb("document_data").notNullable();
      table.timestamp("updated_at").defaultTo(knex.fn.now());

      table.primary(["spreadsheet_id", "user_id"]);
      table
        .foreign("spreadsheet_id")
        .references("id")
        .inTable("spreadsheets")
        .onDelete("CASCADE");
      table
        .foreign("user_id")
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("spreadsheet_personal_drafts");

  if (await knex.schema.hasColumn("spreadsheet_versions", "revision")) {
    await knex.schema.alterTable("spreadsheet_versions", (table) => {
      table.dropColumn("revision");
    });
  }
};
