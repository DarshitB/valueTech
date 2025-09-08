const BankBranch = require("../../models/bank/bank_branch");
const User = require("../../models/user/user");
const Bank = require("../../models/bank/bank");
const City = require("../../models/location/city");

const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

exports.getAll = async (req, res, next) => {
  try {
    const branches = await BankBranch.findAll();
    res.json(branches);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const branch = await BankBranch.findById(id);
    if (!branch) throw new NotFoundError("Bank branch not found");
    res.json(branch);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name, bank_id, city_id } = req.body;
    if (!name || !bank_id || !city_id)
      throw new BadRequestError("Name, bank_id and city_id are required");

    // Check if bank exists
    const bank = await Bank.findById(bank_id);
    if (!bank) throw new NotFoundError("Provided bank_id does not exist");

    // Check if city exists
    const city = await City.findById(city_id);
    if (!city) throw new NotFoundError("Provided city_id does not exist");

    // Check for duplicates
    const existing = await BankBranch.findAll();
    /* const match = existing.find(
      (b) =>
        b.bank_id === Number(bank_id) &&
        b.name.toLowerCase() === name.toLowerCase()
    ); // If a branch with same name under same bank exists*/
    const match = existing.find(
      (b) =>
        b.bank_id === Number(bank_id) &&
        b.city_id === Number(city_id) &&
        b.name.toLowerCase() === name.toLowerCase()
    ); // If a branch with same name same city under same bank exist
    if (match)
      throw new ConflictError(
        "Branch with same name already exists for this bank"
      );

    const [branch] = await BankBranch.create({
      name,
      bank_id,
      city_id,
      created_by: req.user.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = branch.id;

    // Now fetch the user name using the created_by id
    const creator = await User.findById(branch.created_by);
    // Now fetch the user name using the created_by id
    const branchCity = await City.findById(branch.city_id);

    /* console.log(branchCity); */
    res.status(201).json({
      ...branch,
      city_name: branchCity.name,
      created_by: creator.name,
    });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, bank_id, city_id } = req.body;
    /* console.log("payload", req.body); */
    // Check bank Branch exist or not
    const existing = await BankBranch.findById(id);
    if (!existing) throw new NotFoundError("Bank branch not found");

    // Optional validation if bank_id is being changed
    if (bank_id && bank_id !== existing.bank_id) {
      const bank = await Bank.findById(bank_id);
      if (!bank) throw new NotFoundError("Provided bank_id does not exist");
    }

    // Optional validation if city_id is being changed
    if (city_id && city_id !== existing.city_id) {
      const city = await City.findById(city_id);
      if (!city) throw new NotFoundError("Provided city_id does not exist");
    }

    // Check for duplicates
    const all = await BankBranch.findAll();
    /* const duplicate = all.find(
      (b) =>
        b.id !== Number(id) &&
        b.bank_id === Number(bank_id) &&
        b.name.toLowerCase() === name.toLowerCase()
    ); // If a branch with same name under same bank exists */
    const duplicate = all.find(
      (b) =>
        b.id !== Number(id) &&
        b.bank_id === Number(bank_id) &&
        b.city_id === Number(city_id) &&
        b.name.toLowerCase() === name.toLowerCase()
    ); // If a branch with same name same city under same bank exist
    if (duplicate)
      throw new ConflictError(
        "Branch with same name already exists for this bank"
      );

    const [updated] = await BankBranch.update(id, {
      name,
      bank_id,
      city_id,
      updated_by: req.user.id,
      updated_at: new Date(),
    });

    // Now fetch the user name using the created_by id
    const creator = await User.findById(updated.created_by);
    // Now fetch the user name using the updated_by id
    const editor = await User.findById(updated.updated_by);
    // Now fetch the user name using the created_by id
    const branchCity = await City.findById(updated.city_id);

    res.json({
      ...updated,
      city_name: branchCity.name,
      created_by: creator.name,
      updated_by: editor.name,
    });
  } catch (err) {
    next(err);
  }
};

exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await BankBranch.findById(id);
    if (!existing) throw new NotFoundError("Bank branch not found");

    await BankBranch.softDelete(id, req.user.id);
    res.status(204).json({ message: "Bank branch deleted successfully." });
  } catch (err) {
    next(err);
  }
};
