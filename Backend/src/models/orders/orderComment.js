const db = require("../../../db");

const orderComment = {
  // Get all comments for a specific order (most recent first)
  getCommentsByOrderId: async (orderId) => {
    return await db("order_comments")
      .leftJoin("users", "order_comments.user_id", "users.id")
      .leftJoin("field_verifiers", "order_comments.user_id", "field_verifiers.id")
      .select(
        "order_comments.id",
        "order_comments.order_id",
        "order_comments.user_id",
        "order_comments.user_type",
        db.raw(`
          COALESCE(
            CASE
              WHEN order_comments.user_type IN ('field_verifier', 'filed_verifier', 'filed_varifier')
                THEN field_verifiers.name
              ELSE users.name
            END,
            users.name,
            field_verifiers.name
          ) as user_name
        `),
        "order_comments.comment",
        "order_comments.commented_at"
      )
      .where("order_comments.order_id", orderId)
      .orderBy("order_comments.id", "asc");
  },

  // Add a new comment to an order
  addComment: async (data) => {
    const [comment] = await db("order_comments").insert(data).returning("*");
    return comment;
  },

  // Get a single comment by id
  findById: async (id) => {
    return await db("order_comments")
      .leftJoin("users", "order_comments.user_id", "users.id")
      .leftJoin("field_verifiers", "order_comments.user_id", "field_verifiers.id")
      .select(
        "order_comments.id",
        "order_comments.order_id",
        "order_comments.user_id",
        "order_comments.user_type",
        db.raw(`
          COALESCE(
            CASE
              WHEN order_comments.user_type IN ('field_verifier', 'filed_verifier', 'filed_varifier')
                THEN field_verifiers.name
              ELSE users.name
            END,
            users.name,
            field_verifiers.name
          ) as user_name
        `),
        "order_comments.comment",
        "order_comments.commented_at"
      )
      .where("order_comments.id", id)
      .first();
  },
};

module.exports = orderComment;
