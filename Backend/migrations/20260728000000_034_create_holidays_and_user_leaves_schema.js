/**
 * Attendance Holidays / Leaves Migration
 *
 * Tables:
 * - holidays     — company-wide holidays (all users), single date or date range
 * - user_leaves  — user-specific paid leave / leave / half day
 *
 * Soft delete: deleted_at + deleted_by (delete UI is a later phase)
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("holidays", (table) => {
    table.increments("id").primary();

    table.string("title", 255).notNullable();
    table.date("start_date").notNullable();
    table.date("end_date").notNullable();
    table.string("type", 50).notNullable().defaultTo("holiday");
    table.boolean("is_active").notNullable().defaultTo(true);

    table
      .integer("created_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
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

    table.index("start_date");
    table.index("end_date");
    table.index("deleted_at");
  });

  await knex.schema.createTable("user_leaves", (table) => {
    table.increments("id").primary();

    table
      .integer("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("RESTRICT");

    table.date("start_date").notNullable();
    table.date("end_date").notNullable();
    // paid_leave | leave | half_day
    table.string("leave_type", 50).notNullable();
    // first_half | second_half (only for half_day)
    table.string("half_day_session", 50).nullable();
    table.string("remarks", 500).nullable();
    // approved | pending | rejected (admin-created can start as approved later)
    table.string("status", 50).notNullable().defaultTo("approved");

    table
      .integer("created_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
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

    table.index("user_id");
    table.index("start_date");
    table.index("end_date");
    table.index("deleted_at");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("user_leaves");
  await knex.schema.dropTableIfExists("holidays");
};
