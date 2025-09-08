/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
   await knex.schema.createTable("activity_logs", (table) => {

    table.increments("id").primary();

    table.integer("user_id").unsigned().references("id").inTable("users").onDelete("SET NULL");
    //table.enu("action", ["create", "update", "delete", "login", "logout"]).notNullable();
    table.string("action", 150).notNullable();

    table.string("table_name", 150).nullable();
    table.integer("record_id").nullable();

    table.jsonb("old_data").nullable();
    table.jsonb("new_data").nullable();
    table.jsonb("metadata").nullable(); 

    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists("activity_logs");
};
