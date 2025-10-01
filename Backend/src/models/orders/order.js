const db = require("../../../db");

const order = {
  // Get all orders (with status and user details included)
  getAllOrders: async (user) => {
    // Base order query
    const baseQuery = db("orders")
      .leftJoin(
        "order_status_master",
        "orders.current_status_id",
        "order_status_master.id"
      )
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .leftJoin("users as officer_user", "officers.user_id", "officer_user.id")
      .leftJoin("bank_branch", "officers.branch_id", "bank_branch.id")
      .leftJoin("bank", "bank_branch.bank_id", "bank.id")
      .leftJoin("cities", "bank_branch.city_id", "cities.id")
      .leftJoin("states", "cities.state_id", "states.id")
      .leftJoin("users as manager", "orders.manager_id", "manager.id")
      .leftJoin("users as created_user", "orders.created_by", "created_user.id")
      .leftJoin("users as updated_user", "orders.updated_by", "updated_user.id")
      .leftJoin(
        "field_verifiers",
        "orders.field_verifier_id",
        "field_verifiers.id"
      )
      .leftJoin(
        "child_category",
        "orders.child_category_id",
        "child_category.id"
      )
      .leftJoin(
        "sub_category",
        "child_category.sub_category_id",
        "sub_category.id"
      )
      .leftJoin("category", "sub_category.category_id", "category.id")
      .select(
        "orders.id",
        "orders.order_number",
        "orders.customer_name",
        "orders.contact",
        "orders.alternative_contact",
        "orders.supervisor_number",
        "orders.driver_number",
        "orders.payment_amount",
        "orders.payment_mode",
        "orders.payment_status",
        "orders.officer_id",
        "officer_user.name as officer_name",
        "officer_user.email as officer_email",
        "officer_user.mobile as officer_mobile",
        "officers.branch_id",
        "bank_branch.name as branch_name",
        "bank.id as bank_id",
        "bank.name as bank_name",
        "cities.id as city_id",
        "cities.name as city_name",
        "states.id as state_id",
        "states.name as state_name",
        "orders.manager_id",
        "manager.name as manager_name",
        "orders.registration_number",
        "orders.place_of_inspection",
        "orders.date_of_inspection",
        "orders.current_status_id",
        "order_status_master.name as current_status_name",
        "order_status_master.description as current_status_description",
        "orders.order_priority",
        "orders.order_type",
        "orders.created_at",
        "created_user.name as created_by",
        "orders.updated_at",
        "updated_user.name as updated_by",
        "orders.field_verifier_id",
        "field_verifiers.name as field_verifier_name",
        "child_category.id as child_category_id",
        "child_category.name as child_category_name",
        "sub_category.id as sub_category_id",
        "sub_category.name as sub_category_name",
        "category.id as category_id",
        "category.name as category_name",
        "orders.valuer_name"
      )
      .whereNull("orders.deleted_at");

    // Role-based filters - flexible matching using includes()
    const roleName = user.role_name.toUpperCase();
    
    if (roleName.includes("ADMIN") && roleName !== "DEVELOPER_ADMIN") {
      // Admin users can only see orders assigned to them through order_users mapping
      // Exclude DEVELOPER_ADMIN (owner role) who should see everything
      const assignedOrderIds = await db("order_users")
        .select("order_id")
        .where("user_id", user.id)
        .whereNull("deleted_at");
      
      const orderIds = assignedOrderIds.map(o => o.order_id);
      
      if (orderIds.length > 0) {
        baseQuery.whereIn("orders.id", orderIds);
      } else {
        // If no orders assigned, return empty array by adding impossible condition
        baseQuery.where("orders.id", -1);
      }
    } else if (roleName.includes("BANK AUTHORITY")) {
      baseQuery.andWhere(function () {
        this.where("orders.created_by", user.id)
          .orWhere("officers.user_id", user.id)
          .orWhere("orders.manager_id", user.id);
      });
    } else if (roleName.includes("BANK OFFICER")) {
      baseQuery.andWhere("officers.user_id", user.id);
    } else if (roleName.includes("MANAGER")) {
      baseQuery.andWhere("orders.manager_id", user.id);
    } else if (roleName.includes("TELECALLER")) {
      // TELECALLER can only see orders that don't have supervisor_number or driver_number
      /* baseQuery.andWhere(function () {
        this.whereNull("orders.supervisor_number")
          .orWhereNull("orders.driver_number");
      }); */
    }

    // Sort by newest first
    baseQuery.orderBy("orders.created_at", "desc");

    const orders = await baseQuery;
    return orders;
  },

  // Get orders for mobile app filtered by field verifier ID
  getForMobile: async (fieldVerifierId) => {
    // Base order query
    const baseQuery = db("orders")
      .leftJoin(
        "order_status_master",
        "orders.current_status_id",
        "order_status_master.id"
      )
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .leftJoin("users as officer_user", "officers.user_id", "officer_user.id")
      .leftJoin("bank_branch", "officers.branch_id", "bank_branch.id")
      .leftJoin("bank", "bank_branch.bank_id", "bank.id")
      .leftJoin("cities", "bank_branch.city_id", "cities.id")
      .leftJoin("states", "cities.state_id", "states.id")
      .leftJoin("users as manager", "orders.manager_id", "manager.id")
      .leftJoin("users as created_user", "orders.created_by", "created_user.id")
      .leftJoin("users as updated_user", "orders.updated_by", "updated_user.id")
      .leftJoin(
        "field_verifiers",
        "orders.field_verifier_id",
        "field_verifiers.id"
      )
      .leftJoin(
        "child_category",
        "orders.child_category_id",
        "child_category.id"
      )
      .leftJoin(
        "sub_category",
        "child_category.sub_category_id",
        "sub_category.id"
      )
      .leftJoin("category", "sub_category.category_id", "category.id")
      .select(
        "orders.id",
        "orders.order_number",
        "orders.customer_name",
        "orders.contact",
        "orders.alternative_contact",
        "orders.supervisor_number",
        "orders.driver_number",
        "orders.payment_amount",
        "orders.payment_mode",
        "orders.payment_status",
        "orders.officer_id",
        "officer_user.name as officer_name",
        "officer_user.email as officer_email",
        "officer_user.mobile as officer_mobile",
        "officers.branch_id",
        "bank_branch.name as branch_name",
        "bank.id as bank_id",
        "bank.name as bank_name",
        "bank.initial as bank_initial",
        "cities.id as city_id",
        "cities.name as city_name",
        "states.id as state_id",
        "states.name as state_name",
        "orders.manager_id",
        "manager.name as manager_name",
        "orders.registration_number",
        "orders.place_of_inspection",
        "orders.date_of_inspection",
        "orders.current_status_id",
        "order_status_master.name as current_status_name",
        "order_status_master.description as current_status_description",
        "orders.order_priority",
        "orders.order_type",
        "orders.created_at",
        "created_user.name as created_by",
        "orders.updated_at",
        "updated_user.name as updated_by",
        "orders.field_verifier_id",
        "field_verifiers.name as field_verifier_name",
        "child_category.id as child_category_id",
        "child_category.name as child_category_name",
        "sub_category.id as sub_category_id",
        "sub_category.name as sub_category_name",
        "category.id as category_id",
        "category.name as category_name",
        "orders.valuer_name"
      )
      .whereNull("orders.deleted_at")
      .where("orders.field_verifier_id", fieldVerifierId);

    // Sort by newest first
    baseQuery.orderBy("orders.created_at", "desc");

    const orders = await baseQuery;
    return orders;
  },

  // Get order by ID (with status and user details)
  findById: async (id, user) => {
    const order = await db("orders")
      .leftJoin(
        "order_status_master",
        "orders.current_status_id",
        "order_status_master.id"
      )
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .leftJoin("users as officer_user", "officers.user_id", "officer_user.id")
      .leftJoin("bank_branch", "officers.branch_id", "bank_branch.id")
      .leftJoin("bank", "bank_branch.bank_id", "bank.id")
      .leftJoin("cities", "bank_branch.city_id", "cities.id")
      .leftJoin("states", "cities.state_id", "states.id")
      .leftJoin("users as manager", "orders.manager_id", "manager.id")
      .leftJoin("users as created_user", "orders.created_by", "created_user.id")
      .leftJoin("users as updated_user", "orders.updated_by", "updated_user.id")
      .leftJoin(
        "field_verifiers",
        "orders.field_verifier_id",
        "field_verifiers.id"
      )
      .leftJoin(
        "child_category",
        "orders.child_category_id",
        "child_category.id"
      )
      .leftJoin(
        "sub_category",
        "child_category.sub_category_id",
        "sub_category.id"
      )
      .leftJoin("category", "sub_category.category_id", "category.id")
      .select(
        "orders.id",
        "orders.order_number",
        "orders.customer_name",
        "orders.contact",
        "orders.alternative_contact",
        "orders.supervisor_number",
        "orders.driver_number",
        "orders.payment_amount",
        "orders.payment_mode",
        "orders.payment_status",
        "orders.officer_id",
        "officers.user_id as officer_user_id",
        "officer_user.name as officer_name",
        "officer_user.email as officer_email",
        "officer_user.mobile as officer_mobile",
        "officers.branch_id",
        "bank_branch.name as branch_name",
        "bank.id as bank_id",
        "bank.name as bank_name",
        "bank.initial as bank_initial",
        "cities.id as city_id",
        "cities.name as city_name",
        "states.id as state_id",
        "states.name as state_name",
        "orders.manager_id",
        "manager.name as manager_name",
        "orders.registration_number",
        "orders.place_of_inspection",
        "orders.date_of_inspection",
        "orders.current_status_id",
        "order_status_master.name as current_status_name",
        "order_status_master.description as current_status_description",
        "orders.order_priority",
        "orders.order_type",
        "orders.created_at",
        "created_user.name as created_by",
        "orders.updated_at",
        "updated_user.name as updated_by",
        "orders.field_verifier_id",
        "field_verifiers.name as field_verifier_name",
        "child_category.id as child_category_id",
        "child_category.name as child_category_name",
        "sub_category.id as sub_category_id",
        "sub_category.name as sub_category_name",
        "category.id as category_id",
        "category.name as category_name",
        "orders.valuer_name"
      )
      .whereNull("orders.deleted_at")
      .where("orders.id", id)
      .first();

    if (!order) return null;

    // Check user access permissions - now we have officer_user_id in the order data
    const roleName = user.role_name.toUpperCase();
    
    if (roleName.includes("ADMIN") && roleName !== "DEVELOPER_ADMIN") {
      // Admin users can only see orders assigned to them through order_users mapping
      // Exclude DEVELOPER_ADMIN (owner role) who should see everything
      const isAssigned = await db("order_users")
        .where({ order_id: id, user_id: user.id })
        .whereNull("deleted_at")
        .first();
      
      if (!isAssigned) {
        return null; // Admin can only see orders assigned to them
      }
    } else if (roleName.includes("BANK OFFICER")) {
      if (order.officer_user_id !== user.id) {
        return null; // Officer can only see orders assigned to them
      }
    } else if (roleName.includes("MANAGER") && order.manager_id !== user.id) {
      return null; // Manager can only see their own orders
    } else if (roleName.includes("BANK AUTHORITY")) {
      // BANK AUTHORITY can see orders they created, are assigned to, or manage
      if (
        order.created_by !== user.id &&
        order.officer_user_id !== user.id &&
        order.manager_id !== user.id
      ) {
        return null;
      }
    }

    // Get status history for this order
    const statusHistory = await db("order_status_history")
      .leftJoin(
        "order_status_master",
        "order_status_history.status_id",
        "order_status_master.id"
      )
      .leftJoin("users", "order_status_history.changed_by", "users.id")
      .select(
        "order_status_history.id",
        "order_status_history.status_id",
        "order_status_master.name as status_name",
        "order_status_history.changed_by",
        "order_status_history.activity_extra",
        "users.name as changed_by_name",
        "order_status_history.changed_at"
      )
      .where("order_status_history.order_id", id)
      .orderBy("order_status_history.id", "desc");

    // Get assigned users for this order
    const assignedUsers = await db("order_users")
      .leftJoin("users", "order_users.user_id", "users.id")
      .leftJoin("roles", "users.role_id", "roles.id")
      .select(
        "users.id",
        "users.name",
        "users.email",
        "users.mobile",
        "roles.name as role_name"
      )
      .where("order_users.order_id", id)
      .whereNull("order_users.deleted_at");

    return { ...order, status_history: statusHistory, assigned_users: assignedUsers };
  },

  // Get orders by officer ID
  /* getOrdersByOfficer: async (officerId, user) => {
    // Check if user has permission to view this officer's orders
      if (user.role_name.toUpperCase().includes("BANK OFFICER") && user.id !== officerId) {
      return []; // Officers can only see their own orders
    }

    const orders = await db("orders")
      .leftJoin("order_status_master", "orders.current_status_id", "order_status_master.id")
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .leftJoin("users as officer_user", "officers.user_id", "officer_user.id")
      .leftJoin("bank_branch", "officers.branch_id", "bank_branch.id")
      .leftJoin("bank", "bank_branch.bank_id", "bank.id")
      .leftJoin("users as manager", "orders.manager_id", "manager.id")
      .select(
        "orders.id",
        "orders.order_number",
        "orders.customer_name",
        "orders.contact",
        "orders.place_of_inspection",
        "orders.date_of_inspection",
        "orders.current_status_id",
        "order_status_master.name as current_status_name",
        "orders.created_at",
        "officer_user.name as officer_name",
        "bank_branch.name as branch_name",
        "bank.name as bank_name"
      )
      .whereNull("orders.deleted_at")
      .where("orders.officer_id", officerId);

    return orders;
  }, */

  // Find order by order number
  findByOrderNumber: async (orderNumber) => {
    const order = await db("orders")
      .where({ order_number: orderNumber })
      .whereNull("deleted_at")
      .first();
    return order;
  },

  // Create order
  createOrder: async (data) => {
    const [order] = await db("orders").insert(data).returning("*");
    return order;
  },

  // Update order
  updateOrder: async (id, data, userId) => {
    const [order] = await db("orders")
      .where({ id })
      .update({
        ...data,
        updated_at: new Date(),
        updated_by: userId,
      })
      .returning("*");
    return order;
  },

  updatePaymentStatus: async (id, data) => {
    const [order] = await db("orders")
      .where({ id })
      .update({
        payment_status: data.payment_status,
        payment_amount: data.payment_amount,
        payment_mode: data.payment_mode,
      })
      .returning("*");
    return order;
  },

  // Soft delete order
  softDelete: async (id, userId) => {
    await db("orders").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    });
  },

  // Get order status history
  /*   getOrderStatusHistory: async (orderId, user) => {
    // First check if user has access to this order
    const order = await db("orders")
      .select("officer_id", "manager_id", "created_by")
      .where("id", orderId)
      .whereNull("deleted_at")
      .first();

    if (!order) return null;

    // Check user access permissions
    const roleName = user.role_name.toUpperCase();
    
    if (roleName.includes("BANK OFFICER") && order.officer_id !== user.id) {
      return null;
    } else if (roleName.includes("MANAGER") && order.manager_id !== user.id) {
      return null;
    } else if (roleName.includes("BANK AUTHORITY")) {
      if (order.created_by !== user.id && 
          order.officer_id !== user.id && 
          order.manager_id !== user.id) {
        return null;
      }
    }

    const statusHistory = await db("order_status_history")
      .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
      .leftJoin("users", "order_status_history.changed_by", "users.id")
      .select(
        "order_status_history.id",
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

  // Update specific order attributes (partial update)
  updateOrderAttributes: async (orderId, updateData, userId) => {
    // Add updated_by and updated_at to the update data
    const finalUpdateData = {
      ...updateData,
      updated_by: userId,
      updated_at: new Date(),
    };

    // Update the order with the provided attributes
    const [updatedOrder] = await db("orders")
      .where({ id: orderId })
      .update(finalUpdateData)
      .returning("*");

    return updatedOrder;
  },

  // Create order-user assignments (bulk insert)
  createOrderUsers: async (data, trx = db) => {
    // Guard clause
    if (!Array.isArray(data) || data.length === 0) return [];
    return await trx("order_users").insert(data).returning("*");
  },

  // Replace order-user assignments (delete old, insert new)
  replaceOrderUsers: async (order_id, newUserData, trx = db) => {
    // Guard clause
    if (!Array.isArray(newUserData)) return [];
    // Soft delete old assignments
    await trx("order_users")
      .where({ order_id })
      .whereNull("deleted_at")
      .update({
        deleted_at: new Date(),
        deleted_by: newUserData[0]?.created_by || null
      });
    // Insert new assignments if any
    if (newUserData.length === 0) return [];
    return await trx("order_users")
      .insert(newUserData)
      .returning("*");
  },

  // Get assigned users for an order
  getOrderUsers: async (orderId) => {
    const users = await db("order_users")
      .leftJoin("users", "order_users.user_id", "users.id")
      .leftJoin("roles", "users.role_id", "roles.id")
      .select(
        "users.id",
        "users.name",
        "users.email",
        "users.mobile",
        "roles.name as role_name"
      )
      .where("order_users.order_id", orderId)
      .whereNull("order_users.deleted_at");
    return users;
  },
};

module.exports = order;
