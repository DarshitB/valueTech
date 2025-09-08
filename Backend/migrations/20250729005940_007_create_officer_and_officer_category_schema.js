/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Create 'officers' table
  await knex.schema.createTable("officers", (table) => {
    table.increments("id").primary(); // Officer ID

    table.integer("user_id").unsigned().notNullable()
      .references("id").inTable("users").onDelete("CASCADE"); // Linked user

    table.integer("branch_id").unsigned().notNullable()
      .references("id").inTable("bank_branch").onDelete("CASCADE");

    table.boolean("is_active").defaultTo(true);

    // Audit columns
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("deleted_at").nullable();
    table.integer("deleted_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
  });

  // Create 'officer_categories' table (many-to-many)
  await knex.schema.createTable("officer_categories", (table) => {
    table.increments("id").primary();

    table.integer("officer_id").unsigned().notNullable()
      .references("id").inTable("officers").onDelete("CASCADE");

    table.integer("category_id").unsigned().notNullable()
      .references("id").inTable("category").onDelete("CASCADE");

    // Prevent duplicate category assignment
    table.unique(["officer_id", "category_id"]);

    // Audit columns (optional here, but recommended for traceability)
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("deleted_at").nullable();
    table.integer("deleted_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("officer_categories");
  await knex.schema.dropTableIfExists("officers");
};
