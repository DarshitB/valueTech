const db = require("../../../db");

const childCategory = {
  // Get all active child categories with parent subcategory
  findAll: async () => {
    const categories = await db("child_category")
      .leftJoin("sub_category", "child_category.sub_category_id", "sub_category.id")
      .leftJoin("users as created_user", "child_category.created_by", "created_user.id")
      .leftJoin("users as updated_user", "child_category.updated_by", "updated_user.id")
      .select(
        "child_category.id",
        "child_category.name",
        "child_category.sub_category_id",
        "sub_category.name as sub_category_name",
        "child_category.is_active",
        "child_category.created_at",
        "created_user.name as created_by",
        "child_category.updated_at",
        "updated_user.name as updated_by"
      )
      .whereNull("child_category.deleted_at")
      .where("child_category.is_active", true);

    // Get images for all categories
    const categoryIds = categories.map(cat => cat.id);
    let imagesMap = {};
    
    if (categoryIds.length > 0) {
      const images = await db("child_category_images")
        .leftJoin("users as image_creator", "child_category_images.created_by", "image_creator.id")
        .select(
          "child_category_images.id",
          "child_category_images.child_category_id",
          "child_category_images.image_url",
          "child_category_images.created_at",
          "image_creator.name as created_by"
        )
        .whereIn("child_category_images.child_category_id", categoryIds);

      // Group images by child_category_id
      imagesMap = images.reduce((acc, img) => {
        if (!acc[img.child_category_id]) {
          acc[img.child_category_id] = [];
        }
        acc[img.child_category_id].push({
          id: img.id,
          image_url: img.image_url,
          created_at: img.created_at,
          created_by: img.created_by
        });
        return acc;
      }, {});
    }

    // Add images to each category
    return categories.map(cat => ({
      ...cat,
      images: imagesMap[cat.id] || []
    }));
  },

  // Find by ID
  findById: async (id) => {
    const category = await db("child_category")
      .leftJoin("sub_category", "child_category.sub_category_id", "sub_category.id")
      .leftJoin("users as created_user", "child_category.created_by", "created_user.id")
      .leftJoin("users as updated_user", "child_category.updated_by", "updated_user.id")
      .select(
        "child_category.id",
        "child_category.name",
        "child_category.sub_category_id",
        "sub_category.name as sub_category_name",
        "child_category.is_active",
        "child_category.created_at",
        "created_user.name as created_by",
        "child_category.updated_at",
        "updated_user.name as updated_by"
      )
      .where("child_category.id", id)
      .whereNull("child_category.deleted_at")
      .where("child_category.is_active", true)
      .first();

    if (!category) return null;

    // Get images for this category
    const images = await db("child_category_images")
      .leftJoin("users as image_creator", "child_category_images.created_by", "image_creator.id")
      .select(
        "child_category_images.id",
        "child_category_images.image_url",
        "child_category_images.created_at",
        "image_creator.name as created_by"
      )
      .where("child_category_images.child_category_id", id);

    return {
      ...category,
      images: images
    };
  },

  // Insert new child category
  create: (data) => db("child_category").insert(data).returning("*"),

  // Update existing
  update: (id, data) => db("child_category").where({ id }).update(data).returning("*"),

  // Soft delete
  softDelete: (id, userId) =>
    db("child_category").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }),

  // Check if child category with name & sub_category_id exists
  findByNameAndSubCategory: (name, sub_category_id) =>
    db("child_category")
      .select("id")
      .whereRaw("LOWER(name) = LOWER(?)", [name.trim()])
      .andWhere("sub_category_id", sub_category_id)
      .whereNull("deleted_at")
      .where("is_active", true)
      .first(),

  // Find child categories by category name(s)
  // Accepts either a single category name string or an array of category names
  findByCategoryName: (categoryNames) => {
    // Ensure categoryNames is always an array
    const names = Array.isArray(categoryNames) ? categoryNames : [categoryNames];
    
    return db("child_category")
      .leftJoin("sub_category", "child_category.sub_category_id", "sub_category.id")
      .leftJoin("category", "sub_category.category_id", "category.id")
      .leftJoin("users as created_user", "child_category.created_by", "created_user.id")
      .leftJoin("users as updated_user", "child_category.updated_by", "updated_user.id")
      .select(
        "child_category.id",
        "child_category.name",
        "child_category.sub_category_id",
        "sub_category.name as sub_category_name",
        "sub_category.category_id",
        "category.name as category_name",
      )
      .whereIn("category.name", names)
      .whereNull("child_category.deleted_at")
      .whereNull("sub_category.deleted_at")
      .whereNull("category.deleted_at")
      .where("child_category.is_active", true)
      .where("sub_category.is_active", true)
      .where("category.is_active", true);
  },

  // Add image to child category
  addImage: (data) => db("child_category_images").insert(data).returning("*"),

  // Delete image by ID
  deleteImage: (imageId) => db("child_category_images").where({ id: imageId }).del(),

  // Get images by child category ID
  getImages: (childCategoryId) => 
    db("child_category_images")
      .leftJoin("users as image_creator", "child_category_images.created_by", "image_creator.id")
      .select(
        "child_category_images.id",
        "child_category_images.image_url",
        "child_category_images.created_at",
        "image_creator.name as created_by"
      )
      .where("child_category_images.child_category_id", childCategoryId),
};

module.exports = childCategory;
