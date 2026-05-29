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
    const bankIdRaw = req.query.bank_id;
    let bankId = null;
    if (bankIdRaw !== undefined && bankIdRaw !== null && bankIdRaw !== "") {
      const parsed = parseInt(bankIdRaw, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        bankId = parsed;
      }
    }

    const officers = await Officer.getAllOfficersByRole(req.user, { bankId });
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
      linked_authorities = [],
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

    // Check if email or mobile already exists for an active user (deleted users don't block)
    const existing = await User.findByEmailAndMobile(email, mobile);
    if (existing) {
      throw new ConflictError("Email or mobile already exists.");
    }
    // If a deleted user has this email, free it so we can use it
    const trimmedEmail = String(email).trim().toLowerCase();
    const existingAnyByEmail = await User.findByEmailIncludingDeleted(trimmedEmail);
    if (existingAnyByEmail && existingAnyByEmail.deleted_at) {
      await User.update(existingAnyByEmail.id, {
        email: `deleted_${existingAnyByEmail.id}_${Date.now()}@deleted.local`,
      });
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

    await Officer.createLinkedAuthorities(
      user.id,
      linked_authorities,
      req.user?.id,
      trx
    );

    // Commit the transaction
    await trx.commit();

    res.locals.newRecordId = user.id;

    // Get extra data outside transaction
    const categoryIds = officer_categories.map((cat) => cat.category_id);
    const categories = await Category.findManyByIds(categoryIds);
    const linkedAuthorityUserIds = linked_authorities
      .map((id) => (typeof id === "number" ? id : parseInt(id, 10)))
      .filter((id) => !Number.isNaN(id) && id !== user.id);
    const linkedAuthorityUsers =
      linkedAuthorityUserIds.length > 0
        ? await Promise.all(linkedAuthorityUserIds.map((uid) => User.findById(uid)))
        : [];
    const linkedAuthorityList = linkedAuthorityUsers
      .filter(Boolean)
      .map((u) => ({ id: u.id, name: u.name }));
    const creator = await User.findById(user.created_by);
    const role = await Role.findById(user.role_id);

    const enriched = {
      ...officer,
      name,
      email,
      mobile,
      created_by: creator?.name || null,
      branch_name: branch?.name || null,
      role_name: role?.name || null,
      departments: categories.map((cat) => ({ id: cat.id, name: cat.name })),
      linked_authorities: linkedAuthorityList,
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
      created_by,
    } = req.body;
    const linked_authorities = Array.isArray(req.body.linked_authorities)
      ? req.body.linked_authorities
      : [];

    // Fetch officer record to get user_id
    const officer = await Officer.findById(officerId);
    if (!officer) throw new NotFoundError("Officer not found");

    // Fetch user data
    const user = await User.findById(officer.user_id);
    if (!user) throw new NotFoundError("User not found");

    // Check if email is used by another active user (deleted users don't block)
    if (email) {
      const trimmedEmail = email.trim().toLowerCase();
      const existing = await User.findByEmail(trimmedEmail);
      if (existing && existing.id !== user.id) {
        throw new ConflictError("Email already in use");
      }
      // If a deleted user has this email, free it so this update can use it
      const existingAny = await User.findByEmailIncludingDeleted(trimmedEmail);
      if (
        existingAny &&
        existingAny.deleted_at &&
        existingAny.id !== user.id
      ) {
        await User.update(existingAny.id, {
          email: `deleted_${existingAny.id}_${Date.now()}@deleted.local`,
        });
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

    // created_by must be a valid user id (integer); ignore if missing, null, or not a number
    const createdById =
      created_by !== undefined && created_by !== null
        ? parseInt(created_by, 10)
        : null;
    const hasValidCreatedBy =
      createdById !== null && !Number.isNaN(createdById);

    // Update user
    const userUpdatePayload = {
      name,
      email,
      mobile,
      role_id,
      city_id,
    };
    if (hasValidCreatedBy) {
      userUpdatePayload.created_by = createdById;
    }

    // If password is provided, hash and update
    if (password) {
      userUpdatePayload.password = await bcrypt.hash(password, 10);
    }

    const [updatedUser] = await User.update(user.id, userUpdatePayload, trx);

    // Update officer
    const officerUpdatePayload = {
      branch_id,
      updated_by: req.user?.id,
      updated_at: new Date(),
    };
    if (hasValidCreatedBy) {
      officerUpdatePayload.created_by = createdById;
    }
    const updatedOfficer = await Officer.updateOfficer(
      officerId,
      officerUpdatePayload,
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

    await Officer.replaceLinkedAuthorities(
      officer.user_id,
      linked_authorities,
      req.user?.id,
      trx
    );

    await trx.commit();

    // Enrich response - Use updated data
    const role = await Role.findById(updatedUser.role_id);
    const editor = await User.findById(updatedOfficer.updated_by);
    const categoryIds = officer_categories.map((cat) => cat.category_id);
    const categories = await Category.findManyByIds(categoryIds);

    // created_by: use new creator name if payload had valid created_by, else existing, else null
    let createdByDisplay = user.created_by || null;
    if (hasValidCreatedBy) {
      const creatorUser = await User.findById(createdById);
      createdByDisplay = creatorUser ? creatorUser.name : String(createdById);
    }

    const linkedAuthorityUserIds = linked_authorities
      .map((id) => (typeof id === "number" ? id : parseInt(id, 10)))
      .filter((id) => !Number.isNaN(id) && id !== officer.user_id);
    const linkedAuthorityUsers =
      linkedAuthorityUserIds.length > 0
        ? await Promise.all(linkedAuthorityUserIds.map((uid) => User.findById(uid)))
        : [];
    const linkedAuthorityList = linkedAuthorityUsers
      .filter(Boolean)
      .map((u) => ({ id: u.id, name: u.name }));

    const enriched = {
      ...updatedOfficer,
      name: updatedUser.name,
      email: updatedUser.email,
      mobile: updatedUser.mobile,
      created_by: createdByDisplay,
      updated_by: editor.name,
      branch_name: branch?.name || null,
      role_name: role?.name || null,
      departments: categories.map((cat) => ({ id: cat.id, name: cat.name })),
      linked_authorities: linkedAuthorityList,
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
