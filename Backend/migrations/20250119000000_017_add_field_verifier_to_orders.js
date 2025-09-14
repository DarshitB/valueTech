/**
 * Add field_verifier column to orders table
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable("orders", (table) => {
    table.integer("field_verifier_id").unsigned().nullable()
      .references("id").inTable("field_verifiers").onDelete("SET NULL");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable("orders", (table) => {
    table.dropColumn("field_verifier");
  });
};
