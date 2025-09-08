/**
 * Seed data for order_status_master table
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('order_status_master').del();

  // Inserts seed entries
  await knex('order_status_master').insert([
    { name: 'Order Initiated', description: 'Order has been created' },
    { name: 'Manager Assigned', description: 'Manager allocated to the order' },
    { name: 'Verification In Progress', description: 'Field verification is underway' },
    { name: 'Assets Submitted', description: 'Photos have been uploaded' },
    { name: 'Assets Approved', description: 'Photos have been verified' },
    { name: 'Documentation In Progress', description: 'Collage & report are being prepared' },
    { name: 'Under Review', description: 'Collage & report completed, awaiting review' },
    { name: 'Revisions Required', description: 'Changes have been requested' },
    { name: 'Order Finalized', description: 'Order is complete and authorized' }
  ]);
};