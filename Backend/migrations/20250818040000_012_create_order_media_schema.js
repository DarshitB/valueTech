/**
 * Migration: Create order_media table for storing images and videos related to orders
 * This table stores media files (images/videos) uploaded by different user types for orders
 */

exports.up = async function(knex) {
  await knex.schema.createTable("order_media_image_video", (table) => {
    // Primary key
    table.increments("id").primary();
    
    // Foreign key to orders table
    table.integer("order_id").unsigned().notNullable()
      .references("id").inTable("orders").onDelete("CASCADE");
    
    // Uploader information - type can be 'user', 'officer', 'manager', etc.
    table.string("uploader_type", 50).notNullable();
    
    // Uploader ID - references the ID from the uploader_type table
    table.integer("uploader_id").unsigned().notNullable();
    
    // Media file information - only media_url is needed for local storage
    table.text("media_url").notNullable(); // Local file path for direct access
    table.string("media_type", 20).notNullable(); // 'image', 'video', 'document'
    
    // Status - pending(0), approved(1), rejected(2)
    table.integer("status").unsigned().notNullable().defaultTo(0);

    // Timestamps
    table.timestamp("created_at").defaultTo(knex.fn.now());
    
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists("order_media_image_video");
};
