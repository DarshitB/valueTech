const FieldVerifier = require("../../models/fieldVerifier/portal_operations");
const User = require("../../models/user/user");
const City = require("../../models/location/city");
const bcrypt = require("bcrypt");
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

// Get all field verifiers (not soft-deleted)
exports.getAll = async (req, res, next) => {
  try {
    const verifiers = await FieldVerifier.findAll();
    res.json(verifiers);
  } catch (err) {
    next(err);
  }
};

// Get field verifier by ID
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const verifier = await FieldVerifier.findById(id);
    if (!verifier) throw new NotFoundError("Field Verifier not found");
    res.json(verifier);
  } catch (err) {
    next(err);
  }
};

// Check if mobile already exists
exports.findByMobile = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile || mobile.trim() === "") {
      throw new BadRequestError("Mobile number is required.");
    }

    const verifier = await FieldVerifier.findByMobile(mobile);

    if (verifier) {
      return res.status(200).json({ exists: true });
    } else {
      return res.status(200).json({ exists: false });
    }
  } catch (err) {
    console.error("Error in findByMobile:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// Check if username already exists
exports.checkUsernameExistence = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.trim() === "") {
      throw new BadRequestError("Username is required.");
    }

    const verifier = await FieldVerifier.findByUsername(username);

    if (verifier) {
      return res.status(200).json({ exists: true });
    } else {
      return res.status(200).json({ exists: false });
    }
  } catch (err) {
    console.error("Error in checkUsernameExistence:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// Create a new field verifier
exports.create = async (req, res, next) => {
  try {
    const {
      name,
      username,
      mobile,
      password,
      city_id,
      upi_id,
      bank_name,
      verifier_name_in_bank,
      bank_address,
      bank_account_type,
      bank_account_number,
      bank_IFSC_code,
    } = req.body;

    if (!name || !username || !mobile || !password || !city_id) {
      throw new BadRequestError(
        "Name, mobile, username, password, and city are required."
      );
    }

    // Check if username already exists
    const existingUsername = await FieldVerifier.findByUsername(username);
    if (existingUsername) {
      throw new ConflictError("username already exists.");
    }

    // Check if mobile already exists
    const existingMobile = await FieldVerifier.findByMobile(mobile);
    if (existingMobile) {
      throw new ConflictError("Mobile number already exists.");
    }

    const hash = await bcrypt.hash(password, 10);

    const [verifier] = await FieldVerifier.create({
      name,
      username,
      mobile,
      password: hash,
      city_id,
      upi_id,
      bank_name,
      verifier_name_in_bank,
      bank_address,
      bank_account_type,
      bank_account_number,
      bank_IFSC_code,
      created_by: req.user?.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = verifier.id;

    const creator = await User.findById(verifier.created_by);
    const verifierCity = await City.findById(verifier.city_id);

    // Destructure password out to avoid exposing it
    const { password: _, ...safeData } = verifier;

    const enriched = {
      ...safeData,
      city_name: verifierCity?.name || null,
      created_by: creator?.name || null,
    };

    res.status(201).json(enriched);
  } catch (err) {
    if (err.code === "23505") {
      return next(new ConflictError("Username or mobile already exists."));
    }
    next(err);
  }
};

// Update field verifier
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      username,
      mobile,
      password,
      city_id,
      upi_id,
      is_active,
      bank_name,
      verifier_name_in_bank,
      bank_address,
      bank_account_type,
      bank_account_number,
      bank_IFSC_code,
    } = req.body;

    const existing = await FieldVerifier.findById(id);
    if (!existing) throw new NotFoundError("Field Verifier not found");

    // Check if username is being changed and if the new username already exists
    if (username && username !== existing.username) {
      const usernameExists = await FieldVerifier.findByUsername(username);
      if (usernameExists && usernameExists.id !== id) {
        throw new ConflictError("username already exists.");
      }
    }

    // Check if mobile is being changed and if the new mobile already exists
    if (mobile && mobile !== existing.mobile) {
      const mobileExists = await FieldVerifier.findByMobile(mobile);
      if (mobileExists && mobileExists.id !== id) {
        throw new ConflictError("Mobile number already exists.");
      }
    }

    const updatedData = {
      name,
      username,
      mobile,
      city_id,
      upi_id,
      is_active,
      bank_name,
      verifier_name_in_bank,
      bank_address,
      bank_account_type,
      bank_account_number,
      bank_IFSC_code,
      updated_by: req.user?.id,
      updated_at: new Date(),
    };

    if (password) {
      updatedData.password = await bcrypt.hash(password, 10);
    }

    const [updated] = await FieldVerifier.update(id, updatedData);

    const creator = await User.findById(updated.created_by);
    const editor = await User.findById(updated.updated_by);
    const verifierCity = await City.findById(updated.city_id);

    // Destructure password out to avoid exposing it
    const { password: _, ...safeData } = updated;

    const enriched = {
      ...safeData,
      city_name: verifierCity?.name || null,
      created_by: creator?.name || null,
      updated_by: editor?.name || null,
    };

    res.json(enriched);
  } catch (err) {
    if (err.code === "23505") {
      return next(new ConflictError("Username or mobile already exists."));
    }
    next(err);
  }
};

// Toggle is_active field
exports.toggleActiveStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    /* console.log("it is in this"); */
    const existing = await FieldVerifier.findById(id);
    if (!existing) throw new NotFoundError("Field Verifier not found");

    const [updated] = await FieldVerifier.toggleActiveStatus(id);

    const editor = await User.findById(req.user?.id);
    const creator = await User.findById(updated.created_by);
    const verifierCity = await City.findById(updated.city_id);

    const { password: _, ...safeData } = updated;

    const enriched = {
      ...safeData,
      city_name: verifierCity?.name || null,
      created_by: creator?.name || null,
      updated_by: editor?.name || null,
    };

    res.json(enriched);
  } catch (err) {
    next(err);
  }
};

// Soft delete field verifier
exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await FieldVerifier.findById(id);
    if (!existing) throw new NotFoundError("Field Verifier not found");

    await FieldVerifier.softDelete(id, req.user.id);

    res.status(204).json({ message: "Field Verifier deleted successfully." });
  } catch (err) {
    next(err);
  }
};

// Get all login records
exports.getAllLogins = async (req, res, next) => {
  try {
    const logins = await FieldVerifier.findAllLogins();
    res.json(logins);
  } catch (err) {
    next(err);
  }
};

// Get login record by ID
exports.getLoginById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const login = await FieldVerifier.findLoginById(id);
    if (!login) throw new NotFoundError("Login record not found");

    res.json(login);
  } catch (err) {
    next(err);
  }
};

// Soft delete login record
exports.softDeleteLogin = async (req, res, next) => {
  try {
    const { id } = req.params;

    const login = await FieldVerifier.findLoginById(id);
    if (!login) throw new NotFoundError("Login record not found");

    await FieldVerifier.softDeleteLogin(id, req.user.id);

    res.status(204).json({ message: "Login deleted successfully." });
  } catch (err) {
    next(err);
  }
};
