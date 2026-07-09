/**
 * Create spreadsheet_users table for spreadsheet assignment visibility.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasTable("spreadsheet_users");
  if (exists) {
    return;
  }

  await knex.schema.createTable("spreadsheet_users", (table) => {
    table.increments("id").primary();

    table
      .uuid("spreadsheet_id")
      .notNullable()
      .references("id")
      .inTable("spreadsheets")
      .onDelete("CASCADE");

    table
      .integer("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table.unique(["spreadsheet_id", "user_id"]);

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table
      .integer("created_by")
      .unsigned()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    table.timestamp("deleted_at").nullable();
    table
      .integer("deleted_by")
      .unsigned()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    table.index(["spreadsheet_id"], "spreadsheet_users_spreadsheet_id_idx");
    table.index(["user_id"], "spreadsheet_users_user_id_idx");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("spreadsheet_users");
};
