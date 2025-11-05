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

// Get All Orders for Mobile App
exports.getForMobile = async (req, res, next) => {
  try {
    // Get field verifier ID from the authenticated user
    const fieldVerifierId = req.verifier.id;

    const completeVerifier = await mobileAuth.findById(fieldVerifierId);

    const orders = await Order.getForMobile(fieldVerifierId);

    if (orders && orders.length > 0) {
      // Add mobile_job_status to each order
      const ordersWithStatus = await Promise.all(
        orders.map(async (order) => {
          let mobile_job_status = 0; // Default: Pending

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

          // Check if any media is rejected (status = 2 in order_media_image_video)
          const rejectedMedia = await db("order_media_image_video")
            .where("order_id", order.id)
            .where("status", 2)
            .first();

          if (rejectedMedia) {
            mobile_job_status = 4; // Images Rejected
          }

          return {
            ...order,
            mobile_job_status
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
        user_type: 'field_verifier',
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
      await Order.updateOrder(order_id, {
        job_started_at: currentTime,
        job_started_by: fieldVerifierId,
      }, fieldVerifierId);

      // Add status history entry
      const statusHistoryData = {
        order_id: order_id,
        user_type: 'field_verifier',
        changed_by: fieldVerifierId,
        changed_at: currentTime,
        activity_extra: "Order approved (Job started)"
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

// Create Order
// CONFIGURATION: Change ORDER_NUMBER_LENGTH below to modify order number length
exports.create = async (req, res, next) => {
  try {
    const {
      customer_name,
      contact,
      alternative_contact,
      supervisor_number,
      driver_number,
      child_category_id,
      officer_id,
      manager_id,
      field_verifier_id,
      registration_number,
      place_of_inspection,
      date_of_inspection,
    } = req.body;

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

    const uniqueOrderNumber = await generateOrderNumber();

    // Create order with determined status
    const orderData = {
      order_number: uniqueOrderNumber,
      customer_name,
      contact,
      alternative_contact: alternative_contact || null,
      supervisor_number: supervisor_number || null,
      driver_number: driver_number || null,
      child_category_id: child_category_id || null,
      officer_id: officer_id || null,
      manager_id: finalManagerId || null,
      field_verifier_id: field_verifier_id || null,
      registration_number: registration_number || null,
      place_of_inspection: place_of_inspection || null,
      date_of_inspection: date_of_inspection || null,
      current_status_id: orderStatusId,
      order_type: "VKA1",
      order_priority: "Low",
      created_by: req.user?.id,
      created_at: new Date(),
    };

    /* console.log("About to create order with data:", orderData); */
    const order = await Order.createOrder(orderData);
    /* console.log("Order created successfully:", order); */

    // Create status history entries based on assignments
    // Always create Order Initiated status first
    const pendingStatusHistory = {
      order_id: order.id,
      status_id: 1, // Order Initiated
      changed_by: req.user?.id,
      changed_at: new Date(),
    };
    await OrderStatusHistory.createStatusHistory(pendingStatusHistory);

    // Create status history entries based on what was assigned
    // If field_verifier is assigned, create both manager (4) and field verifier (6) records
    if (field_verifier_id) {
      // First create Manager Assigned status (if manager is assigned)
      if (finalManagerId) {
        const managerStatusHistory = {
          order_id: order.id,
          status_id: 4, // Manager Assigned
          changed_by: req.user?.id,
          changed_at: new Date(),
        };
        await OrderStatusHistory.createStatusHistory(managerStatusHistory);
      }

      // Then create Field Verifier Assigned status
      const fieldVerifierStatusHistory = {
        order_id: order.id,
        status_id: 6, // Field Verifier Assigned
        changed_by: req.user?.id,
        changed_at: new Date(),
      };
      await OrderStatusHistory.createStatusHistory(fieldVerifierStatusHistory);
    } else {
      // Create single status history based on calculated status
      const finalStatusHistory = {
        order_id: order.id,
        status_id: orderStatusId,
        changed_by: req.user?.id,
        changed_at: new Date(),
      };
      await OrderStatusHistory.createStatusHistory(finalStatusHistory);
    }

    res.locals.newRecordId = order.id;

    /* console.log("order if",order.id); */
    // Get enriched order data for response
    const enrichedOrder = await Order.findById(order.id, req.user);
    /* console.log(enrichedOrder); */
    res.status(201).json(enrichedOrder);
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
      contact,
      alternative_contact,
      supervisor_number,
      driver_number,
      child_category_id,
      officer_id,
      manager_id,
      field_verifier_id,
      registration_number,
      place_of_inspection,
      date_of_inspection,
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

    // Check if Telecaller changed place_of_inspection - if yes, reset manager and field verifier
    const isTelecaller = (req.user?.role_name || "").toUpperCase().includes("TELECALLER");
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
    let finalManagerId = manager_id !== undefined ? manager_id : existingOrder.manager_id;
    
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
    if (!resetManagerAndFieldVerifier && existingOrder.current_status_id >= newStatusId) {
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
      customer_name,
      contact,
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
      field_verifier_id: resetManagerAndFieldVerifier ? null : getIntegerValue(
        field_verifier_id,
        existingOrder.field_verifier_id
      ),
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
      changes.push(`PLACE OF INSPECTION changed from "${oldPlace}" to "${newPlace}"`);
      
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
    ];

    for (const field of fieldsToCheck) {
      // Skip place_of_inspection and manager_id if already logged due to Telecaller reset
      if ((field === "place_of_inspection" || field === "manager_id") && resetManagerAndFieldVerifier) {
        continue;
      }
      
      const newValue = req.body[field];
      if (newValue !== undefined) {
        const oldValue = existingOrder[field];

        if (oldValue !== newValue) {
          // Format field names for better readability
          const formatFieldName = (fieldName) => {
            const fieldMap = {
              customer_name: "CUSTOMER NAME",
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
    const restrictedFields = [
      "id",
      "order_number",
      "created_at",
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
        status_name: statusExists.name
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Send email with order documents and videos
 * POST /api/orders/:orderId/send-mail
 * Body: { to: [], cc: [], bcc: [], subject: string, comments: string, document_ids: [], video_ids: [] }
 */
exports.sendMail = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { to, cc, bcc, subject, comments, document_ids, video_ids } = req.body;

    // Validate order exists
    const order = await Order.findById(orderId, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    // Validate required fields
    if (!to || !Array.isArray(to) || to.length === 0) {
      throw new BadRequestError("'to' field is required and must be a non-empty array");
    }

    if (!subject || typeof subject !== "string" || subject.trim() === "") {
      throw new BadRequestError("'subject' field is required and must be a non-empty string");
    }

    // Validate arrays if provided
    if (cc !== undefined && (!Array.isArray(cc))) {
      throw new BadRequestError("'cc' must be an array");
    }

    if (bcc !== undefined && (!Array.isArray(bcc))) {
      throw new BadRequestError("'bcc' must be an array");
    }

    if (document_ids !== undefined && (!Array.isArray(document_ids))) {
      throw new BadRequestError("'document_ids' must be an array");
    }

    if (video_ids !== undefined && (!Array.isArray(video_ids))) {
      throw new BadRequestError("'video_ids' must be an array");
    }

    // Import email service and models
    const { sendEmail } = require("../../utils/emailService");
    const orderMediaDocument = require("../../models/orders/orderMediaDocument");
    const orderMediaPortal = require("../../models/orders/orderMediaPortal");
    const path = require("path");

    // Fetch videos if video_ids are provided (in parallel for better performance)
    const videoAttachments = [];
    if (video_ids && video_ids.length > 0) {
      // Fetch all videos in parallel instead of sequentially
      const videoPromises = video_ids.map((videoId) =>
        orderMediaPortal.findById(parseInt(videoId))
      );
      const videos = await Promise.all(videoPromises);
      
      // Validate and prepare video attachments
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const videoId = video_ids[i];
        
        if (!video) {
          throw new BadRequestError(`Video with ID ${videoId} not found`);
        }

        // Verify video belongs to this order
        if (video.order_id !== parseInt(orderId)) {
          throw new BadRequestError(`Video with ID ${videoId} does not belong to order ${orderId}`);
        }

        // Verify it's actually a video
        if (video.media_type !== "video") {
          throw new BadRequestError(`Media with ID ${videoId} is not a video`);
        }

        // Convert media_url (e.g., /uploads/2024/Jan/ORD123/videos/file.mp4) to relative path
        // Remove leading slash if present (emailService will prepend process.cwd())
        const mediaPath = video.media_url.startsWith("/")
          ? video.media_url.substring(1)
          : video.media_url;

        // Extract filename from path for attachment
        const filename = path.basename(video.media_url);

        videoAttachments.push({
          path: mediaPath, // Use relative path (emailService will prepend process.cwd())
          filename: filename,
        });
      }
    }

    // Fetch documents if document_ids are provided (in parallel for better performance)
    const documentAttachments = [];
    if (document_ids && document_ids.length > 0) {
      // Fetch all documents in parallel instead of sequentially
      const documentPromises = document_ids.map((docId) =>
        orderMediaDocument.findById(parseInt(docId))
      );
      const documents = await Promise.all(documentPromises);
      
      // Validate and prepare document attachments
      for (let i = 0; i < documents.length; i++) {
        const document = documents[i];
        const docId = document_ids[i];
        
        if (!document) {
          throw new BadRequestError(`Document with ID ${docId} not found`);
        }

        // Verify document belongs to this order
        if (document.order_id !== parseInt(orderId)) {
          throw new BadRequestError(`Document with ID ${docId} does not belong to order ${orderId}`);
        }

        // Convert media_url (e.g., /uploads/2024/Jan/ORD123/documents/file.pdf) to relative path
        // Remove leading slash if present (emailService will prepend process.cwd())
        const mediaPath = document.media_url.startsWith("/")
          ? document.media_url.substring(1)
          : document.media_url;

        // Extract filename from path for attachment
        const filename = path.basename(document.media_url);

        documentAttachments.push({
          path: mediaPath, // Use relative path (emailService will prepend process.cwd())
          filename: filename,
        });
      }
    }

    // Combine attachments: videos first, then documents
    const attachments = [...videoAttachments, ...documentAttachments];

    // Prepare email body (only use comments if provided, no attachment lists)
    const emailBody = comments || `Please find attached files for order ${order.order_number || orderId}.`;
    
    // Prepare HTML email body (convert newlines to HTML breaks)
    const htmlEmailBody = emailBody.replace(/\n/g, "<br>");

    // Send email
    const emailResult = await sendEmail({
      to: to,
      cc: cc || [],
      bcc: bcc || [],
      subject: subject,
      text: emailBody,
      html: htmlEmailBody,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    // Update order status to 13 (Mail sent)
    await Order.updateOrder(
      parseInt(orderId),
      {
        current_status_id: 13,
        updated_at: new Date(),
        updated_by: req.user?.id,
      },
      req.user?.id
    );

    // Create status history entry for mail sent activity
    const statusHistoryData = {
      order_id: parseInt(orderId),
      status_id: 13, // Mail sent status
      activity_extra: "Mail sent",
      changed_by: req.user?.id,
      changed_at: new Date(),
    };

    await OrderStatusHistory.createStatusHistory(statusHistoryData);

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
        videosCount: videoAttachments.length,
        documentsCount: documentAttachments.length,
        totalAttachmentsCount: attachments.length,
      },
    });
  } catch (err) {
    next(err);
  }
};