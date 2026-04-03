/**
 * Bank Authority "Other Authorities" link table
 *
 * Use case: A head/main BANK AUTHORITY user can select multiple other BANK AUTHORITY
 * users when creating/editing their authority. The main authority can then see:
 * - Orders of their own authority and its officers
 * - Orders of each linked (selected) authority and that authority's officers
 *
 * Similar to officer_categories: many-to-many between authority (user) and other authorities (users).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("bank_authority_linked_authorities", (table) => {
    table.increments("id").primary();

    table
      .integer("authority_user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table
      .integer("linked_authority_user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table.unique(["authority_user_id", "linked_authority_user_id"]);

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
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("bank_authority_linked_authorities");
};
