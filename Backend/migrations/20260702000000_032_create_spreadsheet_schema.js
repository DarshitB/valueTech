/**
 * Spreadsheet Module Migration
 *
 * Tables:
 * - spreadsheets (main spreadsheet metadata with soft delete)
 * - spreadsheet_versions (versioned workbook JSONB payloads)
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("spreadsheets", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table.string("name", 255).notNullable();
    table.text("description").nullable();

    table
      .integer("created_by")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users");
    table
      .integer("updated_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table
      .integer("deleted_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();
    table.timestamp("deleted_at").nullable();

    table.index("created_by");
    table.index("deleted_at");
  });

  await knex.schema.createTable("spreadsheet_versions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table
      .uuid("spreadsheet_id")
      .notNullable()
      .references("id")
      .inTable("spreadsheets")
      .onDelete("CASCADE");

    table.jsonb("workbook_data").notNullable();
    table.integer("version").notNullable().defaultTo(1);

    table
      .integer("created_by")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users");

    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index(["spreadsheet_id", "version"]);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("spreadsheet_versions");
  await knex.schema.dropTableIfExists("spreadsheets");
};
