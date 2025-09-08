/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Create `states` table
  await knex.schema.createTable("states", (table) => {
    table.increments("id").primary();
    table.string("name", 100).notNullable();
    table.boolean("is_active").defaultTo(true);

    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // Create `cities` table
  await knex.schema.createTable("cities", (table) => {
    table.increments("id").primary();
    table.string("name", 100).notNullable();
    table.integer("state_id").unsigned().references("id").inTable("states").onDelete("CASCADE");
    table.boolean("is_active").defaultTo(true);

    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("cities");
  await knex.schema.dropTableIfExists("states");
};
