/**
 * Add supervisor_number and driver_number columns to orders table
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable("orders", (table) => {
    table.string("supervisor_number", 20).nullable().comment("Supervisor contact number");
    table.string("driver_number", 20).nullable().comment("Driver contact number");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable("orders", (table) => {
    table.dropColumn("supervisor_number");
    table.dropColumn("driver_number");
  });
};
