/**
 * Notifications Module Migration
 *
 * Table: notifications - Stores user notifications for order activities
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Create 'notifications' table
  await knex.schema.createTable("notifications", (table) => {
    table.increments("id").primary();
    
    table.integer("user_id").unsigned().notNullable()
      .references("id").inTable("users").onDelete("CASCADE");
    
    table.integer("order_id").unsigned().notNullable()
      .references("id").inTable("orders").onDelete("CASCADE");
    
    table.integer("activity_id").unsigned().notNullable()
      .references("id").inTable("order_status_history").onDelete("CASCADE");
    
    table.string("notification_type", 50).notNullable()
      .comment("Type of notification: 'status_change', 'update', 'comment', etc.");
    
    table.string("title", 255).nullable();
    table.text("description").nullable();
    
    table.boolean("is_read").defaultTo(false);
    table.timestamp("read_at").nullable();
    
    table.timestamp("created_at").defaultTo(knex.fn.now());
    
    // Prevent duplicate notifications for same user and activity
    table.unique(["user_id", "activity_id"]);
  });

  // Create indexes for better query performance
  await knex.schema.raw(`
    CREATE INDEX idx_notifications_user_unread 
    ON notifications(user_id, is_read, created_at DESC)
  `);
  
  await knex.schema.raw(`
    CREATE INDEX idx_notifications_user_created 
    ON notifications(user_id, created_at DESC)
  `);
  
  await knex.schema.raw(`
    CREATE INDEX idx_notifications_order 
    ON notifications(order_id, created_at DESC)
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // Drop indexes first
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_notifications_order`);
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_notifications_user_created`);
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_notifications_user_unread`);
  
  // Drop table
  await knex.schema.dropTableIfExists("notifications");
};

