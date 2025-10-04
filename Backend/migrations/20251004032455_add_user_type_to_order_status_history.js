/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable("order_status_history", (table) => {
    table.string("user_type").nullable().comment("Type of user who made the change (e.g., 'admin', 'officer', 'manager')");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable("order_status_history", (table) => {
    table.dropColumn("user_type");
  });
};
