/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable("child_category_images", (table) => {
    table.increments("id").primary();
    
    table.integer("child_category_id").unsigned().notNullable()
      .references("id").inTable("child_category").onDelete("CASCADE");
    
    table.string("image_url").notNullable();
    
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists("child_category_images");
};
