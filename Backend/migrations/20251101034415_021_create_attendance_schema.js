/**
 * Attendance Module Migration
 *
 * Table:
 * attendance - Stores employee attendance records with check-in and check-out times
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Create 'attendance' table
  await knex.schema.createTable("attendance", (table) => {
    table.increments("id").primary(); // Attendance ID (PK)
    
    table.integer("user_id").unsigned().notNullable()
      .references("id").inTable("users").onDelete("RESTRICT");
    
    table.date("working_date").notNullable();
    
    table.timestamp("checkin_time").nullable();
    
    table.timestamp("checkout_time").nullable();
    
    table.string("checkin_via", 50).nullable().comment("Method/device used for check-in (e.g., 'Portal', 'finger print machine')");

    table.string("checkout_remarks").nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("attendance");
};
