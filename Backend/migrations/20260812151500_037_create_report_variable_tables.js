/**
 * Generic report variables (master + per-report values)
 *
 * Master table stores variable keys per report type:
 *   - e.g. report_type=report_marine, key_name=vesselName
 *
 * Values table stores value per report record:
 *   - variable_id + report_record_id => one value
 *
 * Notes:
 * - report_record_id is polymorphic (depends on report_type via variable_id).
 * - No direct FK for report_record_id because each report type has its own table.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("report_variable_master", (table) => {
    table.increments("id").primary();

    table.string("report_type", 64).notNullable();
    table.string("key_name", 128).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);

    table
      .integer("created_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table
      .integer("updated_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table
      .integer("deleted_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();
    table.timestamp("deleted_at").nullable();

    // Prevent duplicate variable names within the same report type.
    table.unique(["report_type", "key_name"]);
    table.index(["report_type"]);
    table.index(["is_active"]);
    table.index(["deleted_at"]);
  });

  await knex.schema.createTable("report_variable_values", (table) => {
    table.increments("id").primary();

    table
      .integer("variable_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("report_variable_master")
      .onDelete("CASCADE");

    // Id of the report row in its own report table (report_marine/report_cv/etc.)
    table.integer("report_record_id").unsigned().notNullable();
    table.text("value").nullable();

    table
      .integer("created_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table
      .integer("updated_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();

    // One value per variable per report record.
    table.unique(["variable_id", "report_record_id"]);
    table.index(["report_record_id"]);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("report_variable_values");
  await knex.schema.dropTableIfExists("report_variable_master");
};

