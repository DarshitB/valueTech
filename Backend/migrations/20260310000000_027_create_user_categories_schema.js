/**
 * Create user_categories table (similar to officer_categories but for users)
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("user_categories", (table) => {
    table.increments("id").primary();

    table
      .integer("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table
      .integer("category_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("category")
      .onDelete("CASCADE");

    // Prevent duplicate category assignment per user
    table.unique(["user_id", "category_id"]);

    // Audit columns (same pattern as officer_categories)
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table
      .integer("created_by")
      .unsigned()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.timestamp("deleted_at").nullable();
    table
      .integer("deleted_by")
      .unsigned()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("user_categories");
};

