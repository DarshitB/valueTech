const db = require("../../../db");

const orderMediaPortal = {
  /**
   * Get all media records for a specific order ID
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
        "created_at",
        "updated_at",
        "updated_by"
      )
      .where({ order_id: orderId }),

  /**
   * Update status for multiple media records
   * payload: Array of objects with id and status
   * Returns: Promise that resolves to updated records
   */
  updateMultipleStatus: (updates, updatedBy) => {
    const promises = updates.map(({ id, status }) =>
      db("order_media_image_video")
        .where("id", id)
        .update({
          status: status,
          updated_at: new Date(),
          updated_by: updatedBy,
        })
        .returning(["id", "status", "updated_at", "updated_by"])
    );

    return Promise.all(promises);
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
        "created_at",
        "updated_at",
        "updated_by"
      )
      .where("id", id)
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
        "created_at",
        "updated_at",
        "updated_by"
      )
      .whereIn("id", ids),

  /**
   * Get order details by order ID
   * Returns: Order details or undefined
   */
  getOrderById: (orderId) =>
    db("orders")
      .select("id", "order_number", "status")
      .where("id", orderId)
      .first(),
};

module.exports = orderMediaPortal;
