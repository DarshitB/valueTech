/**
 * Migration for order_comments table (chat/comments for orders)
 *
 * Fields:
 *  - id: Primary key
 *  - order_id: Foreign key to orders table
 *  - user_id: Foreign key to users table
 *  - comment: Text of the comment
 *  - commented_at: Timestamp (default now)
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("order_comments", (table) => {
    table.increments("id").primary(); // Comment ID (PK)
    table.integer("order_id").unsigned().notNullable()
      .references("id").inTable("orders").onDelete("CASCADE");
    table.integer("user_id").unsigned().notNullable()
      .references("id").inTable("users").onDelete("CASCADE");
    table.text("comment").notNullable(); // Comment text
    table.timestamp("commented_at").defaultTo(knex.fn.now()); // When comment was made
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("order_comments");
};
