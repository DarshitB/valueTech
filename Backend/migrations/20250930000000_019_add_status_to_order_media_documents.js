/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable("order_media_documents", (table) => {
    table.string("status").nullable();
    table.index(["status"], "order_media_documents_status_idx");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable("order_media_documents", (table) => {
    table.dropIndex(["status"], "order_media_documents_status_idx");
    table.dropColumn("status");
  });
};


