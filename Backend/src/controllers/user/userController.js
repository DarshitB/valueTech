const User = require("../../models/user/user");
const Role = require("../../models/permissions/role");
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
    const { email, password, role_id, name, mobile, city_id } = req.body;

    if (!email || !password || !role_id || !name) {
      throw new BadRequestError(
        "Name, email, password, and role_id are required"
      );
    }

    const hash = await bcrypt.hash(password, 10);

    const [user] = await User.create({
      name,
      email,
      mobile,
      password: hash,
      role_id,
      city_id: city_id || null,
      created_by: req.user?.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = user.id;

    // Now fetch the user name using the created_by id
    const creator = await User.findById(user.created_by);

    // Now fetch the user name using the role_id id
    const role = await Role.findById(user.role_id);

    // Add user's name to the state object for response
    const enrichedUser = {
      ...user,
      created_by: creator.name,
      role_name: role.name,
    };

    res.status(201).json(enrichedUser);
  } catch (err) {
    if (err.code === "23505") {
      return next(new ConflictError("email already exists"));
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, password, role_id, mobile, city_id } = req.body;

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

    // Add user's name to the state object for response
    const enrichedUsers = {
      ...updated,
      created_by: creator.name,
      updated_by: editor.name,
      role_name: role.name,
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
