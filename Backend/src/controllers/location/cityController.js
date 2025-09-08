const City = require("../../models/location/city");
const User = require("../../models/user/user");
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

exports.getAll = async (req, res, next) => {
  try {
    const cities = await City.findAll();
    res.json(cities);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const city = await City.findById(id);
    if (!city) throw new NotFoundError("City not found");
    res.json(city);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name, state_id } = req.body;
    
    if (!name || !state_id)
      throw new BadRequestError("City name and state_id are required");

    // Duplicate check: same name under same state
    const existing = await City.findByNameAndState(name, state_id);
    if (existing)
      throw new ConflictError(
        "City with the same name already exists in this state"
      );

    const [city] = await City.create({
      name,
      state_id,
      created_by: req.user.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = city.id;

    // Now fetch the user name using the created_by id
    const creator = await User.findById(city.created_by);

    // Add user's name to the state object for response
    const enrichedCity = {
      ...city,
      created_by: creator.name,
    };

    res.status(201).json(enrichedCity);
  } catch (err) {
    if (err.code === "23505")
      return next(new ConflictError("City name already exists"));
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, state_id } = req.body;

    const existing = await City.findById(id);
    if (!existing) throw new NotFoundError("City not found");

    const duplicate = await City.findByNameAndState(name, state_id);
    if (duplicate && duplicate.id !== Number(id))
      throw new ConflictError(
        "City with the same name already exists in this state"
      );

    const [updated] = await City.update(id, {
      name,
      state_id,
      updated_by: req.user.id,
      updated_at: new Date(),
    });

    // Now fetch the user name using the created_by id
    const creator = await User.findById(updated.created_by);
    // Now fetch the user name using the updated_by id
    const editor = await User.findById(updated.updated_by);

    // Add user's name to the state object for response
    const enrichedCity = {
      ...updated,
      created_by: creator.name,
      updated_by: editor.name,
    };

    res.json(enrichedCity);
  } catch (err) {
    if (err.code === "23505")
      return next(new ConflictError("City name already exists"));
    next(err);
  }
};

exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await City.findById(id);
    if (!existing) throw new NotFoundError("City not found");

    await City.softDelete(id, req.user.id);
    res.status(204).json({ message: "City deleted successfully." });
  } catch (err) {
    next(err);
  }
};
