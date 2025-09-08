const db = require("../../../db");

const order_media = {
  /**
   * Insert a new media record into order_media_image_video.
   * payload: { order_id, uploader_type, uploader_id, media_url, media_type, status }
   * Returns: promise that resolves to inserted id (PG returns array, so consumer may need [0]).
   */
  insertMedia: (payload) =>
    db("order_media_image_video").insert(payload).returning("id"),

  /**
   * Get order row by order_number.
   * Assumes your orders table has column `order_number`. Change column name if different.
   * Returns single row or undefined.
   */
  getOrderByNumber: (orderNumber) =>
    db("orders")
      .select("id", "order_number")
      .where("order_number", orderNumber)
      .first(),

  /**
   * Optional convenience: Get media list for an order by order_id
   * (useful if you later need to fetch media for display)
   */
  findByOrderId: (orderId) =>
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
   * Optional: find media record by its id
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
};

module.exports = order_media;
