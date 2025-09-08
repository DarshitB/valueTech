const db = require("../../../db");

const orderStatusHistory = {
  // Get status history for a specific order
  /* getOrderStatusHistory: async (orderId) => {
    const statusHistory = await db("order_status_history")
      .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
      .leftJoin("users", "order_status_history.changed_by", "users.id")
      .select(
        "order_status_history.id",
        "order_status_history.order_id",
        "order_status_history.status_id",
        "order_status_master.name as status_name",
        "order_status_master.description as status_description",
        "order_status_history.changed_by",
        "users.name as changed_by_name",
        "order_status_history.changed_at"
      )
      .where("order_status_history.order_id", orderId)
      .orderBy("order_status_history.changed_at", "desc");

    return statusHistory;
  }, */

  // Get status history by ID
  /* findById: async (id, user) => {
    const historyEntry = await db("order_status_history")
      .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
      .leftJoin("users", "order_status_history.changed_by", "users.id")
      .leftJoin("orders", "order_status_history.order_id", "orders.id")
      .select(
        "order_status_history.id",
        "order_status_history.order_id",
        "order_status_history.status_id",
        "order_status_master.name as status_name",
        "order_status_master.description as status_description",
        "order_status_history.changed_by",
        "users.name as changed_by_name",
        "order_status_history.changed_at",
        "orders.officer_id",
        "orders.manager_id",
        "orders.created_by"
      )
      .where("order_status_history.id", id)
      .first();

    if (!historyEntry) return null;

    // Check user access permissions
    if (user.role_name === "Bank Officer" && historyEntry.officer_id !== user.id) {
      return null;
    } else if (user.role_name === "Manager" && historyEntry.manager_id !== user.id) {
      return null;
    } else if (user.role_name === "Bank Authority") {
      if (historyEntry.created_by !== user.id && 
          historyEntry.officer_id !== user.id && 
          historyEntry.manager_id !== user.id) {
        return null;
      }
    }

    return historyEntry;
  }, */

  // Create new status history entry
  createStatusHistory: async (data) => {
    const [historyEntry] = await db("order_status_history").insert(data).returning("*");
    return historyEntry;
  },

  // Get status change history for a specific user
  /* getUserStatusChangeHistory: async (userId, user) => {
    // Check if requesting user has permission to view this user's history
    if (user.role_name === "Bank Officer" && user.id !== userId) {
      return []; // Officers can only see their own history
    }

    const history = await db("order_status_history")
      .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
      .leftJoin("orders", "order_status_history.order_id", "orders.id")
      .select(
        "order_status_history.id",
        "order_status_history.order_id",
        "orders.order_number",
        "orders.customer_name",
        "order_status_history.status_id",
        "order_status_master.name as status_name",
        "order_status_master.description as status_description",
        "order_status_history.changed_at"
      )
      .where("order_status_history.changed_by", userId)
      .whereNull("orders.deleted_at")
      .orderBy("order_status_history.changed_at", "desc");

    return history;
  }, */

  // Get recent status changes across all orders (for dashboard)
  /* getRecentStatusChanges: async (user, limit = 10) => {
    let baseQuery = db("order_status_history")
      .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
      .leftJoin("users as changed_by_user", "order_status_history.changed_by", "changed_by_user.id")
      .leftJoin("orders", "order_status_history.order_id", "orders.id")
      .select(
        "order_status_history.id",
        "order_status_history.order_id",
        "orders.order_number",
        "orders.customer_name",
        "order_status_history.status_id",
        "order_status_master.name as status_name",
        "order_status_master.description as status_description",
        "order_status_history.changed_by",
        "changed_by_user.name as changed_by_name",
        "order_status_history.changed_at"
      )
      .whereNull("orders.deleted_at")
      .orderBy("order_status_history.changed_at", "desc")
      .limit(limit);

    // Apply role-based filters
    if (user.role_name === "Bank Officer") {
      baseQuery.andWhere("orders.officer_id", user.id);
    } else if (user.role_name === "Manager") {
      baseQuery.andWhere("orders.manager_id", user.id);
    } else if (user.role_name === "Bank Authority") {
      baseQuery.andWhere(function () {
        this.where("orders.created_by", user.id)
          .orWhere("orders.officer_id", user.id)
          .orWhere("orders.manager_id", user.id);
      });
    }

    const recentChanges = await baseQuery;
    return recentChanges;
  }, */

  // Get status change statistics for a specific time period
  /* getStatusChangeStats: async (startDate, endDate, user) => {
    let baseQuery = db("order_status_history")
      .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
      .leftJoin("orders", "order_status_history.order_id", "orders.id")
      .select(
        "order_status_master.id",
        "order_status_master.name as status_name",
        db.raw("COUNT(order_status_history.id) as change_count")
      )
      .whereBetween("order_status_history.changed_at", [startDate, endDate])
      .whereNull("orders.deleted_at")
      .groupBy("order_status_master.id", "order_status_master.name")
      .orderBy("change_count", "desc");

    // Apply role-based filters
    if (user.role_name === "Bank Officer") {
      baseQuery.andWhere("orders.officer_id", user.id);
    } else if (user.role_name === "Manager") {
      baseQuery.andWhere("orders.manager_id", user.id);
    } else if (user.role_name === "Bank Authority") {
      baseQuery.andWhere(function () {
        this.where("orders.created_by", user.id)
          .orWhere("orders.officer_id", user.id)
          .orWhere("orders.manager_id", user.id);
      });
    }

    const stats = await baseQuery;
    return stats;
  } */
};

module.exports = orderStatusHistory;
