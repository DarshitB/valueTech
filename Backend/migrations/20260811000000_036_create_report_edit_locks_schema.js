/**
 * Report edit locks — one editor at a time per order report.
 *
 * Initially used for Marine reports only (report_marine).
 * Heartbeat refreshes expires_at; stale locks auto-free the report.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("report_edit_locks", (table) => {
    table.increments("id").primary();

    table
      .integer("order_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("orders")
      .onDelete("CASCADE");

    // e.g. report_marine — unique with order_id so only one lock per report type
    table.string("report_type", 64).notNullable();

    table
      .integer("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    // Snapshot for toast messages without extra joins
    table.string("user_name", 255).notNullable();

    table.timestamp("locked_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("last_heartbeat_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at").notNullable();

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();

    table.unique(["order_id", "report_type"]);
    table.index("user_id");
    table.index("expires_at");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("report_edit_locks");
};
