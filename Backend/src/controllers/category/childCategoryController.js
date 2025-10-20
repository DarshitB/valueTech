const fs = require("fs");
const path = require("path");
const ChildCategory = require("../../models/category/child_category");
const SubCategory = require("../../models/category/sub_category");
const User = require("../../models/user/user");
const { ensureDirectoryExists } = require("../../utils/localFileHelper");
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

// Get all child categories
exports.getAll = async (req, res, next) => {
  try {
    const records = await ChildCategory.findAll();
    res.json(records);
  } catch (err) {
    next(err);
  }
};

// Get child category by ID
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const record = await ChildCategory.findById(id);
    if (!record) throw new NotFoundError("ChildCategory not found");
    res.json(record);
  } catch (err) {
    next(err);
  }
};

// Get child categories by category name(s)
exports.getByCategoryName = async (req, res, next) => {
  try {
    const { categoryNames } = req.query;
    
    if (!categoryNames) {
      throw new BadRequestError("categoryNames parameter is required");
    }

    // Parse categoryNames - can be a single string or comma-separated values
    let names;
    if (typeof categoryNames === 'string') {
      // Split by comma and trim whitespace
      names = categoryNames.split(',').map(name => name.trim()).filter(name => name.length > 0);
    } else if (Array.isArray(categoryNames)) {
      names = categoryNames.map(name => name.trim()).filter(name => name.length > 0);
    } else {
      throw new BadRequestError("categoryNames must be a string or array");
    }

    if (names.length === 0) {
      throw new BadRequestError("At least one category name must be provided");
    }

    const records = await ChildCategory.findByCategoryName(names);
    res.json(records);
  } catch (err) {
    next(err);
  }
};

// Create child category
exports.create = async (req, res, next) => {
  const tempPaths = [];
  try {
    const { name, sub_category_id } = req.body;
    const uploadedFiles = req.files || [];
    
    if (!name || !sub_category_id)
      throw new BadRequestError("Name and sub_category_id are required");

    const existing = await ChildCategory.findByNameAndSubCategory(
      name,
      sub_category_id
    );
    if (existing)
      throw new ConflictError(
        "ChildCategory with the same name already exists in this sub-category"
      );

    // Get subcategory details (includes category name)
    const subCategory = await SubCategory.findById(sub_category_id);
    if (!subCategory)
      throw new BadRequestError("Invalid sub_category_id");

    const [created] = await ChildCategory.create({
      name,
      sub_category_id,
      created_by: req.user.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = created.id;

    // Handle image uploads if any
    const savedImages = [];
    if (uploadedFiles.length > 0) {
      // Sanitize folder names
      const sanitize = (str) => str.replace(/[^a-zA-Z0-9]/g, "_");
      const categoryName = sanitize(subCategory.category_name);
      const subCategoryName = sanitize(subCategory.name);
      const childCategoryName = sanitize(name);

      // Create upload directory: uploads/childCategory/{category}/{subcategory}/{childcategoryname}
      const uploadDir = path.join(
        process.cwd(),
        "uploads",
        "childCategory",
        categoryName,
        subCategoryName,
        childCategoryName
      );
      ensureDirectoryExists(uploadDir);

      // Process each uploaded file
      for (const file of uploadedFiles) {
        try {
          // Generate unique filename
          const fileExtension = path.extname(file.originalname);
          const randomNumber = Math.floor(Math.random() * 10000);
          const fileName = `${Date.now()}_${randomNumber}${fileExtension}`;
          const finalPath = path.join(uploadDir, fileName);

          // Move file from temp to final location
          fs.renameSync(file.path, finalPath);
          tempPaths.push(file.path);

          // Save image record to database
          const imageUrl = `/uploads/childCategory/${categoryName}/${subCategoryName}/${childCategoryName}/${fileName}`;
          await ChildCategory.addImage({
            child_category_id: created.id,
            image_url: imageUrl,
            created_by: req.user.id,
            created_at: new Date(),
          });

          savedImages.push(imageUrl);
        } catch (fileErr) {
          console.error(`Error processing file ${file.originalname}:`, fileErr);
        }
      }
    }

    const creator = await User.findById(created.created_by);
    const enriched = { 
      ...created, 
      created_by: creator.name,
      images: savedImages 
    };

    res.status(201).json(enriched);
  } catch (err) {
    // Clean up temp files on error
    tempPaths.forEach(tempPath => {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (cleanupErr) {
        console.error("Error cleaning up temp file:", cleanupErr);
      }
    });
    next(err);
  }
};

// Update child category
exports.update = async (req, res, next) => {
  const tempPaths = [];
  try {
    const { id } = req.params;
    const { name, sub_category_id } = req.body;
    const uploadedFiles = req.files || [];

    const existing = await ChildCategory.findById(id);
    if (!existing) throw new NotFoundError("ChildCategory not found");

    // Check if the new name already exists in a different category
    const duplicate = await ChildCategory.findByNameAndSubCategory(
      name,
      sub_category_id
    );
    if (duplicate && duplicate.id !== parseInt(id, 10)) {
      throw new ConflictError(
        "ChildCategory with the same name already exists in this sub-category"
      );
    }

    // Get subcategory details (includes category name)
    const subCategory = await SubCategory.findById(sub_category_id);
    if (!subCategory)
      throw new BadRequestError("Invalid sub_category_id");

    const [updated] = await ChildCategory.update(id, {
      name,
      sub_category_id,
      updated_by: req.user.id,
      updated_at: new Date(),
    });

    // Handle image uploads if any
    const savedImages = [];
    if (uploadedFiles.length > 0) {
      // Sanitize folder names
      const sanitize = (str) => str.replace(/[^a-zA-Z0-9]/g, "_");
      const categoryName = sanitize(subCategory.category_name);
      const subCategoryName = sanitize(subCategory.name);
      const childCategoryName = sanitize(name);

      // Create upload directory: uploads/childCategory/{category}/{subcategory}/{childcategoryname}
      const uploadDir = path.join(
        process.cwd(),
        "uploads",
        "childCategory",
        categoryName,
        subCategoryName,
        childCategoryName
      );
      ensureDirectoryExists(uploadDir);

      // Process each uploaded file
      for (const file of uploadedFiles) {
        try {
          // Generate unique filename
          const fileExtension = path.extname(file.originalname);
          const randomNumber = Math.floor(Math.random() * 10000);
          const fileName = `${Date.now()}_${randomNumber}${fileExtension}`;
          const finalPath = path.join(uploadDir, fileName);

          // Move file from temp to final location
          fs.renameSync(file.path, finalPath);
          tempPaths.push(file.path);

          // Save image record to database
          const imageUrl = `/uploads/childCategory/${categoryName}/${subCategoryName}/${childCategoryName}/${fileName}`;
          await ChildCategory.addImage({
            child_category_id: id,
            image_url: imageUrl,
            created_by: req.user.id,
            created_at: new Date(),
          });

          savedImages.push(imageUrl);
        } catch (fileErr) {
          console.error(`Error processing file ${file.originalname}:`, fileErr);
        }
      }
    }

    const creator = await User.findById(updated.created_by);
    const editor = await User.findById(updated.updated_by);
    
    // Get all images for this category
    const allImages = await ChildCategory.getImages(id);
    
    const enriched = {
      ...updated,
      created_by: creator.name,
      updated_by: editor.name,
      images: allImages,
    };

    res.json(enriched);
  } catch (err) {
    // Clean up temp files on error
    tempPaths.forEach(tempPath => {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (cleanupErr) {
        console.error("Error cleaning up temp file:", cleanupErr);
      }
    });
    next(err);
  }
};

// Soft delete child category
exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await ChildCategory.findById(id);
    if (!existing) throw new NotFoundError("ChildCategory not found");

    await ChildCategory.softDelete(id, req.user.id);
    res.status(204).json({ message: "ChildCategory deleted successfully." });
  } catch (err) {
    next(err);
  }
};
