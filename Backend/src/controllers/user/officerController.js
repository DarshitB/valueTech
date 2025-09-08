const Officer = require("../../models/user/officer");
const User = require("../../models/user/user");
const Role = require("../../models/permissions/role");
const Branch = require("../../models/bank/bank_branch");
const Category = require("../../models/category/category");

const db = require("../../../db");
const bcrypt = require("bcrypt");
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

// Get All Officers based on user role
exports.getAll = async (req, res, next) => {
  try {
    const officers = await Officer.getAllOfficersByRole(req.user);
    res.json(officers);
  } catch (err) {
    next(err);
  }
};

// Get Officer by ID
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const officer = await Officer.findById(id);
    if (!officer) throw new NotFoundError("Officer not found");
    res.json(officer);
  } catch (err) {
    next(err);
  }
};

// Create Officer (with validation and user creation)
exports.create = async (req, res, next) => {
  const trx = await db.transaction();
  try {
    const {
      name,
      email,
      mobile,
      password,
      role_id,
      branch_id,
      department = [],
    } = req.body;

    if (
      !name ||
      !email ||
      !mobile ||
      !role_id ||
      !department.length ||
      !password ||
      !branch_id
    ) {
      throw new BadRequestError(
        "Name, email, contact number, role_id, department, password, and branch_id are required."
      );
    }

    // Check if email or mobile already exists in users table
    const existing = await User.findByEmailAndMobile(email, mobile);
    if (existing) {
      throw new ConflictError("Email or mobile already exists.");
    }

    // Get city id from branch selected
    const branch = await Branch.findById(branch_id);
    if (!branch) throw new BadRequestError("Invalid Branch");
    const city_id = branch.city_id;

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Create user record
    const [user] = await User.create(
      {
        name,
        email,
        mobile,
        password: hash,
        role_id,
        city_id: city_id || null,
        created_by: req.user?.id,
        created_at: new Date(),
      },
      trx
    );

    // Create officer record
    const officer = await Officer.createOfficer(
      {
        user_id: user.id,
        branch_id,
        created_by: req.user?.id,
        created_at: new Date(),
      },
      trx
    );

    // Create officer categories (bulk insert)
    const categoriesToInsert = department.map((catId) => ({
      officer_id: officer.id,
      category_id: catId,
      created_by: req.user?.id,
      created_at: new Date(),
    }));

    const officer_categories = await Officer.createOfficerCategories(
      categoriesToInsert,
      trx
    );

    // Commit the transaction
    await trx.commit();

    res.locals.newRecordId = user.id;

    // Get extra data outside transaction
    const categoryIds = officer_categories.map((cat) => cat.category_id);
    const categories = await Category.findManyByIds(categoryIds);
    // Enrich response with creator and role names
    const creator = await User.findById(user.created_by);
    const role = await Role.findById(user.role_id);

    // Return enriched, sanitized data
    const enriched = {
      ...officer,
      name,
      email,
      mobile,
      created_by: creator?.name || null,
      branch_name: branch?.name || null,
      role_name: role?.name || null,
      departments: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
      })),
    };

    res.status(201).json(enriched);
  } catch (err) {
    await trx.rollback(); // Rollback transaction if any error
    if (err.code === "23505") {
      return next(new ConflictError("Email already exists"));
    }
    next(err);
  }
};

// Update Officer (with validation and related updates)
exports.update = async (req, res, next) => {
  const trx = await db.transaction();
  try {
    const officerId = req.params.id;
    const {
      name,
      email,
      mobile,
      password, // optional on update
      role_id,
      branch_id,
      department = [],
    } = req.body;

    // Fetch officer record to get user_id
    const officer = await Officer.findById(officerId);
    if (!officer) throw new NotFoundError("Officer not found");

    // Fetch user data
    const user = await User.findById(officer.user_id);
    if (!user) throw new NotFoundError("User not found");

    // Check if email is used by another user
    if (email) {
      const trimmedEmail = email.trim().toLowerCase();
      const existing = await User.findByEmail(trimmedEmail);
      if (existing && existing.id !== user.id) {
        throw new ConflictError("Email already in use");
      }
    }
    // Check if mobile is used by another user
    if (mobile) {
      const trimmedMobile = mobile.trim();
      const existingMobile = await User.findByMobile(trimmedMobile);
      if (existingMobile && existingMobile.id !== user.id) {
        throw new ConflictError("Mobile already in use");
      }
    }

    // Get city id from selected branch
    const branch = await Branch.findById(branch_id || officer.branch_id);
    if (!branch) throw new BadRequestError("Invalid Branch");
    const city_id = branch.city_id;

    // Update user
    const userUpdatePayload = {
      name,
      email,
      mobile,
      role_id,
      city_id,
    };

    // If password is provided, hash and update
    if (password) {
      userUpdatePayload.password = await bcrypt.hash(password, 10);
    }

    const [updatedUser] = await User.update(user.id, userUpdatePayload, trx);

    // Update officer
    const updatedOfficer = await Officer.updateOfficer(
      officerId,
      {
        branch_id,
        updated_by: req.user?.id,
        updated_at: new Date(),
      },
      trx
    );

    // Recreate officer_categories
    const categoriesToInsert = department.map((catId) => ({
      officer_id: officerId,
      category_id: catId,
      created_by: req.user?.id,
      created_at: new Date(),
    }));

    const officer_categories = await Officer.replaceOfficerCategories(
      officerId,
      categoriesToInsert,
      trx
    );

    await trx.commit();

    // Enrich response - Use updated data
    const role = await Role.findById(updatedUser.role_id);
    const editor = await User.findById(updatedOfficer.updated_by);
    const categoryIds = officer_categories.map((cat) => cat.category_id);
    const categories = await Category.findManyByIds(categoryIds);

    // Use updatedOfficer and updatedUser data
    const enriched = {
      ...updatedOfficer, // Use updated officer data instead of old officer data
      name: updatedUser.name,      // Updated name
      email: updatedUser.email,    // Updated email  
      mobile: updatedUser.mobile,  // Updated mobile
      created_by: user.created_by || null,
      updated_by: editor.name,
      branch_name: branch?.name || null,
      role_name: role?.name || null,
      departments: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
      })),
    };

    res.status(200).json(enriched);
  } catch (err) {
    await trx.rollback();
    if (err.code === "23505") {
      return next(new ConflictError("Email already exists"));
    }
    /* console.log(err); */
    next(err);
  }
};

// 🗑️ Soft delete officer and user
exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;

    const officer = await Officer.findById(id);
    if (!officer) throw new NotFoundError("Officer not found");

    await Officer.softDelete(id, req.user.id);
    await User.softDelete(officer.user_id, req.user.id);

    res.status(204).json({ message: "Officer deleted successfully." });
  } catch (err) {
    next(err);
  }
};
