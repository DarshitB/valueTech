/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  
  // Create 'category' table
  await knex.schema.createTable("category", (table) => {
    table.increments("id").primary(); // Auto-increment ID
    table.string("name").notNullable(); // Category name
    table.boolean("is_active").defaultTo(true); // Active status

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("deleted_at").nullable();
    table.integer("deleted_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
  });

  // Create 'sub_category' table
  await knex.schema.createTable("sub_category", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable();
    
    table.integer("category_id").unsigned().notNullable()
      .references("id").inTable("category").onDelete("CASCADE"); // FK to category

    table.boolean("is_active").defaultTo(true);

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("deleted_at").nullable();
    table.integer("deleted_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
  });

  // Create 'child_category' table
  await knex.schema.createTable("child_category", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable();

    table.integer("sub_category_id").unsigned().notNullable()
      .references("id").inTable("sub_category").onDelete("CASCADE"); // FK to sub_category

    table.boolean("is_active").defaultTo(true);

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
  // Drop in reverse order to maintain FK integrity
  await knex.schema.dropTableIfExists("child_category");
  await knex.schema.dropTableIfExists("sub_category");
  await knex.schema.dropTableIfExists("category");
};
