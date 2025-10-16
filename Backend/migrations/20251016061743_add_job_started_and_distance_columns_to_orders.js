/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable("orders", (table) => {
    table.timestamp("job_started_at").nullable();
    
    table.integer("job_started_by").unsigned().nullable()
      .references("id").inTable("field_verifiers").onDelete("SET NULL");
    
    table.string("covered_distance_by_verifier").nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable("orders", (table) => {
    table.dropForeign("job_started_by");
    table.dropColumn("job_started_at");
    table.dropColumn("job_started_by");
    table.dropColumn("covered_distance_by_verifier");
  });
};
