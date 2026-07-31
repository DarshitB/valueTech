/**
 * Attendance personal breaks (Break Out / Break In)
 *
 * Table:
 * - attendance_breaks — multiple personal out periods per attendance day
 *   Time between break_out and break_in is deducted from Total Hours (desk time)
 *
 * Soft delete: deleted_at + deleted_by (for later phase if needed)
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("attendance_breaks", (table) => {
    table.increments("id").primary();

    table
      .integer("attendance_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("attendance")
      .onDelete("CASCADE");

    table
      .integer("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("RESTRICT");

    table.date("working_date").notNullable();

    table.timestamp("break_out").notNullable();
    table.timestamp("break_in").nullable();

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

    table.index("attendance_id");
    table.index("user_id");
    table.index("working_date");
    table.index("deleted_at");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("attendance_breaks");
};
