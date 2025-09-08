/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Step 1: Create roles
  await knex.schema.createTable("roles", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable().unique();

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();
    table.timestamp("deleted_at").nullable();
  });

  // Step 2: Create users
  await knex.schema.createTable("users", (table) => {
    table.increments("id").primary();

    table.string("name").notNullable();
    table.string("email").notNullable().unique();
    table.string("mobile", 15).nullable();
    table.string("password").notNullable();

    table.integer("role_id").unsigned().references("id").inTable("roles").onDelete("SET NULL");
    table.integer("city_id").unsigned().references("id").inTable("cities").onDelete("SET NULL");

    table.string("otp", 10).nullable();
    table.timestamp("otp_expiry").nullable();

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("deleted_at").nullable();
    table.integer("deleted_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
  });

   // Step 3: Alter roles to add FK columns
  await knex.schema.alterTable("roles", (table) => {
    table.integer("created_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.integer("updated_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.integer("deleted_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
  });

  // Step 4: Alter states and cities to add tracking fields
  await knex.schema.alterTable("states", (table) => {
    table.integer("created_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("deleted_at").nullable();
    table.integer("deleted_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
  });

  await knex.schema.alterTable("cities", (table) => {
    table.integer("created_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("deleted_at").nullable();
    table.integer("deleted_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // Step 1: Drop added FKs from roles
  await knex.schema.alterTable("roles", (table) => {
    table.dropForeign("created_by");
    table.dropForeign("updated_by");
    table.dropForeign("deleted_by");
  });

  // Step 2: Drop added FKs from users
  await knex.schema.alterTable("users", (table) => {
    table.dropForeign("role_id");
    table.dropForeign("city_id");
    table.dropForeign("created_by");
    table.dropForeign("updated_by");
    table.dropForeign("deleted_by");
  });

  // Step 3: Drop added FKs from states and cities
  await knex.schema.alterTable("states", (table) => {
    table.dropForeign("created_by");
    table.dropForeign("updated_by");
    table.dropForeign("deleted_by");
  });

  await knex.schema.alterTable("cities", (table) => {
    table.dropForeign("created_by");
    table.dropForeign("updated_by");
    table.dropForeign("deleted_by");
  });

  // Step 4: Drop tables (users first, then roles)
  await knex.schema.dropTableIfExists("users");
  await knex.schema.dropTableIfExists("roles");
};
