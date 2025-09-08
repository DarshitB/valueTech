/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("order_media_documents", (table) => {
    // Primary key
    table.increments("id").primary();
    
    // Foreign key to orders table
    table.integer("order_id").unsigned().notNullable()
      .references("id").inTable("orders").onDelete("CASCADE");
    
    // Media information
    table.text("media_url").notNullable(); // Local file path for direct access
    table.string("media_type").notNullable(); // 'pdf', 'image', 'excel', 'other'
    table.string("document_type").notNullable(); // 'collage', 'report', 'documents', 'other'
    table.string("created_type").notNullable(); // 'generate', 'upload', 'other'
    
    // Audit fields
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned()
      .references("id").inTable("users").onDelete("SET NULL");
    
    // Soft delete fields
    table.timestamp("deleted_at").nullable();
    table.integer("deleted_by").unsigned()
      .references("id").inTable("users").onDelete("SET NULL");
    
    // Indexes for better performance
    table.index("order_id");
    table.index("media_type");
    table.index("document_type");
    table.index("created_type");
    table.index("created_by");
    table.index("deleted_at");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTable("order_media_documents");
};
