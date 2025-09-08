const State = require("../../models/location/state");
const User = require("../../models/user/user");
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

exports.getAll = async (req, res, next) => {
  try {
    const states = await State.findAll();
    res.json(states);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const state = await State.findById(id);
    if (!state) throw new NotFoundError("State not found");
    res.json(state);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) throw new BadRequestError("State name is required");

    const existing = await State.findByName(name);
    if (existing) throw new ConflictError("State name already exists");

    // Create the new state (returns inserted record or ID)
    const [state] = await State.create({
      name,
      created_by: req.user.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = state.id;

    // Now fetch the user name using the created_by id
    const creator = await User.findById(state.created_by);

    // Add user's name to the state object for response
    const enrichedState = {
      ...state,
      created_by: creator.name,
    };

    res.status(201).json(enrichedState);
  } catch (err) {
    if (err.code === "23505")
      return next(new ConflictError("State name already exists"));
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const existing = await State.findById(id);
    if (!existing) throw new NotFoundError("State not found");

    const duplicate = await State.findByName(name);
    if (duplicate && duplicate.id !== Number(id))
      throw new ConflictError("State name already exists");

    const [updated] = await State.update(id, {
      name,
      updated_by: req.user.id,
      updated_at: new Date(),
    });

    // Now fetch the user name using the created_by id
    const creator = await User.findById(updated.created_by);
    // Now fetch the user name using the updated_by id
    const editor = await User.findById(updated.updated_by);

    // Add user's name to the state object for response
    const enrichedState = {
      ...updated,
      created_by: creator.name,
      updated_by: editor.name,
    };

    res.json(enrichedState);
  } catch (err) {
    if (err.code === "23505")
      return next(new ConflictError("State name already exists"));
    next(err);
  }
};

exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await State.findById(id);
    if (!existing) throw new NotFoundError("State not found");

    await State.softDelete(id, req.user.id);
    res.status(204).json({ message: "State deleted successfully." });
  } catch (err) {
    next(err);
  }
};
