const Order = require("../../models/orders/order");
const OrderStatusMaster = require("../../models/orders/orderStatusMaster");
const OrderStatusHistory = require("../../models/orders/orderStatusHistory");
const Officer = require("../../models/user/officer");
const User = require("../../models/user/user");
const mobileAuth = require("../../models/fieldVerifier/mobile_auth");
const db = require("../../../db");

const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");
const {
  getOrderR2SyncStatus,
  isSyncEnabled,
  queueManualR2Sync,
  STATUSES_THAT_TRIGGER_SYNC,
} = require("../../utils/r2Helper");
const { computeR2CoverageForOrder } = require("../../utils/r2CoverageHelper");
const { resolveOrderReportType } = require("../../utils/resolveOrderReportType");
const {
  extractIdentifierTokens,
  identifiersMatch,
} = require("../../utils/registrationIdentifier");

// Helper functions to get names by IDs
async function getUserName(userId) {
  try {
    const user = await db("users").select("name").where("id", userId).first();
    return user ? user.name : null;
  } catch (error) {
    return null;
  }
}

async function getOfficerName(officerId) {
  try {
    const officer = await db("officers")
      .leftJoin("users", "officers.user_id", "users.id")
      .select("users.name")
      .where("officers.id", officerId)
      .first();
    return officer ? officer.name : null;
  } catch (error) {
    return null;
  }
}

async function getFieldVerifierName(fieldVerifierId) {
  try {
    const fieldVerifier = await db("field_verifiers")
      .select("name")
      .where("id", fieldVerifierId)
      .first();
    return fieldVerifier ? fieldVerifier.name : null;
  } catch (error) {
    return null;
  }
}

async function getCategoryName(categoryId) {
  try {
    const category = await db("child_category")
      .select("name")
      .where("id", categoryId)
      .first();
    return category ? category.name : null;
  } catch (error) {
    return null;
  }
}

/**
 * Get Pan India manager ID (case-insensitive search)
 * @returns {number|null} Manager user ID or null if not found
 */
async function getPanIndiaManagerId() {
  try {
    const manager = await db("users")
      .select("id")
      .whereRaw("LOWER(name) = ?", ["pan india"])
      .first();
    return manager ? manager.id : null;
  } catch (error) {
    console.error("Error fetching Pan India manager:", error);
    return null;
  }
}

// Get All Orders based on user role
exports.getAll = async (req, res, next) => {
  try {
    const orders = await Order.getAllOrders(req.user);
    res.json(orders);
  } catch (err) {
    next(err);
  }
};

// Get All Orders that are finalized (status 13) or on hold (status 14) - based on user role
exports.getAllWithWoStatus = async (req, res, next) => {
  try {
    const orders = await Order.getAllOrdersWithWoStatus(req.user, req.query);
    res.json(orders);
  } catch (err) {
    next(err);
  }
};

// Get orders by child category where current_status_id = 13
exports.getByChildCategoryWithFinalizedStatus = async (req, res, next) => {
  try {
    const { child_category_id } = req.params;
    const childCategoryId = parseInt(child_category_id, 10);

    if (Number.isNaN(childCategoryId)) {
      throw new BadRequestError("Invalid child category ID");
    }

    const orders = await db("orders")
      .select("*")
      .where("child_category_id", childCategoryId)
      .where("current_status_id", 13)
      .whereNull("deleted_at")
      .orderBy("id", "desc");

    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: {
        child_category_id: childCategoryId,
        current_status_id: 13,
        total_orders: orders.length,
        orders,
      },
    });
  } catch (err) {
    next(err);
  }
};

// Get All Orders for Mobile App
exports.getForMobile = async (req, res, next) => {
  try {
    // Get field verifier ID from the authenticated user
    const fieldVerifierId = req.verifier.id;

    const completeVerifier = await mobileAuth.findById(fieldVerifierId);

    const orders = await Order.getForMobile(fieldVerifierId);

    if (orders && orders.length > 0) {
      const orderIds = orders.map((order) => order.id);

      // Batch media counts per order (images/videos/rejected) to avoid N+1 queries.
      const mediaCountRows = await db("order_media_image_video")
        .select("order_id")
        .select(
          db.raw("SUM(CASE WHEN media_type = 'image' THEN 1 ELSE 0 END) AS image_count")
        )
        .select(
          db.raw("SUM(CASE WHEN media_type = 'video' THEN 1 ELSE 0 END) AS video_count")
        )
        .select(
          db.raw("SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) AS rejected_count")
        )
        .whereIn("order_id", orderIds)
        .whereNull("deleted_at")
        .groupBy("order_id");

      const mediaCountByOrderId = new Map(
        mediaCountRows.map((row) => [
          Number(row.order_id),
          {
            image_count: Number(row.image_count || 0),
            video_count: Number(row.video_count || 0),
            rejected_count: Number(row.rejected_count || 0),
          },
        ])
      );

      // Batch comments per order for mobile response.
      const commentRows = await db("order_comments")
        .select("order_id", "comment", "commented_at")
        .whereIn("order_id", orderIds)
        .where("user_id", fieldVerifierId)
        .whereIn("user_type", ["field_verifier", "filed_verifier", "filed_varifier"])
        .orderBy("commented_at", "desc");

      const commentsByOrderId = new Map();
      for (const row of commentRows) {
        const key = Number(row.order_id);
        if (!commentsByOrderId.has(key)) commentsByOrderId.set(key, []);
        commentsByOrderId.get(key).push({
          comment_text: row.comment,
          commented_at: row.commented_at,
        });
      }

      // Add mobile_job_status to each order
      const ordersWithStatus = await Promise.all(
        orders.map(async (order) => {
          let mobile_job_status = 0; // Default: Pending
          const counts = mediaCountByOrderId.get(Number(order.id)) || {
            image_count: 0,
            video_count: 0,
            rejected_count: 0,
          };

          // Check if job is started (job_started_at is not null)
          if (order.job_started_at) {
            mobile_job_status = 1; // Accepted
          }

          // Check if current_status_id is 7 (Images Uploaded)
          if (order.current_status_id === 7) {
            mobile_job_status = 2; // Images Uploaded
          }

          // Check if current_status_id is 8 or above (Images Verified)
          if (order.current_status_id >= 8) {
            mobile_job_status = 3; // Images Verified
          }

          const num_of_rejected_img = counts.rejected_count;

          if (num_of_rejected_img > 0) {
            mobile_job_status = 4; // Images Rejected
          }

          return {
            ...order,
            mobile_job_status,
            image_count: counts.image_count,
            video_count: counts.video_count,
            num_of_rejected_img,
            comments: commentsByOrderId.get(Number(order.id)) || [],
          };
        })
      );

      res.json({
        state: 1,
        message: "orders fetch successfully",
        orders: ordersWithStatus,
        verifier: {
          id: completeVerifier.id,
          name: completeVerifier.name,
          username: completeVerifier.username,
          mobile: completeVerifier.mobile,
          city_id: completeVerifier.city_id,
          city_name: completeVerifier.city_name,
          state_id: completeVerifier.state_id,
          state_name: completeVerifier.state_name,
          is_active: completeVerifier.is_active,
        },
      });
    } else {
      res.json({
        state: 0,
        message: "No Orders",
        orders: [],
      });
    }
  } catch (err) {
    next(err);
  }
};

// Get all rejected image/video URLs for an order (mobile – field verifier only)
exports.getRejectedMediaForOrder = async (req, res, next) => {
  try {
    const fieldVerifierId = req.verifier.id;
    const orderId = parseInt(req.params.orderId, 10);

    if (!orderId || Number.isNaN(orderId)) {
      return res.status(400).json({
        state: 0,
        message: "Invalid order ID",
        order_id: null,
        rejected_media: [],
      });
    }

    const order = await db("orders")
      .select("id", "field_verifier_id")
      .where("id", orderId)
      .whereNull("deleted_at")
      .first();

    if (!order) {
      return res.status(404).json({
        state: 0,
        message: "Order not found",
        order_id: orderId,
        rejected_media: [],
      });
    }

    if (order.field_verifier_id !== fieldVerifierId) {
      return res.status(403).json({
        state: 0,
        message: "Not authorized to access this order",
        order_id: orderId,
        rejected_media: [],
      });
    }

    const rejectedRows = await db("order_media_image_video")
      .select("id", "media_url", "media_type")
      .where("order_id", orderId)
      .where("status", 2)
      .orderBy("id", "asc");

    const rejected_media = rejectedRows.map((row) => ({
      id: row.id,
      url: row.media_url,
      media_type: row.media_type,
    }));

    res.json({
      state: 1,
      message: "Rejected media fetched successfully",
      order_id: orderId,
      rejected_media,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Mobile Order Action - Handle field verifier actions
 * POST /api/mobile/order-action
 * Body: { order_id: number, action: "Reassign Telecaller" | "Job started" }
 */
exports.mobileOrderAction = async (req, res, next) => {
  try {
    const { order_id, action } = req.body;
    const fieldVerifierId = req.verifier.id;

    // Validation
    if (!order_id) {
      throw new BadRequestError("order_id is required");
    }

    if (!action) {
      throw new BadRequestError("action is required");
    }

    const validActions = ["Reassign Telecaller", "Job started"];
    if (!validActions.includes(action)) {
      throw new BadRequestError(
        `Invalid action. Must be one of: ${validActions.join(", ")}`
      );
    }

    // Check if order exists
    const order = await db("orders")
      .select("id", "order_number", "current_status_id")
      .where("id", order_id)
      .whereNull("deleted_at")
      .first();

    if (!order) {
      throw new NotFoundError("Order not found");
    }

    // Handle different actions
    if (action === "Reassign Telecaller") {
      // Update order status to 5
      await Order.updateOrder(order_id, {
        current_status_id: 5,
        updated_at: new Date(),
        updated_by: fieldVerifierId,
      });

      // Create status history entry
      const statusHistoryData = {
        order_id: order_id,
        status_id: 5,
        user_type: "field_verifier",
        changed_by: fieldVerifierId,
        changed_at: new Date(),
      };

      await OrderStatusHistory.createStatusHistory(statusHistoryData);

      return res.json({
        state: 1,
        message: "Order status updated to Reassign Telecaller successfully",
      });
    } else if (action === "Job started") {
      // Update orders table with job started timestamp and field verifier
      const currentTime = new Date();
      await Order.updateOrder(
        order_id,
        {
          job_started_at: currentTime,
          job_started_by: fieldVerifierId,
        },
        fieldVerifierId
      );

      // Add status history entry
      const statusHistoryData = {
        order_id: order_id,
        user_type: "field_verifier",
        changed_by: fieldVerifierId,
        changed_at: currentTime,
        activity_extra: "Order approved (Job started)",
      };

      await OrderStatusHistory.createStatusHistory(statusHistoryData);

      return res.json({
        state: 1,
        message: "Job started recorded successfully",
      });
    }
  } catch (err) {
    next(err);
  }
};

// Get Order by ID (with status history)
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id, req.user);

    if (!order) throw new NotFoundError("Order not found");

    res.json(order);
  } catch (err) {
    next(err);
  }
};

// Get order by order number (any status except soft-deleted)
exports.getByOrderNumber = async (req, res, next) => {
  try {
    const orderNumber = String(req.params.orderNumber || "").trim();
    if (!orderNumber) {
      throw new BadRequestError("orderNumber is required");
    }

    const order = await Order.findByOrderNumber(orderNumber);
    if (!order) throw new NotFoundError("Order not found");

    const reportType = resolveOrderReportType(
      order.category_name,
      order.category_report_type || order.report_type
    );

    res.json({
      ...order,
      report_type: reportType,
    });
  } catch (err) {
    next(err);
  }
};

// GET /orders/by-registration?q=
// Match Create Order registration_number using normalized identifier tokens.
exports.searchByRegistrationNumber = async (req, res, next) => {
  try {
    const query = String(req.query.q || req.query.registration_number || "").trim();
    const queryTokens = extractIdentifierTokens(query);

    if (!query || queryTokens.length === 0) {
      return res.json({ data: [], query_tokens: queryTokens });
    }

    const rows = await db("orders")
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .leftJoin("users as officer_user", "officers.user_id", "officer_user.id")
      .leftJoin("bank_branch", "officers.branch_id", "bank_branch.id")
      .leftJoin("bank", "bank_branch.bank_id", "bank.id")
      .select(
        "orders.id",
        "orders.order_number",
        "orders.registration_number",
        "orders.customer_name_2",
        "bank.name as bank_name",
        "officer_user.name as officer_name",
        "orders.created_at"
      )
      .whereNull("orders.deleted_at")
      .whereRaw("NULLIF(BTRIM(orders.registration_number), '') IS NOT NULL")
      .orderBy("orders.created_at", "desc");

    const data = rows
      .filter((row) => identifiersMatch(query, row.registration_number))
      .slice(0, 100)
      .map((row) => ({
        id: row.id,
        order_number: row.order_number,
        registration_number: row.registration_number,
        customer_name_2: row.customer_name_2 || null,
        bank_name: row.bank_name || null,
        officer_name: row.officer_name || null,
      }));

    res.json({ data, query_tokens: queryTokens });
  } catch (err) {
    next(err);
  }
};

exports.getR2SyncStatus = async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    if (!orderId) {
      throw new BadRequestError("Invalid order ID");
    }

    const order = await Order.findById(orderId, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    const status = await getOrderR2SyncStatus(orderId);
    const coverage = await computeR2CoverageForOrder(order);
    res.json({
      success: true,
      data: {
        ...status,
        ...coverage,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Manually queue R2 upload for an order (UI trigger only).
 * POST /api/orders/:id/r2-sync
 */
exports.startR2Sync = async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    if (!orderId) {
      throw new BadRequestError("Invalid order ID");
    }

    const existingOrder = await Order.findById(orderId, req.user);
    if (!existingOrder) {
      throw new NotFoundError("Order not found");
    }

    const statusId = Number(existingOrder.current_status_id);
    if (!STATUSES_THAT_TRIGGER_SYNC.includes(statusId)) {
      throw new BadRequestError(
        "R2 sync is only available for finalized (status 13) or on-hold (status 14) orders"
      );
    }

    if (!isSyncEnabled()) {
      throw new BadRequestError("R2 sync is disabled or not configured on the server");
    }

    queueManualR2Sync(orderId);

    res.status(202).json({
      success: true,
      message: "R2 sync queued",
      order_id: orderId,
    });
  } catch (err) {
    next(err);
  }
};

// Create Order
// CONFIGURATION: Change ORDER_NUMBER_LENGTH below to modify order number length
exports.create = async (req, res, next) => {
  try {
    const {
      customer_name,
      customer_name_2,
      contact,
      alternative_contact,
      supervisor_number,
      driver_number,
      child_category_id,
      officer_id,
      manager_id,
      telecaller_id,
      field_verifier_id,
      registration_number,
      place_of_inspection,
      date_of_inspection,
      created_at,
      number_of_order_duplication,
    } = req.body;
    // Validation - only customer_name and contact are mandatory
    if (!customer_name || !contact) {
      throw new BadRequestError("Customer name and contact are required.");
    }

    // Validate number_of_order_duplication: positive integer only, no decimals
    const duplicationCount =
      number_of_order_duplication != null && number_of_order_duplication !== ""
        ? parseInt(number_of_order_duplication, 10)
        : 1;
    if (
      number_of_order_duplication != null &&
      number_of_order_duplication !== ""
    ) {
      if (
        !Number.isInteger(duplicationCount) ||
        duplicationCount < 1 ||
        Number(number_of_order_duplication) !== duplicationCount
      ) {
        throw new BadRequestError(
          "number_of_order_duplication must be a positive whole number (no decimals)."
        );
      }
      const MAX_DUPLICATION = 100;
      if (duplicationCount > MAX_DUPLICATION) {
        throw new BadRequestError(
          `number_of_order_duplication cannot exceed ${MAX_DUPLICATION}.`
        );
      }
    }

    // Validate officer if provided
    if (officer_id) {
      const officer = await Officer.findById(officer_id);
      if (!officer) throw new BadRequestError("Invalid officer selected");
    }

    // Validate manager if provided
    if (manager_id) {
      const manager = await User.findById(manager_id);
      if (!manager) throw new BadRequestError("Invalid manager selected");
    }

    // Validate telecaller if provided
    if (telecaller_id) {
      const telecaller = await User.findById(telecaller_id);
      if (!telecaller)
        throw new BadRequestError("Invalid telecaller selected");
    }

    // Determine order status based on field_verifier_id, manager_id, supervisor_number, and driver_number
    let orderStatusId;
    let finalManagerId = manager_id;
    const hasSupervisorAndDriver = supervisor_number && driver_number;

    if (field_verifier_id) {
      // If field verifier is assigned, status should be 6 (Field Verifier Assigned)
      orderStatusId = 6;
    } else if (manager_id) {
      // If manager is assigned, status should be 4 (Manager Assigned)
      orderStatusId = 4;
    } else if (hasSupervisorAndDriver) {
      // If both supervisor and driver numbers are set but no manager, status should be 3 (Telecaller Completed)
      orderStatusId = 3;

      // Auto-assign "Pan India" manager if no manager is provided
      if (!manager_id) {
        const panIndiaManagerId = await getPanIndiaManagerId();
        if (panIndiaManagerId) {
          finalManagerId = panIndiaManagerId;
          orderStatusId = 4; // Update status to 4 (Manager Assigned) since we're assigning Pan India
        }
      }
    } else {
      // If supervisor or driver number is missing, status should be 2 (Telecaller Assigned)
      orderStatusId = 2;
    }

    // Generate unique random order number with configurable length
    const ORDER_NUMBER_LENGTH = 9; // Change this number to modify order number length

    const generateOrderNumber = async () => {
      const maxAttempts = 10;
      let attempts = 0;

      while (attempts < maxAttempts) {
        // Generate random characters and numbers
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let orderNumber = "";

        // Generate random order number with specified length
        for (let i = 0; i < ORDER_NUMBER_LENGTH; i++) {
          const randomIndex = Math.floor(Math.random() * characters.length);
          orderNumber += characters[randomIndex];
        }

        // Check if this order number already exists
        const existingOrder = await Order.findByOrderNumber(orderNumber);
        if (!existingOrder) {
          return orderNumber;
        }
        attempts++;
      }
      throw new Error(
        "Unable to generate unique order number after multiple attempts"
      );
    };

    const createdOrderIds = [];

    for (let i = 0; i < duplicationCount; i++) {
      const uniqueOrderNumber = await generateOrderNumber();

      // Create order with determined status (same details for each duplicate)
      const orderData = {
        order_number: uniqueOrderNumber,
        customer_name,
        customer_name_2: customer_name_2 || null,
        contact,
        alternative_contact: alternative_contact || null,
        supervisor_number: supervisor_number || null,
        driver_number: driver_number || null,
        child_category_id: child_category_id || null,
        officer_id: officer_id || null,
        manager_id: finalManagerId || null,
        telecaller_id: telecaller_id || null,
        field_verifier_id: field_verifier_id || null,
        registration_number: registration_number || null,
        place_of_inspection: place_of_inspection || null,
        date_of_inspection: date_of_inspection || null,
        current_status_id: orderStatusId,
        order_type: "VKA1",
        order_priority: "Low",
        created_by: req.user?.id,
        created_at: created_at ? new Date(created_at) : new Date(),
      };

      const order = await Order.createOrder(orderData);
      createdOrderIds.push(order.id);

      // Create status history entries for this order
      const pendingStatusHistory = {
        order_id: order.id,
        status_id: 1, // Order Initiated
        changed_by: req.user?.id,
        changed_at: new Date(),
      };
      await OrderStatusHistory.createStatusHistory(pendingStatusHistory);

      if (field_verifier_id) {
        if (finalManagerId) {
          const managerStatusHistory = {
            order_id: order.id,
            status_id: 4,
            changed_by: req.user?.id,
            changed_at: new Date(),
          };
          await OrderStatusHistory.createStatusHistory(managerStatusHistory);
        }
        const fieldVerifierStatusHistory = {
          order_id: order.id,
          status_id: 6,
          changed_by: req.user?.id,
          changed_at: new Date(),
        };
        await OrderStatusHistory.createStatusHistory(fieldVerifierStatusHistory);
      } else {
        const finalStatusHistory = {
          order_id: order.id,
          status_id: orderStatusId,
          changed_by: req.user?.id,
          changed_at: new Date(),
        };
        await OrderStatusHistory.createStatusHistory(finalStatusHistory);
      }
    }

    res.locals.newRecordId =
      createdOrderIds.length > 0 ? createdOrderIds[createdOrderIds.length - 1] : null;

    // Return single order (backward compatible) or array of enriched orders
    if (duplicationCount === 1) {
      const enrichedOrder = await Order.findById(createdOrderIds[0], req.user);
      res.status(201).json(enrichedOrder);
    } else {
      const enrichedOrders = await Promise.all(
        createdOrderIds.map((id) => Order.findById(id, req.user))
      );
      res.status(201).json(enrichedOrders);
    }
  } catch (err) {
    if (err.code === "23505") {
      return next(new ConflictError("Order number already exists"));
    }
    next(err);
  }
};

// Update Order
exports.update = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const {
      customer_name,
      customer_name_2,
      contact,
      alternative_contact,
      supervisor_number,
      driver_number,
      child_category_id,
      officer_id,
      manager_id,
      telecaller_id,
      field_verifier_id,
      registration_number,
      place_of_inspection,
      date_of_inspection,
      created_at,
    } = req.body;
    /* console.log("req.body", req.body); */
    /* console.log(req.body); */
    // Fetch existing order to check permissions
    const existingOrder = await Order.findById(orderId, req.user);
    if (!existingOrder) throw new NotFoundError("Order not found");

    // Validation - only customer_name and contact are mandatory
    if (!customer_name || !contact) {
      throw new BadRequestError("Customer name and contact are required.");
    }

    // Validate officer if provided
    if (officer_id) {
      const officer = await Officer.findById(officer_id);
      if (!officer) throw new BadRequestError("Invalid officer selected");
    }

    // Validate manager if provided
    if (manager_id) {
      const manager = await User.findById(manager_id);
      if (!manager) throw new BadRequestError("Invalid manager selected");
    }

    // Validate telecaller if provided
    if (telecaller_id) {
      const telecaller = await User.findById(telecaller_id);
      if (!telecaller)
        throw new BadRequestError("Invalid telecaller selected");
    }

    // Check if Telecaller changed place_of_inspection - if yes, reset manager and field verifier
    const isTelecaller = (req.user?.role_name || "")
      .toUpperCase()
      .includes("TELECALLER");
    const placeOfInspectionChanged =
      place_of_inspection !== undefined &&
      place_of_inspection !== existingOrder.place_of_inspection;

    let resetManagerAndFieldVerifier = false;
    if (isTelecaller && placeOfInspectionChanged) {
      resetManagerAndFieldVerifier = true;
    }

    // Determine new order status based on field_verifier_id, manager_id, supervisor_number, and driver_number
    // IMPORTANT: Only update status if current status is lower than the new status
    let newStatusId;
    let finalManagerId =
      manager_id !== undefined ? manager_id : existingOrder.manager_id;

    // Reset manager if Telecaller changed place of inspection
    if (resetManagerAndFieldVerifier) {
      finalManagerId = null;
    }

    const currentSupervisorNumber =
      supervisor_number !== undefined
        ? supervisor_number
        : existingOrder.supervisor_number;
    const currentDriverNumber =
      driver_number !== undefined ? driver_number : existingOrder.driver_number;
    const currentManagerId = finalManagerId;
    let currentFieldVerifierId =
      field_verifier_id !== undefined
        ? field_verifier_id
        : existingOrder.field_verifier_id;

    // Reset field verifier if Telecaller changed place of inspection
    if (resetManagerAndFieldVerifier) {
      currentFieldVerifierId = null;
    }

    const hasSupervisorAndDriver =
      currentSupervisorNumber && currentDriverNumber;

    // If Telecaller changed place_of_inspection and reset manager/field verifier, set status to 3
    if (resetManagerAndFieldVerifier) {
      newStatusId = 3; // Telecaller Completed
    } else if (currentFieldVerifierId) {
      // field verifier is assigned, status should be 6 (Field Verifier Assigned)
      newStatusId = 6;
    } else if (currentManagerId) {
      // manager is assigned, status should be 4 (Manager Assigned)
      newStatusId = 4;
    } else if (hasSupervisorAndDriver) {
      // If both supervisor and driver numbers are set but no manager, status should be 3 (Telecaller Completed)
      newStatusId = 3;

      // Auto-assign "Pan India" manager if no manager is currently set
      if (!currentManagerId && existingOrder.current_status_id < 3) {
        const panIndiaManagerId = await getPanIndiaManagerId();
        if (panIndiaManagerId) {
          finalManagerId = panIndiaManagerId;
          newStatusId = 4; // Update status to 4 (Manager Assigned) since we're assigning Pan India
        }
      }
    } else {
      // If supervisor or driver number is missing, status should be 2 (Telecaller Assigned)
      newStatusId = 2;
    }

    // Only update status if current status is lower than the new calculated status
    // This prevents downgrading from higher statuses (e.g., 6 -> 4)
    // EXCEPTION: If Telecaller changed place_of_inspection, allow status to be reset to 3
    if (
      !resetManagerAndFieldVerifier &&
      existingOrder.current_status_id >= newStatusId
    ) {
      newStatusId = existingOrder.current_status_id;
    }

    // Helper function to handle empty strings for integer fields
    const getIntegerValue = (value, defaultValue) => {
      if (value === undefined || value === null || value === "") {
        return defaultValue;
      }
      return value;
    };

    // Update order - only update fields that are provided
    const updateData = {
      customer_name:
        customer_name !== undefined ? customer_name : existingOrder.customer_name,
      customer_name_2:
        customer_name_2 !== undefined
          ? customer_name_2 || null
          : existingOrder.customer_name_2,
      contact: contact !== undefined ? contact : existingOrder.contact,
      alternative_contact:
        alternative_contact !== undefined
          ? alternative_contact
          : existingOrder.alternative_contact,
      supervisor_number:
        supervisor_number !== undefined
          ? supervisor_number
          : existingOrder.supervisor_number,
      driver_number:
        driver_number !== undefined
          ? driver_number
          : existingOrder.driver_number,
      child_category_id: getIntegerValue(
        child_category_id,
        existingOrder.child_category_id
      ),
      officer_id: getIntegerValue(officer_id, existingOrder.officer_id),
      manager_id: finalManagerId,
      telecaller_id: getIntegerValue(
        telecaller_id,
        existingOrder.telecaller_id
      ),
      field_verifier_id: resetManagerAndFieldVerifier
        ? null
        : getIntegerValue(field_verifier_id, existingOrder.field_verifier_id),
      registration_number:
        registration_number !== undefined
          ? registration_number
          : existingOrder.registration_number,
      place_of_inspection:
        place_of_inspection !== undefined
          ? place_of_inspection
          : existingOrder.place_of_inspection,
      date_of_inspection:
        date_of_inspection !== undefined
          ? date_of_inspection
          : existingOrder.date_of_inspection,
      current_status_id: newStatusId,
      updated_by: req.user?.id,
      updated_at: new Date(),
    };

    // Add created_at to update data if provided (allows manual timestamp override)
    if (created_at) {
      updateData.created_at = new Date(created_at);
    }

    const updatedOrder = await Order.updateOrder(
      orderId,
      updateData,
      req.user?.id
    );

    // Track changes for detailed activity log
    const changes = [];
    let hasStatusChange = false;
    let hasFieldVerifierChange = false;

    // Track if manager and field verifier were reset due to place of inspection change
    if (resetManagerAndFieldVerifier) {
      // First, log the place of inspection change itself
      const oldPlace = existingOrder.place_of_inspection || "empty";
      const newPlace = place_of_inspection || "empty";
      changes.push(
        `PLACE OF INSPECTION changed from "${oldPlace}" to "${newPlace}"`
      );

      // Then log the consequences of this change
      if (existingOrder.manager_id) {
        changes.push(`MANAGER reset (place changed)`);
      }
      if (existingOrder.field_verifier_id) {
        changes.push(`FIELD VERIFIER reset (place changed)`);
        hasFieldVerifierChange = true; // Mark as changed for status history
      }
      // Track that status was reset to 3 (Telecaller Completed)
      if (newStatusId === 3 && existingOrder.current_status_id !== 3) {
        changes.push(`STATUS reset to Telecaller Completed (place changed)`);
        hasStatusChange = true;
      }
    }

    // Check for field changes and build detailed change descriptions
    const fieldsToCheck = [
      "customer_name",
      "customer_name_2",
      "contact",
      "alternative_contact",
      "supervisor_number",
      "driver_number",
      "child_category_id",
      "officer_id",
      "manager_id",
      "registration_number",
      "place_of_inspection",
      "date_of_inspection",
      "created_at",
    ];

    for (const field of fieldsToCheck) {
      // Skip place_of_inspection and manager_id if already logged due to Telecaller reset
      if (
        (field === "place_of_inspection" || field === "manager_id") &&
        resetManagerAndFieldVerifier
      ) {
        continue;
      }

      const newValue = req.body[field];
      if (newValue !== undefined) {
        const oldValue = existingOrder[field];

        // Compare values: for date fields, DB may give a Date object and the payload a string.
        // Converting both to timestamps (milliseconds) lets us compare "same moment" as equal
        // so we only log a change when the actual date/time changed.
        let valuesDiffer = false;
        if (field === "created_at" || field === "date_of_inspection") {
          const oldTime = oldValue != null ? new Date(oldValue).getTime() : null;
          const newTime = newValue != null ? new Date(newValue).getTime() : null;
          valuesDiffer = oldTime !== newTime;
        } else {
          valuesDiffer = oldValue !== newValue;
        }

        if (valuesDiffer) {
          // Format field names for better readability
          const formatFieldName = (fieldName) => {
            const fieldMap = {
              customer_name: "CUSTOMER NAME",
              customer_name_2: "CONTACT PERSON NAME",
              contact: "CONTACT",
              alternative_contact: "ALTERNATIVE CONTACT",
              supervisor_number: "SUPERVISOR NUMBER",
              driver_number: "DRIVER NUMBER",
              child_category_id: "CATEGORY",
              officer_id: "OFFICER",
              manager_id: "MANAGER",
              registration_number: "REGISTRATION NUMBER",
              place_of_inspection: "PLACE OF INSPECTION",
              date_of_inspection: "DATE OF INSPECTION",
              created_at: "CREATED AT",
            };
            return (
              fieldMap[fieldName] || fieldName.replace(/_/g, " ").toUpperCase()
            );
          };

          // Get display values (names instead of IDs for certain fields)
          let displayOldValue, displayNewValue;

          if (field === "manager_id") {
            displayOldValue = oldValue
              ? existingOrder.manager_name || `Manager ${oldValue}`
              : "null";
            displayNewValue = newValue
              ? (await getUserName(newValue)) || `Manager ${newValue}`
              : "null";
          } else if (field === "officer_id") {
            displayOldValue = oldValue
              ? existingOrder.officer_name || `Officer ${oldValue}`
              : "null";
            displayNewValue = newValue
              ? (await getOfficerName(newValue)) || `Officer ${newValue}`
              : "null";
          } else if (field === "child_category_id") {
            displayOldValue = oldValue
              ? existingOrder.child_category_name || `Category ${oldValue}`
              : "null";
            displayNewValue = newValue
              ? (await getCategoryName(newValue)) || `Category ${newValue}`
              : "null";
          } else if (field === "created_at" || field === "date_of_inspection") {
            const formatDateForDisplay = (v) => {
              if (v == null) return "null";
              const d = new Date(v);
              if (isNaN(d.getTime())) return String(v);
              return d.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              });
            };
            displayOldValue = formatDateForDisplay(oldValue);
            displayNewValue = formatDateForDisplay(newValue);
          } else {
            displayOldValue =
              oldValue === null ? "null" : oldValue === "" ? "empty" : oldValue;
            displayNewValue =
              newValue === null ? "null" : newValue === "" ? "empty" : newValue;
          }

          const formattedField = formatFieldName(field);
          changes.push(
            `${formattedField} changed from "${displayOldValue}" to "${displayNewValue}"`
          );
        }
      }
    }

    // Check if field verifier assignment changed (separate from other fields)
    if (
      field_verifier_id !== undefined &&
      field_verifier_id !== existingOrder.field_verifier_id
    ) {
      hasFieldVerifierChange = true;
    }

    // Check if status changed due to supervisor_number, driver_number, or manager_id changes
    if (newStatusId !== existingOrder.current_status_id) {
      hasStatusChange = true;
    }

    // Create status history entries based on changes
    if (hasStatusChange) {
      // If field verifier was assigned and manager is also set, create both status records
      if (hasFieldVerifierChange && currentManagerId) {
        // First create Manager Assigned status (4)
        const managerStatusHistory = {
          order_id: orderId,
          status_id: 4, // Manager Assigned
          changed_by: req.user?.id,
          changed_at: new Date(),
        };
        await OrderStatusHistory.createStatusHistory(managerStatusHistory);

        // Then create Field Verifier Assigned status (6)
        const fieldVerifierStatusHistory = {
          order_id: orderId,
          status_id: 6, // Field Verifier Assigned
          changed_by: req.user?.id,
          changed_at: new Date(),
        };
        await OrderStatusHistory.createStatusHistory(
          fieldVerifierStatusHistory
        );
      } else {
        // Create single status history based on new status
        const statusHistoryData = {
          order_id: orderId,
          status_id: newStatusId,
          changed_by: req.user?.id,
          changed_at: new Date(),
        };
        await OrderStatusHistory.createStatusHistory(statusHistoryData);
      }
    }

    // Create detailed field changes record (if there are field changes)
    if (changes.length > 0) {
      // Join changes and truncate to 255 characters if needed
      let activityExtra = changes.join("; ");
      if (activityExtra.length > 255) {
        activityExtra = activityExtra.substring(0, 252) + "...";
      }

      const statusHistoryData = {
        order_id: orderId,
        activity_extra: activityExtra,
        changed_by: req.user?.id,
        changed_at: new Date(),
      };

      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    }

    // Get enriched updated order data for response
    const enrichedOrder = await Order.findById(orderId, req.user);

    res.status(200).json(enrichedOrder);
  } catch (err) {
    if (err.code === "23505") {
      return next(new ConflictError("Order number already exists"));
    }
    next(err);
  }
};

// Adding payment details (add/update without strict validation)
exports.addingPayment = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const { payment_amount, payment_mode, payment_status } = req.body;

    // Ensure order exists and user has access
    const existingOrder = await Order.findById(orderId, req.user);
    if (!existingOrder) throw new NotFoundError("Order not found");

    const updateData = {
      payment_amount:
        payment_amount !== undefined
          ? payment_amount
          : existingOrder.payment_amount,
      payment_mode:
        payment_mode !== undefined ? payment_mode : existingOrder.payment_mode,
      payment_status:
        payment_status !== undefined
          ? payment_status
          : existingOrder.payment_status,
    };

    const updated = await Order.updatePaymentStatus(
      orderId,
      updateData,
      req.user?.id
    );

    // Log activity in status history for audit trail
    const statusHistoryData = {
      order_id: orderId,
      activity_extra: "Payment Status Updated",
      changed_by: req.user?.id,
      changed_at: new Date(),
    };
    await OrderStatusHistory.createStatusHistory(statusHistoryData);

    res.status(200).json({
      id: updated.id,
      payment_amount: updated.payment_amount,
      payment_mode: updated.payment_mode,
      payment_status: updated.payment_status,
      updated_at: updated.updated_at,
    });
  } catch (err) {
    next(err);
  }
};

// Soft Delete Order
exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id, req.user);
    if (!order) throw new NotFoundError("Order not found");

    await Order.softDelete(id, req.user.id);

    res.status(204).json({ message: "Order deleted successfully." });
  } catch (err) {
    next(err);
  }
};

// Get Orders by Officer ID
/* exports.getByOfficer = async (req, res, next) => {
  try {
    const { officerId } = req.params;
    
    const orders = await Order.getOrdersByOfficer(officerId, req.user);
    
    res.json(orders);
  } catch (err) {
    next(err);
  }
}; */

// Get Order Status History
/* exports.getStatusHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const statusHistory = await Order.getOrderStatusHistory(id, req.user);
    
    if (!statusHistory) throw new NotFoundError("Order not found or access denied");
    
    res.json(statusHistory);
  } catch (err) {
    next(err);
  }
}; */

// Get All Order Statuses (for dropdowns)
/* exports.getAllStatuses = async (req, res, next) => {
  try {
    const statuses = await OrderStatusMaster.getAllStatuses();
    res.json(statuses);
  } catch (err) {
    next(err);
  }
}; */

/**
 * PATCH /orders/:id/attributes
 * Update specific order attributes (flexible partial update)
 * Supports assigning multiple users to an order via user_ids array
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.updateOrderAttributes = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const updateData = req.body;
    const userId = req.user?.id;

    /* console.log("updateData", updateData); */
    // Validate that order exists
    const existingOrder = await Order.findById(orderId, req.user);
    if (!existingOrder) {
      throw new NotFoundError("Order not found");
    }

    // Validate that at least one attribute is provided
    if (!updateData || Object.keys(updateData).length === 0) {
      throw new BadRequestError(
        "At least one attribute must be provided for update"
      );
    }

    // Extract user_ids from updateData (handle separately like officer categories)
    const { user_ids, ...otherUpdateData } = updateData;

    // Remove any system fields that shouldn't be updated directly
    // Note: created_at is allowed if user has permission (handled separately in payload)
    const restrictedFields = [
      "id",
      "order_number",
      "created_by",
      "updated_by",
      "updated_at",
      "deleted_at",
    ];
    const filteredUpdateData = {};

    for (const [key, value] of Object.entries(otherUpdateData)) {
      if (restrictedFields.includes(key)) {
        throw new BadRequestError(
          `Field '${key}' cannot be updated through this endpoint`
        );
      }
      // Include fields with actual values (allow null, empty string, 0, false)
      // Only exclude undefined values
      if (value !== undefined) {
        filteredUpdateData[key] = value;
      }
    }

    // Validate that we have at least one valid field to update (either regular fields or user_ids)
    if (
      Object.keys(filteredUpdateData).length === 0 &&
      user_ids === undefined
    ) {
      throw new BadRequestError("No valid fields provided for update");
    }

    // Track changes for detailed activity log
    const changes = [];

    // Update the order attributes (if any regular fields exist)
    if (Object.keys(filteredUpdateData).length > 0) {
      // Build detailed change descriptions
      for (const [key, newValue] of Object.entries(filteredUpdateData)) {
        const oldValue = existingOrder[key];
        const displayOldValue =
          oldValue === null ? "null" : oldValue === "" ? "empty" : oldValue;
        const displayNewValue =
          newValue === null ? "null" : newValue === "" ? "empty" : newValue;

        if (oldValue !== newValue) {
          // Format field names for better readability
          const formatFieldName = (fieldName) => {
            const fieldMap = {
              order_priority: "ORDER PRIORITY",
              order_type: "ORDER TYPE",
              valuer_name: "VALUER NAME",
            };
            return (
              fieldMap[fieldName] || fieldName.replace(/_/g, " ").toUpperCase()
            );
          };

          const formattedKey = formatFieldName(key);
          changes.push(
            `${formattedKey} changed from "${displayOldValue}" to "${displayNewValue}"`
          );
        }
      }

      await Order.updateOrderAttributes(orderId, filteredUpdateData, userId);
    }

    // Handle user assignments - always process if user_ids is provided, even if empty array
    if (user_ids !== undefined) {
      // Validate that user_ids is an array
      if (!Array.isArray(user_ids)) {
        throw new BadRequestError("user_ids must be an array");
      }

      // Validate all user IDs exist (only if array is not empty)
      if (user_ids.length > 0) {
        const users = await User.findManyByIds(user_ids);
        if (users.length !== user_ids.length) {
          throw new BadRequestError("One or more invalid user IDs provided");
        }
      }

      // Get old assigned users for comparison
      const oldAssignedUsers = existingOrder.assigned_users || [];
      const oldUserIds = oldAssignedUsers.map((u) => u.id);

      // Prepare user assignments data (even if empty array)
      const usersToInsert = user_ids.map((uid) => ({
        order_id: orderId,
        user_id: uid,
        created_by: userId,
        created_at: new Date(),
      }));

      // Replace existing user assignments (this will delete all and insert new ones)
      await Order.replaceOrderUsers(orderId, usersToInsert);

      // Build user assignment change description
      if (user_ids.length === 0 && oldUserIds.length > 0) {
        changes.push(`All user assignments removed`);
      } else if (oldUserIds.length === 0 && user_ids.length > 0) {
        // Get user names for the newly assigned users
        const assignedUsers = await User.findManyByIds(user_ids);
        const userNames = assignedUsers.map((u) => u.name).join(", ");
        changes.push(`${userNames} assigned`);
      } else if (
        JSON.stringify(oldUserIds.sort()) !== JSON.stringify(user_ids.sort())
      ) {
        // Find added and removed users
        const addedUserIds = user_ids.filter((id) => !oldUserIds.includes(id));
        const removedUserIds = oldUserIds.filter(
          (id) => !user_ids.includes(id)
        );

        // Get user names for added users
        if (addedUserIds.length > 0) {
          const addedUsers = await User.findManyByIds(addedUserIds);
          const addedUserNames = addedUsers.map((u) => u.name).join(", ");
          changes.push(`${addedUserNames} assigned To order Assign List`);
        }

        // Get user names for removed users
        if (removedUserIds.length > 0) {
          const removedUsers = await User.findManyByIds(removedUserIds);
          const removedUserNames = removedUsers.map((u) => u.name).join(", ");
          changes.push(`${removedUserNames} removed From order Assign List`);
        }
      }
    }

    // Get the complete updated order with all relationships for response
    const enrichedOrder = await Order.findById(orderId, req.user);

    // Log the activity with detailed changes
    if (changes.length > 0) {
      const statusHistoryData = {
        order_id: orderId,
        activity_extra: changes.join("; "),
        changed_by: userId,
        changed_at: new Date(),
      };

      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    }

    res.status(200).json({
      success: true,
      message: "Order attributes updated successfully",
      data: enrichedOrder,
      changes: changes,
    });
  } catch (err) {
    if (err.code === "23505") {
      return next(new ConflictError("Order number already exists"));
    }
    next(err);
  }
};

/**
 * Update Order Status to 10
 * PATCH /api/orders/:id/update-status-unser-review
 */
exports.updateStatusToUnderReview = async (req, res, next) => {
  try {
    const { id: orderId } = req.params;
    const { id: userId } = req.user;

    // Fetch existing order to check if it exists
    const existingOrder = await Order.findById(orderId, req.user);
    if (!existingOrder) {
      throw new NotFoundError("Order not found");
    }

    // Update order status to 10
    await Order.updateOrder(orderId, {
      current_status_id: 10,
      updated_at: new Date(),
      updated_by: userId,
    });

    // Create status history entry
    const statusHistoryData = {
      order_id: orderId,
      status_id: 10,
      changed_by: userId,
      changed_at: new Date(),
    };

    await OrderStatusHistory.createStatusHistory(statusHistoryData);

    res.status(200).json({
      success: true,
      message: "Order status updated to Under Review successfully",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update Order Status (Generic - accepts any status_id)
 * PATCH /api/orders/:id/update-status-after-under-review
 * Body: { status_id: number }
 */
exports.updateOrderStatusAfterUnderReview = async (req, res, next) => {
  try {
    const { id: orderId } = req.params;
    const { status_id } = req.body;
    const { id: userId } = req.user;

    // Validation
    if (!status_id) {
      throw new BadRequestError("status_id is required in request body");
    }

    if (isNaN(parseInt(status_id))) {
      throw new BadRequestError("status_id must be a valid number");
    }

    const statusIdNum = parseInt(status_id);

    // Fetch existing order to check if it exists
    const existingOrder = await Order.findById(orderId, req.user);
    if (!existingOrder) {
      throw new NotFoundError("Order not found");
    }

    // Validate that the status exists in order_status_master table
    const statusExists = await OrderStatusMaster.findById(statusIdNum);
    if (!statusExists) {
      throw new BadRequestError(`Status ID ${statusIdNum} does not exist`);
    }

    // Update order status
    await Order.updateOrder(orderId, {
      current_status_id: statusIdNum,
      updated_at: new Date(),
      updated_by: userId,
    });

    // Create status history entry
    const statusHistoryData = {
      order_id: orderId,
      status_id: statusIdNum,
      changed_by: userId,
      changed_at: new Date(),
    };

    await OrderStatusHistory.createStatusHistory(statusHistoryData);

    res.status(200).json({
      success: true,
      message: `Order status updated to ${statusIdNum} successfully`,
      data: {
        order_id: orderId,
        new_status_id: statusIdNum,
        status_name: statusExists.name,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Directly update order status with history + notifications
 * PATCH /api/orders/:id/update-status-direct
 * Body: { status_id: number, note?: string }
 */
exports.updateOrderStatusDirect = async (req, res, next) => {
  try {
    const { id: orderId } = req.params;
    const { status_id, note } = req.body;
    const { id: userId } = req.user;

    // Validate input
    if (status_id === undefined || status_id === null) {
      throw new BadRequestError("status_id is required in request body");
    }

    const statusIdNum = Number(status_id);
    if (!Number.isInteger(statusIdNum)) {
      throw new BadRequestError("status_id must be a valid integer");
    }

    // Ensure order exists
    const existingOrder = await Order.findById(orderId, req.user);
    if (!existingOrder) {
      throw new NotFoundError("Order not found");
    }

    // Validate status exists
    const statusExists = await OrderStatusMaster.findById(statusIdNum);
    if (!statusExists) {
      throw new BadRequestError(`Status ID ${statusIdNum} does not exist`);
    }

    // Update order status
    await Order.updateOrder(orderId, {
      current_status_id: statusIdNum,
      updated_at: new Date(),
      updated_by: userId,
    });

    // Record status history (this will also trigger notifications via model hook)
    const historyEntry = await OrderStatusHistory.createStatusHistory({
      order_id: orderId,
      status_id: statusIdNum,
      changed_by: userId,
      changed_at: new Date(),
      activity_extra: note || null,
    });

    res.status(200).json({
      success: true,
      message: `Order status updated to ${statusIdNum} successfully`,
      data: {
        order_id: Number(orderId),
        new_status_id: statusIdNum,
        status_name: statusExists.name,
        status_history_id: historyEntry?.id || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Send email with order documents and videos
 * POST /api/orders/:orderId/send-mail
 * Body: { to: [], cc: [], bcc: [], subject: string, comments: string, regards: string, document_ids: [], video_ids: [], mail_attachment?: boolean }
 */
exports.sendMail = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const {
      to,
      cc,
      bcc,
      subject,
      comments,
      regards,
      document_ids,
      video_ids,
      mail_attachment,
      all_documents_in_one,
      collage_compress,
      public_url,
      public_link_with_image,
      customer_name,
      asset_identification_number,
      show_table,
      show_qrcode,
      sr_no,
    } =
      req.body;
    /* console.log("public_url", req.body.public_url); */

    // Validate order exists
    const order = await Order.findById(orderId, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    // Validate required fields
    if (!to || !Array.isArray(to) || to.length === 0) {
      throw new BadRequestError(
        "'to' field is required and must be a non-empty array"
      );
    }

    if (!subject || typeof subject !== "string" || subject.trim() === "") {
      throw new BadRequestError(
        "'subject' field is required and must be a non-empty string"
      );
    }

    if (cc !== undefined && !Array.isArray(cc)) {
      throw new BadRequestError("'cc' must be an array");
    }

    if (bcc !== undefined && !Array.isArray(bcc)) {
      throw new BadRequestError("'bcc' must be an array");
    }

    if (document_ids !== undefined && !Array.isArray(document_ids)) {
      throw new BadRequestError("'document_ids' must be an array");
    }

    if (video_ids !== undefined && !Array.isArray(video_ids)) {
      throw new BadRequestError("'video_ids' must be an array");
    }

    if (public_url !== undefined && (typeof public_url !== "string" || public_url.trim() === "")) {
      throw new BadRequestError("'public_url' must be a non-empty string if provided");
    }

    // Import email service and models
    const { sendEmail } = require("../../utils/emailService");
    const orderMediaDocument = require("../../models/orders/orderMediaDocument");
    const orderMediaPortal = require("../../models/orders/orderMediaPortal");
    const fs = require("fs");
    const path = require("path");
    const os = require("os");
    const { v4: uuidv4 } = require("uuid");
    const {
      isImageFile,
      isPdfFile,
      compressImageForEmail,
      compressPdfForEmail,
      generateCompressedPdf,
    } = require("../../utils/imageCompressor");

    const baseUrl =
      process.env.APP_BASE_URL ||
      process.env.FRONTEND_URL ||
      `${req.protocol}://${req.get("host")}`;
    const frontendBaseUrl =
      process.env.PUBLIC_SHARE_BASE_URL ||
      process.env.FRONTEND_URL ||
      baseUrl;

    const getOrCreatePublicShareToken = async (targetOrderId) => {
      const existing = await db("order_public_share_links")
        .select("token")
        .where({ order_id: targetOrderId, is_active: true })
        .first();
      if (existing?.token) return existing.token;

      for (let attempt = 0; attempt < 5; attempt++) {
        const token = require("crypto").randomBytes(24).toString("hex");
        try {
          await db("order_public_share_links").insert({
            order_id: targetOrderId,
            token,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          });
          return token;
        } catch (err) {
          if (err && err.code === "23505") continue; // unique conflict, retry
          throw err;
        }
      }
      throw new BadRequestError("Unable to generate public share link");
    };

    const toMaskedPublicUrl = async (rawPublicUrl) => {
      if (typeof rawPublicUrl !== "string" || !rawPublicUrl.trim()) return null;
      const value = rawPublicUrl.trim();
      const match = value.match(/\/public\/orders\/(\d+)\/(documents|images)(?:$|[/?#])/i);
      if (!match) return value; // keep caller-provided non-standard URL unchanged

      const targetOrderId = parseInt(match[1], 10);
      const pageType = String(match[2]).toLowerCase();
      if (Number.isNaN(targetOrderId) || targetOrderId !== parseInt(orderId, 10)) {
        throw new BadRequestError("public_url order id does not match request orderId");
      }

      const token = await getOrCreatePublicShareToken(targetOrderId);
      return `${frontendBaseUrl}/public/share/${token}/${pageType}`;
    };

    const tempAttachmentPaths = [];

    const toExternalMediaUrl = (mediaUrl) => {
      if (!mediaUrl || typeof mediaUrl !== "string") return null;
      if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl;
      const relativeUrl = mediaUrl.startsWith("/") ? mediaUrl : `/${mediaUrl}`;
      return `${baseUrl}${relativeUrl}`;
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const fetchWithRetry = async (url, attempts = 5, timeoutMs = 15000) => {
      let lastError = null;

      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const requestUrl =
              attempt > 1
                ? `${url}${url.includes("?") ? "&" : "?"}_retry=${Date.now()}_${attempt}`
                : url;
            const response = await fetch(requestUrl, { signal: controller.signal });
            if (response.ok) {
              return response;
            }

            const status = Number(response.status || 0);
            // Retry only transient statuses; fail fast for hard client errors.
            const retryable = status === 429 || status >= 500;
            if (!retryable) {
              throw new BadRequestError(
                `Unable to fetch attachment source (HTTP ${status})`
              );
            }
            lastError = new Error(`HTTP ${status}`);
          } finally {
            clearTimeout(timeout);
          }
        } catch (error) {
          // Preserve explicit validation errors as-is.
          if (error instanceof BadRequestError) {
            throw error;
          }
          lastError = error;
        }

        if (attempt < attempts) {
          await sleep(500 * attempt);
        }
      }

      throw new BadRequestError(
        `Unable to fetch attachment source after retries (${String(
          lastError?.message || "unknown error"
        )})`
      );
    };

    const prepareAttachmentPath = async (
      mediaUrl,
      fallbackFilename = "file.bin",
      options = {}
    ) => {
      const allowRemoteHrefFallback = options.allowRemoteHrefFallback !== false;
      if (!mediaUrl || typeof mediaUrl !== "string") {
        throw new BadRequestError("Invalid media_url for attachment");
      }

      // Remote source (R2/public URL) -> download to temp file first.
      if (/^https?:\/\//i.test(mediaUrl)) {
        try {
          const response = await fetchWithRetry(mediaUrl, 3, 15000);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const extFromUrl = path.extname(mediaUrl.split("?")[0]) || "";
          const extFromFallback = path.extname(fallbackFilename) || "";
          const finalExt = extFromFallback || extFromUrl || ".bin";
          const tempDir = path.join(process.cwd(), "uploads", "temp_email");
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          const tempPath = path.join(
            tempDir,
            `remote_${uuidv4()}${finalExt}`
          );
          fs.writeFileSync(tempPath, buffer);
          tempAttachmentPaths.push(tempPath);
          return { path: tempPath, isTemporary: true };
        } catch (downloadError) {
          // Final fallback: keep mail flow alive by attaching via remote URL.
          // Compression/merge is skipped for this item because local bytes are unavailable.
          console.warn(
            `Attachment download failed, using remote href fallback: ${downloadError.message}`
          );
          if (allowRemoteHrefFallback) {
            return {
              path: null,
              href: mediaUrl,
              isRemote: true,
              isTemporary: false,
            };
          }
          throw downloadError;
        }
      }

      // Local source (/uploads/...) -> absolute path on disk.
      const mediaPath = mediaUrl.startsWith("/") ? mediaUrl.substring(1) : mediaUrl;
      const absolutePath = path.isAbsolute(mediaPath)
        ? mediaPath
        : path.join(process.cwd(), mediaPath);
      return { path: absolutePath, isTemporary: false };
    };

    // Normalize boolean-ish inputs
    const normalizeBool = (val, fieldName = "value") => {
      if (val === undefined || val === null) return null;
      if (typeof val === "boolean") return val;
      if (typeof val === "string") {
        const v = val.trim().toLowerCase();
        if (["true", "1", "yes", "y"].includes(v)) return true;
        if (["false", "0", "no", "n"].includes(v)) return false;
      }
      throw new BadRequestError(`${fieldName} must be boolean (true/false)`);
    };

    const video_as_attachment =
      (process.env.EMAIL_VIDEO_AS_ATTACHMENT || "false").toLowerCase() ===
      "true";

    // Request-level override for document attachment behavior
    const mailAttachmentOverride = normalizeBool(mail_attachment, "mail_attachment");
    const allDocumentsInOne = normalizeBool(
      all_documents_in_one,
      "all_documents_in_one"
    ) === true;
    const collageCompressEnabled = normalizeBool(
      collage_compress,
      "collage_compress"
    ) === true;
    const collageCompressTargetMbRaw = Number(
      process.env.COLLAGE_COMPRESS_TARGET_MB
    );
    const collageCompressTargetMb =
      Number.isFinite(collageCompressTargetMbRaw) &&
        collageCompressTargetMbRaw > 0
        ? collageCompressTargetMbRaw
        : 0.3; // Default 300KB target
    const document_as_attachment =
      mailAttachmentOverride !== null
        ? mailAttachmentOverride
        : (process.env.EMAIL_DOCUMENT_AS_ATTACHMENT || "true").toLowerCase() ===
        "true";

    const titleCase = (value) =>
      (value || "")
        .split(/\s|_/)
        .filter(Boolean)
        .map(
          (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        )
        .join(" ");

    const attachments = [];
    let documentAttachmentCount = 0;

    const videoLinks = [];
    if (video_ids && video_ids.length > 0) {
      const videoPromises = video_ids.map((videoId) =>
        orderMediaPortal.findById(parseInt(videoId))
      );
      const videos = await Promise.all(videoPromises);

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const videoId = video_ids[i];

        if (!video) {
          throw new BadRequestError(`Video with ID ${videoId} not found`);
        }

        if (video.order_id !== parseInt(orderId)) {
          throw new BadRequestError(
            `Video with ID ${videoId} does not belong to order ${orderId}`
          );
        }

        if (video.media_type !== "video") {
          throw new BadRequestError(`Media with ID ${videoId} is not a video`);
        }

        const filename = path.basename(video.media_url);
        const fullUrl = toExternalMediaUrl(video.media_url);

        videoLinks.push({ filename, url: fullUrl });

        if (video_as_attachment) {
          const prepared = await prepareAttachmentPath(video.media_url, filename);
          attachments.push({
            path: prepared.path,
            href: prepared.href,
            filename,
            isTemporary: prepared.isTemporary,
          });
        }
      }
    }

    const documentAttachments = [];
    const documentLinkGroups = new Map();
    let documentLinkCount = 0;
    const mergeableReports = [];
    const mergeableCollages = [];
    const tempMergedPdfPaths = [];
    const tempMergeSourcePaths = [];
    const tempCompressionHelperPaths = [];

    if (document_ids && document_ids.length > 0) {
      const documentPromises = document_ids.map((docId) =>
        orderMediaDocument.findById(parseInt(docId))
      );
      const documents = await Promise.all(documentPromises);

      for (let i = 0; i < documents.length; i++) {
        const document = documents[i];
        const docId = document_ids[i];

        if (!document) {
          throw new BadRequestError(`Document with ID ${docId} not found`);
        }

        if (document.order_id !== parseInt(orderId)) {
          throw new BadRequestError(
            `Document with ID ${docId} does not belong to order ${orderId}`
          );
        }

        const filename = path.basename(document.media_url);

        if (document_as_attachment) {
          const prepared = await prepareAttachmentPath(
            document.media_url,
            filename,
            {
              // Compression must operate on local bytes.
              // Do not silently fallback to href for collages when compression is requested.
              allowRemoteHrefFallback: !(
                document.document_type === "collage" && collageCompressEnabled
              ),
            }
          );
          if (prepared.isRemote && prepared.href) {
            documentAttachments.push({
              path: null,
              href: prepared.href,
              filename,
              isTemporary: false,
            });
            documentAttachmentCount++;
            continue;
          }
          const fullPath = prepared.path;

          const isMergeable =
            document.document_type === "report" || document.document_type === "collage";
          const shouldCompressCollageIndividually =
            document.document_type === "collage" &&
            document_as_attachment &&
            collageCompressEnabled;

          if (isMergeable && allDocumentsInOne) {
            // For merge mode, collage compression can still be applied before merge.
            let sourcePdfPath = fullPath;
            let sourceIsTemporary = prepared.isTemporary || sourcePdfPath !== fullPath;

            if (shouldCompressCollageIndividually) {
              try {
                if (isPdfFile(fullPath)) {
                  const result = await compressPdfForEmail(
                    fullPath,
                    collageCompressTargetMb
                  );
                  sourcePdfPath = result.path;
                  // For some remote collage PDFs, extraction can fail.
                  // Use companion JPG (<same path>.jpg) as a reliable fallback source.
                  if (
                    sourcePdfPath === fullPath &&
                    /^https?:\/\//i.test(document.media_url || "")
                  ) {
                    const companionImageUrl = String(document.media_url).replace(
                      /\.pdf(\?.*)?$/i,
                      ".jpg"
                    );
                    if (companionImageUrl !== document.media_url) {
                      const companionPrepared = await prepareAttachmentPath(
                        companionImageUrl,
                        filename.replace(/\.pdf$/i, ".jpg"),
                        { allowRemoteHrefFallback: false }
                      );
                      const compressedCompanionImage = await compressImageForEmail(
                        companionPrepared.path,
                        collageCompressTargetMb
                      );
                      if (compressedCompanionImage !== companionPrepared.path) {
                        tempCompressionHelperPaths.push(compressedCompanionImage);
                      }
                      const tempDir = path.join(process.cwd(), "uploads", "temp_email");
                      if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                      }
                      const rebuiltPdfPath = path.join(
                        tempDir,
                        `rebuilt_${uuidv4()}_${path.basename(filename, ".pdf")}.pdf`
                      );
                      await generateCompressedPdf(compressedCompanionImage, rebuiltPdfPath);
                      sourcePdfPath = rebuiltPdfPath;
                      tempMergeSourcePaths.push(rebuiltPdfPath);
                    }
                  }
                } else if (isImageFile(fullPath)) {
                  sourcePdfPath = await compressImageForEmail(
                    fullPath,
                    collageCompressTargetMb
                  );
                }
                sourceIsTemporary = sourceIsTemporary || sourcePdfPath !== fullPath;
                if (sourcePdfPath !== fullPath) {
                  tempMergeSourcePaths.push(sourcePdfPath);
                }
              } catch (compressionError) {
                console.error(
                  `Failed to compress collage ${filename} before merge:`,
                  compressionError.message
                );
                sourcePdfPath = fullPath;
                sourceIsTemporary = prepared.isTemporary;
              }
            }

            if (document.document_type === "report") {
              mergeableReports.push({
                docId,
                sourcePdfPath,
                filename,
                isTemporary: sourceIsTemporary,
              });
            } else {
              mergeableCollages.push({
                docId,
                sourcePdfPath,
                filename,
                isTemporary: sourceIsTemporary,
              });
            }
          } else {
            // Send as individual attachment (default behavior when
            // `all_documents_in_one` is false, and for non-mergeable docs).
            let finalAttachmentPath = fullPath;
            let finalIsTemporary = prepared.isTemporary;

            if (shouldCompressCollageIndividually) {
              try {
                if (isPdfFile(fullPath)) {
                  const result = await compressPdfForEmail(
                    fullPath,
                    collageCompressTargetMb
                  );
                  finalAttachmentPath = result.path;
                  if (
                    finalAttachmentPath === fullPath &&
                    /^https?:\/\//i.test(document.media_url || "")
                  ) {
                    const companionImageUrl = String(document.media_url).replace(
                      /\.pdf(\?.*)?$/i,
                      ".jpg"
                    );
                    if (companionImageUrl !== document.media_url) {
                      const companionPrepared = await prepareAttachmentPath(
                        companionImageUrl,
                        filename.replace(/\.pdf$/i, ".jpg"),
                        { allowRemoteHrefFallback: false }
                      );
                      const compressedCompanionImage = await compressImageForEmail(
                        companionPrepared.path,
                        collageCompressTargetMb
                      );
                      if (compressedCompanionImage !== companionPrepared.path) {
                        tempCompressionHelperPaths.push(compressedCompanionImage);
                      }
                      const tempDir = path.join(process.cwd(), "uploads", "temp_email");
                      if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                      }
                      const rebuiltPdfPath = path.join(
                        tempDir,
                        `rebuilt_${uuidv4()}_${path.basename(filename, ".pdf")}.pdf`
                      );
                      await generateCompressedPdf(compressedCompanionImage, rebuiltPdfPath);
                      finalAttachmentPath = rebuiltPdfPath;
                    }
                  }
                } else if (isImageFile(fullPath)) {
                  finalAttachmentPath = await compressImageForEmail(
                    fullPath,
                    collageCompressTargetMb
                  );
                }
                finalIsTemporary =
                  finalIsTemporary || finalAttachmentPath !== fullPath;
              } catch (compressionError) {
                console.error(
                  `Failed to compress collage ${filename}:`,
                  compressionError.message
                );
                finalAttachmentPath = fullPath;
              }
            }

            documentAttachments.push({
              path: finalAttachmentPath,
              filename,
              isTemporary: finalIsTemporary,
            });
            documentAttachmentCount++;
          }
        } else {
          const fullUrl = toExternalMediaUrl(document.media_url);
          const category = titleCase(document.document_type || "Documents");

          if (!documentLinkGroups.has(category)) {
            documentLinkGroups.set(category, []);
          }

          documentLinkGroups.get(category).push({ filename, url: fullUrl });
          documentLinkCount++;
        }
      }
    }

    // If user requested attachments, merge selected report + collage PDFs into one PDF.
    // Order: (all selected reports sorted by id desc) first, then (all selected collages sorted by id desc).
    if (
      document_as_attachment &&
      allDocumentsInOne &&
      (mergeableReports.length > 0 || mergeableCollages.length > 0)
    ) {
      mergeableReports.sort((a, b) => b.docId - a.docId);
      mergeableCollages.sort((a, b) => b.docId - a.docId);

      const mergeSources = [...mergeableReports, ...mergeableCollages];

      try {
        const { PDFDocument } = require("pdf-lib");
        const mergedPdf = await PDFDocument.create();

        for (const src of mergeSources) {
          const pdfBytes = fs.readFileSync(src.sourcePdfPath);
          const pdfDoc = await PDFDocument.load(pdfBytes, {
            ignoreEncryption: true,
          });
          const pageIndices = pdfDoc.getPageIndices();
          const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices);
          copiedPages.forEach((p) => mergedPdf.addPage(p));
        }

        const mergedBytes = await mergedPdf.save();

        const tempDir = path.join(process.cwd(), "uploads", "temp_email");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const mergedFilename = `merged_order_${order.order_number || orderId}_${Date.now()}.pdf`;
        const mergedPath = path.join(tempDir, mergedFilename);

        fs.writeFileSync(mergedPath, mergedBytes);

        tempMergedPdfPaths.push(mergedPath);

        documentAttachments.push({
          path: mergedPath,
          filename: mergedFilename,
          isTemporary: true,
        });
        documentAttachmentCount++;
      } catch (mergeError) {
        console.error(
          "Failed to merge report/collage PDFs, falling back to individual attachments:",
          mergeError.message
        );

        // Fallback: attach the individual PDFs (no merging), best-effort.
        for (const src of mergeSources) {
          documentAttachments.push({
            path: src.sourcePdfPath,
            filename: src.filename,
            isTemporary: src.isTemporary === true,
          });
          documentAttachmentCount++;
        }
      }
    }

    attachments.push(...documentAttachments); let emailBody = comments ? `${comments.trim()}` : "";

    const resolvedPublicUrl = await toMaskedPublicUrl(public_url);
    // Check if public_url is provided and not null
    const hasPublicUrl =
      resolvedPublicUrl &&
      typeof resolvedPublicUrl === "string" &&
      resolvedPublicUrl.trim() !== "";

    const safeSrNo = sr_no != null && String(sr_no).trim() !== "" ? String(sr_no).trim() : "1";

    let qrCodeCid = "";
    if (hasPublicUrl) {
      const safePublicUrl = resolvedPublicUrl.trim();
      const showCustomer = customer_name && customer_name.trim() !== "";
      const showAsset = asset_identification_number && asset_identification_number.trim() !== "";

      const shouldShowTable = typeof show_table === "boolean" ? show_table : false;
      const shouldShowQr = typeof show_qrcode === "boolean" ? show_qrcode : false;

      // Generate QR Code Buffer dynamically and attach it (only if qr is enabled)
      if (shouldShowQr) {
        try {
          const QRCode = require("qrcode");
          const qrBuffer = await QRCode.toBuffer(safePublicUrl, {
            width: 120,
            margin: 1,
            errorCorrectionLevel: "M",
          });
          const tempDir = path.join(process.cwd(), "uploads", "temp_email");
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          const tempPath = path.join(tempDir, `qr_${uuidv4()}.png`);
          fs.writeFileSync(tempPath, qrBuffer);
          tempAttachmentPaths.push(tempPath);

          qrCodeCid = `qrcode_${Date.now()}`;
          attachments.push({
            path: tempPath,
            filename: "qrcode.png",
            cid: qrCodeCid,
          });
        } catch (qrError) {
          console.error("Failed to generate QR code:", qrError.message);
        }
      }

      if (shouldShowTable) {
        emailBody += `${emailBody ? "\n\n" : ""}`;

        let textHeaders = ["No"];
        let textValues = [safeSrNo];

        if (showCustomer) {
          textHeaders.push("Customer");
          textValues.push(customer_name.trim());
        }

        if (showAsset) {
          textHeaders.push("Asset Identification Number");
          textValues.push(asset_identification_number.trim());
        }

        textHeaders.push("Link");
        textValues.push(safePublicUrl);

        emailBody += textHeaders.join(" | ") + "\n";
        emailBody += textValues.join(" | ");
      }
    } else {
      // If no public_url, use existing behavior (document links and video links)
      if (!document_as_attachment && documentLinkGroups.size > 0) {
        for (const [category, links] of documentLinkGroups.entries()) {
          const list = links
            .map((item) => `- ${item.filename}: ${item.url}`)
            .join("\n");
          emailBody += `${emailBody ? "\n\n" : ""}${category}:\n${list}`;
        }
      }

      if (videoLinks.length > 0) {
        const videoListText = videoLinks
          .map((video) => `- ${video.filename}: ${video.url}`)
          .join("\n");
        emailBody += `${emailBody ? "\n\n" : ""}Video links:\n${videoListText}`;
      }
    }

    /* if (!emailBody) {
      emailBody = `Please find attached files for order ${order.order_number || orderId
        }.`;
    } */

    // Append regards at the end (plain text), if provided
    if (regards && typeof regards === "string" && regards.trim() !== "") {
      emailBody += `${emailBody ? "\n\n" : ""}Regards,\n${regards.trim()}`;
    }

    let htmlEmailBody = comments ? comments.replace(/\n/g, "<br>") : "";

    if (hasPublicUrl) {
      // If public_url exists, construct a styled HTML table dynamically based on field presence
      const safePublicUrl = resolvedPublicUrl.trim();
      const showCustomer = customer_name && customer_name.trim() !== "";
      const showAsset = asset_identification_number && asset_identification_number.trim() !== "";

      const shouldShowTable = typeof show_table === "boolean" ? show_table : false;
      const shouldShowQr = typeof show_qrcode === "boolean" ? show_qrcode : false;

      if (shouldShowTable) {
        let headers = [];
        let spacerRowCells = [];
        let dataRowCells = [];

        // "No" is always shown
        headers.push('<th style="border: 1px solid #7f7f7f; padding: 2px 1px; text-align: center; font-weight: bold; width: 5%;">No</th>');
        spacerRowCells.push('<td style="border: 1px solid #7f7f7f; padding: 2px 1px;">&nbsp;</td>');
        dataRowCells.push(`<td style="border: 1px solid #7f7f7f; padding: 2px 1px; text-align: center;">${safeSrNo}</td>`);

        if (showCustomer) {
          headers.push(`<th style="border: 1px solid #7f7f7f; padding: 2px 1px; text-align: center; font-weight: bold; width: ${showAsset ? "20%" : "30%"};">Customer</th>`);
          spacerRowCells.push('<td style="border: 1px solid #7f7f7f; padding: 2px 1px;">&nbsp;</td>');
          dataRowCells.push(`<td style="border: 1px solid #7f7f7f; padding: 2px 1px;">${customer_name.trim()}</td>`);
        }

        if (showAsset) {
          headers.push(`<th style="border: 1px solid #7f7f7f; padding: 2px 1px; text-align: center; font-weight: bold; width: ${showCustomer ? "15%" : "25%"};">Asset Identification Number</th>`);
          spacerRowCells.push('<td style="border: 1px solid #7f7f7f; padding: 2px 1px;">&nbsp;</td>');
          dataRowCells.push(`<td style="border: 1px solid #7f7f7f; padding: 2px 1px; text-align: center;">${asset_identification_number.trim()}</td>`);
        }

        // "Link" is always shown
        let linkWidth = "60%";
        if (!showCustomer && !showAsset) linkWidth = "95%";
        else if (!showCustomer) linkWidth = "70%";
        else if (!showAsset) linkWidth = "65%";

        headers.push(`<th style="border: 1px solid #7f7f7f; padding: 2px 1px; text-align: center; font-weight: bold; width: ${linkWidth};">Link</th>`);
        spacerRowCells.push('<td style="border: 1px solid #7f7f7f; padding: 2px 1px;">&nbsp;</td>');
        dataRowCells.push(`
          <td style="border: 1px solid #7f7f7f; padding: 2px 1px;">
            <a href="${safePublicUrl}" target="_blank" rel="noopener noreferrer" style="color: #0066cc; text-decoration: underline;">
              ${safePublicUrl}
            </a>
          </td>
        `);

        htmlEmailBody += `${htmlEmailBody ? "<br><br>" : ""}`;
        htmlEmailBody += `
          <table style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 13px; border: 1px solid #7f7f7f;">
            <thead>
              <tr style="background-color: #f2f2f2;">
                ${headers.join("\n")}
              </tr>
            </thead>
            <tbody>
              <tr>
                ${spacerRowCells.join("\n")}
              </tr>
              <tr>
                ${dataRowCells.join("\n")}
              </tr>
            </tbody>
          </table>
        `;
      }

      if (shouldShowQr && qrCodeCid) {
        htmlEmailBody += `
          <div style="margin-top: 16px;">
            <p style="font-family: Arial, sans-serif; font-size: 13px; font-weight: bold; color: #595959; margin-bottom: 8px;">Scan QR Code to access:</p>
            <img src="cid:${qrCodeCid}" alt="QR Code" width="100" height="100" style="display: block; border: 1px solid #dcdcdc;" />
          </div>
        `;
      }
    } else {
      // If no public_url, use existing behavior (document links and video links)
      if (!document_as_attachment && documentLinkGroups.size > 0) {
        for (const [category, links] of documentLinkGroups.entries()) {
          const linkHtml = links
            .map(
              (item) =>
                `<li><a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.filename}</a></li>`
            )
            .join("");
          htmlEmailBody += `${htmlEmailBody ? "<br><br>" : ""
            }<strong>${category}:</strong><ul>${linkHtml}</ul>`;
        }
      }

      if (videoLinks.length > 0) {
        const videoListHtml = videoLinks
          .map(
            (video) =>
              `<li><a href="${video.url}" target="_blank" rel="noopener noreferrer">${video.filename}</a></li>`
          )
          .join("");
        htmlEmailBody += `${htmlEmailBody ? "<br><br>" : ""
          }<strong>Video links:</strong><ul>${videoListHtml}</ul>`;
      }
    }

    /* if (!htmlEmailBody) {
      htmlEmailBody = `Please find attached files for order ${order.order_number || orderId
        }.`;
    } */

    // Append regards at the end (HTML), if provided
    if (regards && typeof regards === "string" && regards.trim() !== "") {
      const safeRegards = regards.trim();
      htmlEmailBody += `${htmlEmailBody ? "<br><br>" : ""
        }<div style="margin-top:16px;"><span style="font-weight:bold;">Regards,</span><br>${safeRegards}</div>`;
    }

    // Choose email credentials based on valuer_name
    const valuerName = (order.valuer_name || "").trim().toUpperCase();
    const isValuetechSolutions = valuerName === "VALUETECH SOLUTIONS";

    const smtpUser = isValuetechSolutions
      ? process.env.EMAIL_USER
      : process.env.VIRAJ_EMAIL_USER || process.env.EMAIL_USER;
    const smtpPass = isValuetechSolutions
      ? process.env.EMAIL_PASS
      : process.env.VIRAJ_EMAIL_PASS || process.env.EMAIL_PASS;

    let emailResult;
    try {
      emailResult = await sendEmail({
        to: to,
        cc: cc || [],
        bcc: bcc || [],
        subject: subject,
        text: emailBody,
        html: htmlEmailBody,
        attachments: attachments.length > 0 ? attachments : undefined,
        smtpUser,
        smtpPass,
        from: smtpUser,
      });
    } finally {
      // Do not store merged PDF on disk permanently.
      // (Only merge-artifact temp files are cleaned up here; original PDFs remain unchanged.)
      for (const mergedPath of tempMergedPdfPaths) {
        // fs.unlink from `fs` (callback API) requires a callback, so use promises here.
        fs.promises.unlink(mergedPath).catch(() => { });
      }
      for (const tempPath of tempAttachmentPaths) {
        fs.promises.unlink(tempPath).catch(() => { });
      }
      for (const sourcePath of tempMergeSourcePaths) {
        fs.promises.unlink(sourcePath).catch(() => { });
      }
      for (const helperPath of tempCompressionHelperPaths) {
        fs.promises.unlink(helperPath).catch(() => { });
      }
    }

    await Order.updateOrder(
      parseInt(orderId),
      {
        current_status_id: 13,
        updated_at: new Date(),
        updated_by: req.user?.id,
      },
      req.user?.id
    );

    const statusHistoryData = {
      order_id: parseInt(orderId),
      status_id: 13, // Mail sent status
      activity_extra: "Mail sent",
      changed_by: req.user?.id,
      changed_at: new Date(),
    };

    await OrderStatusHistory.createStatusHistory(statusHistoryData);

    // Store last-mail data for prefill (do not store document_ids or video_ids)
    // Ensure to/cc/bcc are plain arrays of strings so jsonb gets valid JSON (e.g. ["a@b.com"])
    const ensureEmailArray = (val) => {
      if (Array.isArray(val)) return val.map((s) => (typeof s === "string" ? s.trim() : String(s))).filter(Boolean);
      if (typeof val === "string" && val.trim()) return [val.trim()];
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const keys = Object.keys(val).filter((k) => typeof k === "string" && k.trim());
        const vals = Object.values(val).filter((s) => typeof s === "string" && s.trim());
        return [...new Set([...keys, ...vals])];
      }
      return [];
    };
    const toArr = ensureEmailArray(to);
    const ccArr = ensureEmailArray(cc);
    const bccArr = ensureEmailArray(bcc);
    const lastMailRow = {
      order_id: parseInt(orderId),
      to: JSON.stringify(toArr),
      cc: JSON.stringify(ccArr),
      bcc: JSON.stringify(bccArr),
      subject: subject != null ? String(subject) : null,
      comments: comments != null ? String(comments) : null,
      regards: regards != null ? String(regards) : null,
      mail_attachment:
        mailAttachmentOverride !== null ? mailAttachmentOverride : document_as_attachment,
      public_link_with_image:
        typeof public_link_with_image === "boolean"
          ? public_link_with_image
          : Boolean(public_link_with_image),
      show_table: typeof show_table === "boolean" ? show_table : false,
      show_qrcode: typeof show_qrcode === "boolean" ? show_qrcode : false,
      updated_at: new Date(),
    };
    await db("order_last_mail")
      .insert(lastMailRow)
      .onConflict("order_id")
      .merge([
        "to",
        "cc",
        "bcc",
        "subject",
        "comments",
        "regards",
        "mail_attachment",
        "public_link_with_image",
        "show_table",
        "show_qrcode",
        "updated_at",
      ]);

    res.status(200).json({
      success: true,
      message: "Email sent successfully",
      data: {
        orderId: parseInt(orderId),
        messageId: emailResult.messageId,
        to: to,
        cc: cc || [],
        bcc: bcc || [],
        subject: subject,
        public_url: hasPublicUrl ? resolvedPublicUrl : null,
        videosCount: videoLinks.length,
        documentsCount: document_as_attachment
          ? documentAttachmentCount
          : documentLinkCount,
        totalAttachmentsCount: attachments.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get last-sent mail data for an order (for prefill).
 * GET /api/orders/:orderId/last-mail
 */
exports.getLastMail = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    const row = await db("order_last_mail")
      .where("order_id", parseInt(orderId))
      .first();
    if (!row) {
      return res.status(200).json({ success: true, data: null });
    }
    const data = {
      id: row.id,
      order_id: row.order_id,
      to: Array.isArray(row.to) ? row.to : [],
      cc: Array.isArray(row.cc) ? row.cc : [],
      bcc: Array.isArray(row.bcc) ? row.bcc : [],
      subject: row.subject,
      comments: row.comments,
      regards: row.regards,
      mail_attachment: Boolean(row.mail_attachment),
      public_link_with_image: Boolean(row.public_link_with_image),
      show_table: row.show_table !== null && row.show_table !== undefined ? Boolean(row.show_table) : false,
      show_qrcode: row.show_qrcode !== null && row.show_qrcode !== undefined ? Boolean(row.show_qrcode) : false,
      updated_at: row.updated_at,
    };
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
