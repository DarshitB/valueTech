const User = require("../../models/user/user");
const Role = require("../../models/permissions/role");
const Category = require("../../models/category/category");
const db = require("../../../db");
const bcrypt = require("bcrypt");
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

exports.getAll = async (req, res, next) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (err) {
    next(err);
  }
};

exports.getManagers = async (req, res, next) => {
  try {
    const managers = await User.findManagers();
    res.json(managers);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) throw new NotFoundError("User not found");
    res.json(user);
  } catch (err) {
    next(err);
  }
};

exports.findByMobile = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile || mobile.trim() === "") {
      throw new BadRequestError("Mobile number is required.");
    }

    const user = await User.findByMobile(mobile);

    if (user) {
      return res.status(200).json({ exists: true });
    } else {
      return res.status(200).json({ exists: false });
    }
  } catch (err) {
    console.error("Error in findByMobile:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

exports.checkEmailExistence = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || email.trim() === "") {
      throw new BadRequestError("Email is required.");
    }

    const user = await User.findByEmail(email);

    if (user) {
      return res.status(200).json({ exists: true });
    } else {
      return res.status(200).json({ exists: false });
    }
  } catch (err) {
    console.error("Error in findByEmail:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

exports.create = async (req, res, next) => {
  try {
    const {
      email,
      password,
      role_id,
      name,
      mobile,
      city_id,
      department = [],
      day_start = null,
      day_end = null,
    } = req.body;

    if (!email || !password || !role_id || !name) {
      throw new BadRequestError(
        "Name, email, password, and role_id are required"
      );
    }

    // Only treat as duplicate if an active (non-deleted) user has this email
    const activeWithEmail = await User.findByEmail(email);
    if (activeWithEmail) {
      return next(new ConflictError("email already exists"));
    }

    const hash = await bcrypt.hash(password, 10);

    const [user] = await User.create({
      name,
      email,
      mobile,
      password: hash,
      role_id,
      city_id: city_id || null,
      day_start: day_start || null,
      day_end: day_end || null,
      created_by: req.user?.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = user.id;

    const creator = await User.findById(user.created_by);
    const role = await Role.findById(user.role_id);

    // Create user_categories (departments) for non-officer roles
    let departments = [];
    const roleNameUpper = (role?.name || "").toUpperCase();
    const isOfficerRole =
      roleNameUpper.includes("BANK OFFICER") ||
      roleNameUpper.includes("BANK AUTHORITY");

    if (!isOfficerRole && Array.isArray(department) && department.length > 0) {
      const validCategoryIds = department
        .map((id) => (typeof id === "number" ? id : parseInt(id, 10)))
        .filter((id) => !Number.isNaN(id));

      if (validCategoryIds.length > 0) {
        const rows = validCategoryIds.map((catId) => ({
          user_id: user.id,
          category_id: catId,
          created_by: req.user?.id || null,
          created_at: new Date(),
        }));

        await db("user_categories").insert(rows);

        const cats = await Category.findManyByIds(validCategoryIds);
        departments = cats.map((c) => ({ id: c.id, name: c.name }));
      }
    }

    const enrichedUser = {
      ...user,
      created_by: creator?.name,
      role_name: role?.name,
      departments,
    };

    res.status(201).json(enrichedUser);
  } catch (err) {
    if (err.code === "23505") {
      // Unique violation: email exists. If it's a deleted user, reactivate instead.
      const existing = await User.findByEmailIncludingDeleted(req.body.email);
      if (existing && existing.deleted_at) {
        try {
          const hash = await bcrypt.hash(req.body.password, 10);
          const [reactivated] = await User.update(existing.id, {
            name: req.body.name,
            email: req.body.email,
            mobile: req.body.mobile,
            password: hash,
            role_id: req.body.role_id,
            city_id: req.body.city_id ?? null,
            day_start: req.body.day_start || null,
            day_end: req.body.day_end || null,
            deleted_at: null,
            deleted_by: null,
            updated_at: new Date(),
            updated_by: req.user?.id,
          });
          if (reactivated) {
            const creator = await User.findById(reactivated.created_by);
            const role = await Role.findById(reactivated.role_id);
            res.locals.newRecordId = reactivated.id;
            return res.status(201).json({
              ...reactivated,
              created_by: creator?.name,
              role_name: role?.name,
            });
          }
        } catch (reactivateErr) {
          return next(reactivateErr);
        }
      }
      return next(new ConflictError("email already exists"));
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      password,
      role_id,
      mobile,
      city_id,
      department,
      day_start,
      day_end,
    } = req.body;

    const existing = await User.findById(id);
    if (!existing) throw new NotFoundError("User not found");

    const updatedData = {
      name,
      email,
      role_id,
      mobile,
      city_id,
      updated_by: req.user?.id,
      updated_at: new Date(),
    };

    if (day_start !== undefined) {
      updatedData.day_start = day_start || null;
    }
    if (day_end !== undefined) {
      updatedData.day_end = day_end || null;
    }

    if (password) {
      updatedData.password = await bcrypt.hash(password, 10);
    }

    const [updated] = await User.update(id, updatedData);

    // Now fetch the user name using the created_by id
    const creator = await User.findById(updated.created_by);
    // Now fetch the user name using the updated_by id
    const editor = await User.findById(updated.updated_by);
    // Now fetch the user name using the role_id id
    const role = await Role.findById(updated.role_id);

    // Maintain user_categories (departments) for non-officer roles
    const roleNameUpper = (role?.name || "").toUpperCase();
    const isOfficerRole =
      roleNameUpper.includes("BANK OFFICER") ||
      roleNameUpper.includes("BANK AUTHORITY");

    if (isOfficerRole) {
      // Ensure officer roles don't carry user_categories
      await db("user_categories").where({ user_id: updated.id }).del();
    } else if (department !== undefined) {
      // Replace departments only when department payload is provided
      await db("user_categories").where({ user_id: updated.id }).del();

      if (Array.isArray(department) && department.length > 0) {
        const validCategoryIds = department
          .map((cid) => (typeof cid === "number" ? cid : parseInt(cid, 10)))
          .filter((cid) => !Number.isNaN(cid));

        if (validCategoryIds.length > 0) {
          const rows = validCategoryIds.map((catId) => ({
            user_id: updated.id,
            category_id: catId,
            created_by: req.user?.id || null,
            created_at: new Date(),
          }));
          await db("user_categories").insert(rows);
        }
      }
    }

    // Fetch current departments for response
    const departmentRows = await db("user_categories")
      .leftJoin("category", "user_categories.category_id", "category.id")
      .select("category.id", "category.name")
      .where("user_categories.user_id", updated.id)
      .whereNull("user_categories.deleted_at");

    const departments = departmentRows.map((row) => ({
      id: row.id,
      name: row.name,
    }));

    // Add user's name to the state object for response
    const enrichedUsers = {
      ...updated,
      created_by: creator.name,
      updated_by: editor.name,
      role_name: role.name,
      departments,
    };

    /* console.log(updated); */
    res.json(enrichedUsers);
  } catch (err) {
    if (err.code === "23505") {
      return next(new ConflictError("email already exists"));
    }
    next(err);
  }
};

exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await User.findById(id);
    if (!existing) throw new NotFoundError("User not found");

    await User.softDelete(id, req.user.id);

    res.status(204).json({ message: "User Deleted successfully." });
    /* res.status(204).send(); */
  } catch (err) {
    next(err);
  }
};
