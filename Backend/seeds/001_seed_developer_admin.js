/* seed should only firsttie creating database it will throught error if databse created and have some data to it */
const bcrypt = require("bcrypt");

exports.seed = async function (knex) {
  await knex("users").del();
  await knex("roles").del();

  const [{ id: adminRoleId }] = await knex("roles")
    .insert({ name: "developer_admin" })
    .returning("id");

  const hash = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD, 10);

  await knex("users").insert({
    name: "Owner",
    email: process.env.DEFAULT_ADMIN_USERNAME,
    password: hash,
    role_id: adminRoleId,
  });
};
