/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  // Deletes ALL existing entries
 /*  await knex("roles").del(); */

  // Inserts seed entries
  await knex("roles").insert([
    { name: "SUPER ADMIN" },
    { name: "ADMIN" },
    { name: "MANAGER" },
    { name: "BANK AUTHORITY" },
    { name: "BANK OFFICER" },
  ]);
};