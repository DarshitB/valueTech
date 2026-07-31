const db = require("../../../db");
const { PROTECTED_ROLE } = require("../../constants/protectedRoles");

const user = {
  // Get all non-officer users with their departments (from user_categories)
  findAll: async () => {
    const users = await db("users")
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
        "users.day_start",
        "users.day_end",
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
      .whereNotIn("roles.name", ["BANK AUTHORITY", "BANK OFFICER", "CREDIT HEAD"])
      .where("roles.name", "!=", PROTECTED_ROLE); // Get all users excluding protected roles and soft-deleted ones

    if (!users.length) {
      return users.map((u) => ({ ...u, departments: [] }));
    }

    const userIds = users.map((u) => u.id);

    const departmentRows = await db("user_categories")
      .leftJoin("category", "user_categories.category_id", "category.id")
      .select(
        "user_categories.user_id",
        "category.id as category_id",
        "category.name as category_name"
      )
      .whereIn("user_categories.user_id", userIds)
      .whereNull("user_categories.deleted_at");

    const deptMap = {};
    for (const row of departmentRows) {
      if (!deptMap[row.user_id]) deptMap[row.user_id] = [];
      deptMap[row.user_id].push({
        id: row.category_id,
        name: row.category_name,
      });
    }

    return users.map((u) => ({
      ...u,
      departments: deptMap[u.id] || [],
    }));
  },

  // Get single user by ID with departments (from user_categories)
  findById: async (id) => {
    const baseUser = await db("users")
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
        "users.day_start",
        "users.day_end",
        "users.otp",
        "users.otp_expiry",
        "users.otp_attempts",
        "users.otp_locked_until",
        "users.active_token",
        "users.deleted_at",
        "users.created_at",
        "created_user.name as created_by",
        "users.updated_at",
        "updated_user.name as updated_by",
        "cities.state_id as state_id",
        "states.name as state_name"
      )
      .where("users.id", id)
      .whereNull("users.deleted_at")
      .first(); // Get single user by ID (excluding soft-deleted)

    if (!baseUser) return null;

    const departmentRows = await db("user_categories")
      .leftJoin("category", "user_categories.category_id", "category.id")
      .select("category.id", "category.name")
      .where("user_categories.user_id", id)
      .whereNull("user_categories.deleted_at");

    const departments = departmentRows.map((row) => ({
      id: row.id,
      name: row.name,
    }));

    return {
      ...baseUser,
      departments,
    };
  },

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
      .first(), // find by Email to prevent duplicate Email (active users only)

  findByEmailIncludingDeleted: (email) =>
    db("users")
      .select("id", "name", "email", "deleted_at")
      .where("email", email)
      .first(),

  findByEmailOrMobile: (input) =>
    db("users")
      .select("*")
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

  findManyByIds: (ids) =>
    db("users")
      .select("id", "name", "email", "mobile", "role_id")
      .whereIn("id", ids)
      .whereNull("deleted_at"), // Find multiple users by IDs

  create: (data) => db("users").insert(data).returning("*"), // Create a new user

  update: (id, data) => db("users").where({ id }).update(data).returning("*"), // Update a user by ID

  softDelete: (id, userId) =>
    db("users").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }), // Soft delete a user by ID
};
module.exports = user;