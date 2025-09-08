const db = require("../../../db");
const OrderComment = require("../../models/orders/orderComment");
const Order = require("../../models/orders/order");
const OrderCommentTag = require("../../models/orders/orderCommentTag");
const { NotFoundError, BadRequestError } = require("../../utils/customErrors");

// Get all comments for a specific order
exports.getByOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId, req.user);
    if (!order) throw new NotFoundError("Order not found");
    const comments = await OrderComment.getCommentsByOrderId(orderId);

    // Fetch tags for all comments in parallel
    const commentIds = comments.map((c) => c.id);
    const tagsByComment = {};
    if (commentIds.length > 0) {
      const tags = await db("order_comment_tags")
        .leftJoin("users", "order_comment_tags.user_id", "users.id")
        .select(
          "order_comment_tags.comment_id",
          "users.id as user_id",
          "users.name"
        )
        .whereIn("order_comment_tags.comment_id", commentIds);

      tags.forEach((tag) => {
        if (!tagsByComment[tag.comment_id]) tagsByComment[tag.comment_id] = [];
        tagsByComment[tag.comment_id].push({
          user_id: tag.user_id,
          name: tag.name,
        });
      });
    }

    // Attach tags to each comment
    const commentsWithTags = comments.map((c) => ({
      ...c,
      tags: tagsByComment[c.id] || [],
    }));

    res.json(commentsWithTags);
  } catch (err) {
    next(err);
  }
};

// Add a new comment to an order
exports.create = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { comment, tagged_user_ids } = req.body; // tagged_user_ids: [userId, userId, ...]

    /* console.log(req.body); */

    if (!comment || comment.trim() === "") {
      throw new BadRequestError("Comment is required");
    }
    // Check if order exists
    const order = await Order.findById(orderId, req.user);
    if (!order) throw new NotFoundError("Order not found");

    // Add comment
    const commentData = {
      order_id: orderId,
      user_id: req.user.id,
      comment,
      commented_at: new Date(),
    };
    const newComment = await OrderComment.addComment(commentData);

    // Add tags if provided
    let tags = [];
    if (Array.isArray(tagged_user_ids) && tagged_user_ids.length > 0) {
      tags = await OrderCommentTag.addTags(newComment.id, tagged_user_ids);
    }

    res.status(201).json({ ...newComment, tags });
  } catch (err) {
    next(err);
  }
};
