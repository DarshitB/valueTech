/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Create permissions table
  await knex.schema.createTable("permissions", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable().unique();

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("deleted_at").nullable();
    table.integer("deleted_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
  });

  // Create role_permissions table
  await knex.schema.createTable('role_permissions', (table) => {
    table.increments('id').primary();
    table.integer('role_id').references('id').inTable('roles').onDelete('CASCADE');
    table.integer('permission_id').references('id').inTable('permissions').onDelete('CASCADE');

    table.timestamp("created_at").defaultTo(knex.fn.now());
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
exports.down = async function(knex) {
   await knex.schema.dropTableIfExists('role_permissions');
   await knex.schema.dropTableIfExists('permissions');
};
