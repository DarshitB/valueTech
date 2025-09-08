const db = require("../../../db");

const orderCommentTag = {
  // Add tags for a comment (array of user_ids)
  addTags: async (comment_id, user_ids) => {
    if (!Array.isArray(user_ids) || user_ids.length === 0) return [];
    const rows = user_ids.map(user_id => ({ comment_id, user_id }));
    return await db("order_comment_tags").insert(rows).returning("*");
  },

  // Get all tagged users for a comment
  getTagsByCommentId: async (comment_id) => {
    return await db("order_comment_tags")
      .leftJoin("users", "order_comment_tags.user_id", "users.id")
      .select("users.id", "users.name", "users.email")
      .where("order_comment_tags.comment_id", comment_id);
  }
};

module.exports = orderCommentTag;