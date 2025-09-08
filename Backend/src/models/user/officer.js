const db = require("../../../db");

const officer = {
  // Get all officers (with categories included)
  getAllOfficersByRole: async (user) => {
    // Base officer query
    const baseQuery = db("officers")
      .leftJoin("users", "officers.user_id", "users.id")
      .leftJoin("roles", "users.role_id", "roles.id")
      .leftJoin("bank_branch", "officers.branch_id", "bank_branch.id")
      .leftJoin("bank", "bank_branch.bank_id", "bank.id")
      .leftJoin(
        "users as created_user",
        "officers.created_by",
        "created_user.id"
      )
      .leftJoin(
        "users as updated_user",
        "officers.updated_by",
        "updated_user.id"
      )
      .select(
        "officers.id",
        "officers.user_id",
        "officers.branch_id",
        "users.name as name",
        "users.email as email",
        "users.mobile as mobile",
        "roles.name as role_name",
        "officers.is_active",
        "officers.created_at",
        "created_user.name as created_by",
        "officers.updated_at",
        "updated_user.name as updated_by",
        "bank.id as bank_id",
        "bank.name as bank_name",
        "bank_branch.id as branch_id",
        "bank_branch.name as branch_name"
      )
      .whereNull("officers.deleted_at")
      .where("officers.is_active", true);

    // Role-based filters
    if (user.role_name === "Bank Authority") {
      baseQuery.andWhere(function () {
        this.where("officers.created_by", user.id).orWhere(
          "officers.user_id",
          user.id
        );
      });
    } else if (user.role_name === "Bank Officer") {
      baseQuery.andWhere("officers.user_id", user.id);
    }

    const officers = await baseQuery;

    // Guard clause to avoid fetching ALL categories
    const officerIds = officers.map((o) => o.id);
    if (!officerIds.length) {
      return officers.map((o) => ({
        ...o,
        departments: [],
      }));
    }
    // Fetch categories only for found officers
    const categories = await db("officer_categories")
      .leftJoin("category", "officer_categories.category_id", "category.id")
      .select("officer_categories.officer_id", "category.id", "category.name")
      .whereIn("officer_categories.officer_id", officerIds)
      .whereNull("officer_categories.deleted_at");

    // Map categories to their officers
    const categoryMap = {};
    for (const c of categories) {
      if (!categoryMap[c.officer_id]) categoryMap[c.officer_id] = [];
      categoryMap[c.officer_id].push({ id: c.id, name: c.name });
    }

    // Attach categories to each officer
    return officers.map((officer) => ({
      ...officer,
      departments: categoryMap[officer.id] || [],
    }));
  },

  // Get officer by ID (with categories)
  findById: async (id) => {
    const officer = await db("officers")
      .leftJoin("users", "officers.user_id", "users.id")
      .leftJoin("bank_branch", "officers.branch_id", "bank_branch.id")
      .leftJoin("bank", "bank_branch.bank_id", "bank.id")
      .select(
        "officers.id",
        "officers.user_id",
        "officers.branch_id",
        "users.name as name",
        "users.email as email",
        "users.mobile as mobile",
        "officers.is_active",
        "officers.created_at",
        "officers.updated_at",
        "bank.id as bank_id",
        "bank.name as bank_name",
        "bank_branch.id as branch_id",
        "bank_branch.name as branch_name"
      )
      .whereNull("officers.deleted_at")
      .where("officers.id", id)
      .first();

    if (!officer) return null;

    const departments = await db("officer_categories")
      .leftJoin("category", "officer_categories.category_id", "category.id")
      .select("category.id", "category.name")
      .where("officer_categories.officer_id", id)
      .whereNull("officer_categories.deleted_at");

    return { ...officer, departments };
  },

  // Create officer
  createOfficer: async (data) => {
    const [officer] = await db("officers").insert(data).returning("*");
    return officer;
  },
  // Create officer categories
  createOfficerCategories: async (data, trx = db) => {
    // Guard clause
    if (!Array.isArray(data) || data.length === 0) return;
    return await trx("officer_categories").insert(data).returning("*");
  },

  // Update officer
  updateOfficer: async (id, data) => {
    const [officer] = await db("officers")
      .where({ id })
      .update(data)
      .returning("*");
    return officer;
  },
  // Update officer categories

  replaceOfficerCategories: async (officer_id, newCategoryData, trx = db) => {
    // Guard clause
    if (!Array.isArray(newCategoryData)) return;
    await trx("officer_categories").where({ officer_id }).del();
    return await trx("officer_categories")
      .insert(newCategoryData)
      .returning("*");
  },

  // Soft delete officer + its categories
  softDelete: async (id, userId) => {
    await db("officers").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    });

    await db("officer_categories").where({ officer_id: id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    });
  },
};

module.exports = officer;
