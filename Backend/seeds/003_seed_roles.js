/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex("roles").del();

  // Inserts seed entries
  await knex("roles").insert([
    { name: "Super Admin" },
    { name: "Admin" },
    { name: "Manager" },
    { name: "Bank Authority" },
    { name: "Bank Officer" },
  ]);
};
