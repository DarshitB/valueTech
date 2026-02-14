/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("order_last_mail", (table) => {
    table.increments("id").primary();
    table
      .integer("order_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("orders")
      .onDelete("CASCADE");
    table.jsonb("to").nullable(); // array of email strings
    table.jsonb("cc").nullable();
    table.jsonb("bcc").nullable();
    table.text("subject").nullable();
    table.text("comments").nullable();
    table.text("regards").nullable();
    table.boolean("mail_attachment").defaultTo(false);
    table.boolean("public_link_with_image").defaultTo(false);
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.unique("order_id");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("order_last_mail");
};
