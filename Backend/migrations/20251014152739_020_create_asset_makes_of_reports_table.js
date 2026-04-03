/**
 * Create asset_makes_for_reports table
 * This table stores asset makes information for different order types
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('asset_makes_for_reports', function(table) {
    // Primary key
    table.increments('id').primary();
    
    // Order type field
    table.string('order_type', 100).notNullable().comment('Type of order (e.g., report_cv, report_avr, report_machinery, report_ce)');
    
    // Asset makes field
    table.text('name').notNullable();
    
    // Audit fields
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.integer('created_by').unsigned().notNullable()
      .references('id').inTable('users').onDelete('SET NULL');
    
    // Indexes for better performance
    table.index('order_type');
    table.index('created_at');
  });
};

/**
 * Drop asset_makes_for_reports table
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('asset_makes_for_reports');
};
