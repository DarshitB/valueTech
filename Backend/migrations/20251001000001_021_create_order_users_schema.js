/**
 * Create order_users table for many-to-many relationship between orders and users
 * Similar to officer_categories mapping table
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("order_users", (table) => {
    table.increments("id").primary();

    table.integer("order_id").unsigned().notNullable()
      .references("id").inTable("orders").onDelete("CASCADE");

    table.integer("user_id").unsigned().notNullable()
      .references("id").inTable("users").onDelete("CASCADE");

    // Prevent duplicate user assignment to same order
    table.unique(["order_id", "user_id"]);

    // Audit columns for traceability
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("deleted_at").nullable();
    table.integer("deleted_by").unsigned().references("id").inTable("users").onDelete("SET NULL");

    // Indexes for performance
    table.index(["order_id"], "order_users_order_id_idx");
    table.index(["user_id"], "order_users_user_id_idx");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("order_users");
};

