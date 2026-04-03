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
    { name: 'Telecaller Assigned', description: 'Telecaller allocated to the order, if Supervisor and Driver number are not provided' },
    { name: 'Telecaller Completed', description: 'Telecaller completed hhis task to add Supervisor and Driver number' },
    { name: 'Manager Assigned', description: 'Manager allocated to the order' },
    { name: 'Telecaller Reassign', description: 'If the field verifier requests reassign for any reason' },
    { name: 'Verification In Progress', description: 'Field verification is underway' },
    { name: 'Assets Submitted', description: 'Photos have been uploaded' },
    { name: 'Assets Approved', description: 'Photos have been verified' },
    { name: 'Documentation In Progress', description: 'Collage & report are being prepared' },
    { name: 'Under Review', description: 'Collage & report completed, awaiting review' },
    { name: 'Revisions Required', description: 'Changes have been requested' },
    { name: 'Authorised', description: 'Order reports and collages are approved by super admin' },
    { name: 'Order Finalized', description: 'Order is complete and authorized' }
  ]);
};