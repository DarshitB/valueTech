exports.up = async function up(knex) {
  await knex.schema.createTable("order_r2_sync_status", (table) => {
    table.increments("id").primary();
    table
      .integer("order_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("orders")
      .onDelete("CASCADE");
    table.string("status", 32).notNullable().defaultTo("idle");
    table.text("message").nullable();
    table.integer("uploaded_count").notNullable().defaultTo(0);
    table.integer("skipped_count").notNullable().defaultTo(0);
    table.integer("failed_count").notNullable().defaultTo(0);
    table.integer("deleted_count").notNullable().defaultTo(0);
    table.timestamp("started_at").nullable();
    table.timestamp("completed_at").nullable();
    table.timestamp("heartbeat_at").nullable();
    table.timestamps(true, true);

    table.unique(["order_id"]);
    table.index(["status"]);
    table.index(["heartbeat_at"]);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("order_r2_sync_status");
};
