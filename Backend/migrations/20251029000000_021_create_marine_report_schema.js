/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 *
 * Migration for report_marine and report_marine_flexible_fields tables
 *
 * Minimal skeleton so you can add inner fields yourself later
 */
exports.up = async function (knex) {
  // Create report_marine table
  await knex.schema.createTable("report_marine", (table) => {
    // Primary key
    table.increments("id").primary();

    // Foreign key to orders table
    table
      .integer("order_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("orders")
      .onDelete("CASCADE");

    // TODO: Add your specific marine report fields here

    // Audit fields
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table
      .integer("created_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table
      .integer("updated_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
  });

  // Create report_marine_flexible_fields table
  await knex.schema.createTable("report_marine_flexible_fields", (table) => {
    // Primary key
    table.increments("id").primary();

    // Foreign key to report_marine table
    table
      .integer("report_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("report_marine")
      .onDelete("CASCADE");

    // Flexible field structure (same pattern as other reports)
    table.string("section_name", 255).nullable();
    table.integer("col_span").nullable();
    table.string("field_label", 255).nullable();
    table.text("field_value").nullable();
    table.integer("field_order").nullable();

    // Audit fields
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table
      .integer("created_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table
      .integer("updated_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    // Indexes for better performance
    table.index("report_id");
    table.index("section_name");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // Drop tables in reverse order due to foreign key constraints
  await knex.schema.dropTableIfExists("report_marine_flexible_fields");
  await knex.schema.dropTableIfExists("report_marine");
};


