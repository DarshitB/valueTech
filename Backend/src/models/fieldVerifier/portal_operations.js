const db = require("../../../db");

const portal_operations = {
  // Get all active field verifiers (not soft-deleted)
  findAll: () =>
    db("field_verifiers")
      .leftJoin(
        "users as created_user",
        "field_verifiers.created_by",
        "created_user.id"
      )
      .leftJoin(
        "users as updated_user",
        "field_verifiers.updated_by",
        "updated_user.id"
      )
      .leftJoin("cities", "field_verifiers.city_id", "cities.id")
      .select(
        "field_verifiers.id",
        "field_verifiers.name",
        "field_verifiers.username",
        "field_verifiers.mobile",
        "field_verifiers.city_id",
        "cities.name as city_name",
        "field_verifiers.upi_id",
        "field_verifiers.is_active",
        "field_verifiers.created_at",
        "created_user.name as created_by",
        "field_verifiers.updated_at",
        "updated_user.name as updated_by"
      )
      .whereNull("field_verifiers.deleted_at"),

  // Get a single field verifier by ID
  findById: (id) =>
    db("field_verifiers")
      .leftJoin(
        "users as created_user",
        "field_verifiers.created_by",
        "created_user.id"
      )
      .leftJoin(
        "users as updated_user",
        "field_verifiers.updated_by",
        "updated_user.id"
      )
      .leftJoin("cities", "field_verifiers.city_id", "cities.id")
      .select(
        "field_verifiers.id",
        "field_verifiers.name",
        "field_verifiers.username",
        "field_verifiers.mobile",
        "field_verifiers.city_id",
        "cities.name as city_name",
        "field_verifiers.upi_id",
        "field_verifiers.is_active",
        "field_verifiers.created_at",
        "created_user.name as created_by",
        "field_verifiers.updated_at",
        "updated_user.name as updated_by"
      )
      .where("field_verifiers.id", id)
      .whereNull("field_verifiers.deleted_at")
      .first(),

  // Check for duplicate username (if any)
  findByUsername: (username) =>
    db("field_verifiers")
      .select("id", "username")
      .where("username", username)
      .whereNull("deleted_at")
      .first(),

  // Check for duplicate mobile
  findByMobile: (mobile) =>
    db("field_verifiers")
      .select("id", "mobile")
      .where("mobile", mobile)
      .whereNull("deleted_at")
      .first(),

  // Create a new field verifier
  create: (data) => db("field_verifiers").insert(data).returning("*"),

  // Update a field verifier by ID
  update: (id, data) =>
    db("field_verifiers").where({ id }).update(data).returning("*"),

  // Toggle is_active field
  toggleActiveStatus: async (id) =>
    db("field_verifiers")
      .where({ id })
      .whereNull("deleted_at")
      .update({
        is_active: db.raw("NOT is_active"),
        updated_at: new Date(),
      })
      .returning("*"),

  // Soft delete a verifier by ID
  softDelete: (id, userId) =>
    db("field_verifiers").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }),

  // Get all login records
  findAllLogins: () =>
    db("field_verifier_logins")
      .leftJoin(
        "field_verifiers",
        "field_verifier_logins.field_verifier_id",
        "field_verifiers.id"
      )
      .leftJoin(
        "users as deleted_user",
        "field_verifier_logins.deleted_by",
        "deleted_user.id"
      )
      .select(
        "field_verifier_logins.id",
        "field_verifier_logins.token",
        "field_verifier_logins.login_at",
        "field_verifier_logins.expires_at",
        "field_verifiers.name as verifier_name",
        "field_verifiers.mobile as verifier_mobile",
        "field_verifier_logins.ip_address",
        "field_verifier_logins.device_info",
        "field_verifier_logins.deleted_at",
        "deleted_user.name as deleted_by"
      )
      .whereNull("field_verifier_logins.deleted_at"),

  // Get a single login record by ID
  findLoginById: (id) =>
    db("field_verifier_logins")
      .leftJoin(
        "field_verifiers",
        "field_verifier_logins.field_verifier_id",
        "field_verifiers.id"
      )
      .select(
        "field_verifier_logins.id",
        "field_verifier_logins.token",
        "field_verifier_logins.login_at",
        "field_verifier_logins.expires_at",
        "field_verifiers.name as verifier_name"
      )
      .where("field_verifier_logins.id", id)
      .whereNull("field_verifier_logins.deleted_at")
      .first(),

  // Soft delete a login record
  softDeleteLogin: (id, userId) =>
    db("field_verifier_logins").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }),
};

module.exports = portal_operations;
