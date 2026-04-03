/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 * 
 * Migration for report_custom table
 * 
 * report_custom table stores custom reports with flexible JSONB content
 * following the same structure as other report tables (CV, AVR)
 */
exports.up = async function (knex) {
  // Create report_custom table
  await knex.schema.createTable("report_custom", (table) => {
    // Primary key
    table.increments("id").primary();
    
    // Foreign key to orders table
    table.integer("order_id").unsigned().notNullable()
      .references("id").inTable("orders").onDelete("CASCADE");
    
    // Content field for flexible JSON data
    table.jsonb("content").notNullable();
    
    // Audit fields (following the same pattern as other report tables)
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
    
    // Indexes for better performance
    table.index("order_id");
    table.index("created_by");
    table.index("created_at");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("report_custom");
};
