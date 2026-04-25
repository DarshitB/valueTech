exports.up = async function (knex) {
  await knex.schema.createTable("order_public_share_links", (table) => {
    table.increments("id").primary();
    table
      .integer("order_id")
      .notNullable()
      .references("id")
      .inTable("orders")
      .onDelete("CASCADE");
    table.string("token", 128).notNullable().unique();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.unique(["order_id"]);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("order_public_share_links");
};

