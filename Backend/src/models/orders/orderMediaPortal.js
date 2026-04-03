const db = require("../../../db");

const orderMediaPortal = {
  /**
   * Get all media records for a specific order ID (excludes soft-deleted)
   * Returns: Array of media records with all details
   */
  getMediaByOrderId: (orderId) =>
    db("order_media_image_video")
      .select(
        "id",
        "order_id",
        "uploader_type",
        "uploader_id",
        "media_url",
        "media_type",
        "status",
        "orientation",
        "created_at",
        "updated_at",
        "updated_by"
      )
      .where({ order_id: orderId })
      .whereNull("deleted_at"),

  /**
   * Get approved media records for a specific order ID (status = 1, excludes soft-deleted)
   * Returns: Array of approved media records
   */
  getApprovedMediaByOrderId: (orderId) =>
    db("order_media_image_video")
      .select(
        "id",
        "order_id",
        "uploader_type",
        "uploader_id",
        "media_url",
        "media_type",
        "status",
        "orientation",
        "created_at",
        "updated_at",
        "updated_by"
      )
      .where({ order_id: orderId, status: 1 })
      .whereNull("deleted_at"),

  /**
   * Update status for multiple media records
   * payload: Array of objects with id and status
   * Returns: Promise that resolves to updated records
   */
  updateMultipleStatus: (updates, updatedBy) => {
    const promises = updates.map(({ id, status }) =>
      db("order_media_image_video")
        .where("id", id)
        .whereNull("deleted_at")
        .update({
          status: status,
          updated_at: new Date(),
          updated_by: updatedBy,
        })
        .returning(["id", "order_id", "status", "updated_at", "updated_by"])
    );

    return Promise.all(promises);
  },

  /**
   * Soft delete multiple media records by id (sets deleted_at, deleted_by)
   * @param {number[]} ids - Media record ids
   * @param {number} deletedBy - User id
   * @returns {Promise<Array>} Updated records
   */
  softDeleteByIds: (ids, deletedBy) => {
    if (!ids || ids.length === 0) return Promise.resolve([]);
    const now = new Date();
    return db("order_media_image_video")
      .whereIn("id", ids)
      .whereNull("deleted_at")
      .update({
        deleted_at: now,
        deleted_by: deletedBy,
      })
      .returning(["id", "order_id", "deleted_at", "deleted_by"]);
  },

  /**
   * Get media record by ID
   * Returns: Single media record or undefined
   */
  findById: (id) =>
    db("order_media_image_video")
      .select(
        "id",
        "order_id",
        "uploader_type",
        "uploader_id",
        "media_url",
        "media_type",
        "status",
        "orientation",
        "created_at",
        "updated_at",
        "updated_by"
      )
      .where("id", id)
      .whereNull("deleted_at")
      .first(),

  /**
   * Get media records by IDs
   * Returns: media records
   */
  findByIds: (ids) =>
    db("order_media_image_video")
      .select(
        "id",
        "order_id",
        "uploader_type",
        "uploader_id",
        "media_url",
        "media_type",
        "status",
        "orientation",
        "created_at",
        "updated_at",
        "updated_by"
      )
      .whereIn("id", ids)
      .whereNull("deleted_at"),

  /**
   * Get order details by order ID
   * Returns: Order details or undefined
   */
  getOrderById: (orderId) =>
    db("orders")
      .select("id", "order_number")
      .where("id", orderId)
      .first(),

  /**
   * Insert a new media record
   * payload: Object with media data
   * Returns: Promise that resolves to the inserted media ID
   */
  insertMedia: (mediaData) =>
    db("order_media_image_video")
      .insert(mediaData)
      .returning("id")
      .then(result => result[0].id),

  /**
   * Update orientation for multiple media records by id
   * @param {Array<{id: string|number, orientation: string}>} updates - Array of { id, orientation }
   * @param {number} updatedBy - User id
   * @returns {Promise}
   */
  updateOrientationsByIds: (updates, updatedBy) => {
    if (!updates || updates.length === 0) return Promise.resolve();
    const promises = updates.map(({ id, orientation }) =>
      db("order_media_image_video")
        .where("id", id)
        .update({
          orientation: orientation || null,
          updated_at: new Date(),
          updated_by: updatedBy,
        })
    );
    return Promise.all(promises);
  },
};

module.exports = orderMediaPortal;
