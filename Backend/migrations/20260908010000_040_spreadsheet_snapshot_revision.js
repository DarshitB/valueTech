/**
 * Add the revision represented by workbook_data.
 *
 * Existing snapshots remain null because their exact revision cannot be
 * inferred safely. Phase 5 will create revision-safe checkpoints.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn("spreadsheets", "snapshot_revision"))) {
    await knex.schema.alterTable("spreadsheets", (table) => {
      table.bigInteger("snapshot_revision").nullable();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  if (await knex.schema.hasColumn("spreadsheets", "snapshot_revision")) {
    await knex.schema.alterTable("spreadsheets", (table) => {
      table.dropColumn("snapshot_revision");
    });
  }
};
