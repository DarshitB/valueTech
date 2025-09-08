const db = require("../../../db");
const { PROTECTED_ROLE } = require("../../constants/protectedRoles");

const user = {
  findAll: () =>
    db("users")
      .leftJoin("roles", "users.role_id", "roles.id")
      .leftJoin("cities", "users.city_id", "cities.id")
      .leftJoin("states", "cities.state_id", "states.id") // Join states through cities
      .leftJoin("users as created_user", "users.created_by", "created_user.id")
      .leftJoin("users as updated_user", "users.updated_by", "updated_user.id")
      .select(
        "users.id",
        "users.name",
        "users.email",
        "users.mobile",
        "users.role_id",
        "roles.name as role_name",
        "users.city_id",
        "cities.name as city_name",
        "users.otp",
        "users.otp_expiry",
        "users.created_at",
        "created_user.name as created_by",
        "users.updated_at",
        "updated_user.name as updated_by",
        "cities.state_id as state_id",
        "states.name as state_name"
      )
      .whereNull("users.deleted_at")
      .whereNotIn("roles.name", ["Bank Authority", "Bank Officer"])
      .where("roles.name", "!=", PROTECTED_ROLE), // Get all users excluding protected roles and soft-deleted ones

  findById: (id) =>
    db("users")
      .leftJoin("roles", "users.role_id", "roles.id")
      .leftJoin("cities", "users.city_id", "cities.id")
      .leftJoin("states", "cities.state_id", "states.id") // Join states through cities
      .leftJoin("users as created_user", "users.created_by", "created_user.id")
      .leftJoin("users as updated_user", "users.updated_by", "updated_user.id")
      .select(
        "users.id",
        "users.name",
        "users.email",
        "users.mobile",
        "users.role_id",
        "roles.name as role_name",
        "users.city_id",
        "cities.name as city_name",
        "users.otp",
        "users.otp_expiry",
        "users.created_at",
        "created_user.name as created_by",
        "users.updated_at",
        "updated_user.name as updated_by",
        "cities.state_id as state_id",
        "states.name as state_name"
      )
      .where("users.id", id)
      .whereNull("users.deleted_at")
      .first(), // Get single user by ID (excluding soft-deleted)

  findByMobile: (mobile) =>
    db("users")
      .leftJoin("roles", "users.role_id", "roles.id")
      .leftJoin("cities", "users.city_id", "cities.id")
      .leftJoin("states", "cities.state_id", "states.id")
      .leftJoin("users as created_user", "users.created_by", "created_user.id")
      .leftJoin("users as updated_user", "users.updated_by", "updated_user.id")
      .select(
        "users.id",
        "users.name",
        "users.email",
        "users.mobile",
        "users.role_id",
        "roles.name as role_name",
        "users.city_id",
        "cities.name as city_name",
        "users.otp",
        "users.otp_expiry",
        "users.created_at",
        "created_user.name as created_by",
        "users.updated_at",
        "updated_user.name as updated_by",
        "cities.state_id as state_id",
        "states.name as state_name"
      )
      .where("users.mobile", mobile)
      .whereNull("users.deleted_at")
      .first(), // find by mobile number to prevent duplicate mobile number

  findByEmail: (email) =>
    db("users")
      .select("id", "name", "email")
      .where("users.email", email)
      .whereNull("deleted_at")
      .first(), // find by Email to prevent duplicate Email to created user

  findByEmailOrMobile: (input) =>
    db("users")
      .where(function () {
        this.where("email", input).orWhere("mobile", input);
      })
      .whereNull("deleted_at")
      .first(),

  findByEmailAndMobile: (email, mobile) =>
    db("users")
      .where(function () {
        this.where("email", email).orWhere("mobile", mobile);
      })
      .whereNull("deleted_at")
      .first(),

  findByUsername: (email) =>
    db("users").where({ email }).whereNull("deleted_at").first(), // Find user by email that is not soft-deleted

  create: (data) => db("users").insert(data).returning("*"), // Create a new user

  update: (id, data) => db("users").where({ id }).update(data).returning("*"), // Update a user by ID

  softDelete: (id, userId) =>
    db("users").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }), // Soft delete a user by ID
};
module.exports = user;
