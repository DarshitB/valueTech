/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async  function(knex) {
  
    // Create 'bank' table
    await knex.schema.createTable("bank", (table) => {
        table.increments("id").primary(); // Auto-incrementing ID

        table.string("name").notNullable(); // Bank name
        table.string("initial").notNullable(); // Bank short code or initials

        table.boolean("is_active").defaultTo(true); // Active flag

        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.integer("created_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
        table.timestamp("updated_at").nullable();
        table.integer("updated_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
        table.timestamp("deleted_at").nullable();
        table.integer("deleted_by").unsigned().references("id").inTable("users").onDelete("SET NULL");
    });

    // Create 'bank_branch' table
    await knex.schema.createTable("bank_branch", (table) => {
        table.increments("id").primary(); // Auto-incrementing ID
        table.string("name").notNullable(); // Branch name

        table.integer("bank_id").unsigned().notNullable()
        .references("id").inTable("bank").onDelete("CASCADE"); // FK to bank

        table.integer("city_id").unsigned().notNullable()
        .references("id").inTable("cities").onDelete("CASCADE"); // FK to cities

        table.boolean("is_active").defaultTo(true); // Active flag

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
exports.down = async  function(knex) {
    await knex.schema.dropTableIfExists("bank_branch");
    await knex.schema.dropTableIfExists("bank");
};
