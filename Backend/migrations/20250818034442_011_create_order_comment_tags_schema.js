/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 * 
 * Migration for order_comment_tags table (tagged users in order comments)
 * Fields:
 *  - id: Primary key
 *  - comment_id: Foreign key to order_comments.id
 *  - user_id: Foreign key to users.id (the tagged user)
 */
exports.up = async function(knex) {
    await knex.schema.createTable("order_comment_tags", (table) => {
      table.increments("id").primary();
      table.integer("comment_id").unsigned().notNullable()
        .references("id").inTable("order_comments").onDelete("CASCADE");
      table.integer("user_id").unsigned().notNullable()
        .references("id").inTable("users").onDelete("CASCADE");
    });
  };  

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    await knex.schema.dropTableIfExists("order_comment_tags");
};
