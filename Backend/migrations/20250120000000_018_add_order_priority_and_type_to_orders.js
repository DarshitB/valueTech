/**
 * Add order_priority and order_type columns to orders table
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable("orders", (table) => {
    table.string("order_priority").nullable();
    table.string("order_type").nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable("orders", (table) => {
    table.dropColumn("order_priority");
    table.dropColumn("order_type");
  });
};
