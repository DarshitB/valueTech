const Bank = require("../../models/bank/bank");
const User = require("../../models/user/user");
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

exports.getAll = async (req, res, next) => {
  try {
    const banks = await Bank.findAll();
    res.json(banks);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const bank = await Bank.findById(id);
    if (!bank) throw new NotFoundError("Bank not found");
    res.json(bank);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name, initial } = req.body;
    if (!name || !initial)
      throw new BadRequestError("Bank name and initial are required");

    // Check if a bank with same name or initial (case-insensitive) already exists
    const existing = await Bank.findAll();
    const match = existing.find(
      (b) =>
        b.name.toLowerCase() === name.toLowerCase() ||
        b.initial.toLowerCase() === initial.toLowerCase()
    );
    if (match)
      throw new ConflictError("Bank with same name or initial already exists");

    const [bank] = await Bank.create({
      name,
      initial,
      created_by: req.user.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = bank.id;

    // Now fetch the user name using the created_by id
    const creator = await User.findById(bank.created_by);
    res.status(201).json({
      ...bank,
      created_by: creator.name,
    });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, initial } = req.body;

    // check bank exist or not
    const existing = await Bank.findById(id);
    if (!existing) throw new NotFoundError("Bank not found");

    // check same bank name or initial present in the bank or not
    const all = await Bank.findAll();
    const duplicate = all.find(
      (b) =>
        b.id !== Number(id) &&
        (b.name.toLowerCase() === name.toLowerCase() ||
          b.initial.toLowerCase() === initial.toLowerCase())
    );
    if (duplicate)
      throw new ConflictError("Bank with same name or initial already exists");

    const [updated] = await Bank.update(id, {
      name,
      initial,
      updated_by: req.user.id,
      updated_at: new Date(),
    });

    // Now fetch the user name using the created_by id
    const creator = await User.findById(updated.created_by);
    // Now fetch the user name using the updated_by id
    const editor = await User.findById(updated.updated_by);

    res.json({
      ...updated,
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
    const existing = await Bank.findById(id);
    if (!existing) throw new NotFoundError("Bank not found");

    await Bank.softDelete(id, req.user.id);
    res.status(204).json({ message: "Bank deleted successfully." });
  } catch (err) {
    next(err);
  }
};
