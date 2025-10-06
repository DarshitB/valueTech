const Order = require("../../models/orders/order");
const OrderStatusMaster = require("../../models/orders/orderStatusMaster");
const OrderStatusHistory = require("../../models/orders/orderStatusHistory");
const Officer = require("../../models/user/officer");
const User = require("../../models/user/user");
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
    
    const orders = await Order.getForMobile(fieldVerifierId);
    
    if (orders && orders.length > 0) {
      res.json({
        state: 1,
        message: "orders fetch successfully",
        orders: orders
      });
    } else {
      res.json({
        state: 0,
        message: "No Orders",
        orders: []
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

    // Determine order status based on supervisor_number, driver_number, and manager_id
    let orderStatusId;
    const hasSupervisorAndDriver = supervisor_number && driver_number;
    
    if (manager_id) {
      // If both supervisor and driver numbers are set AND manager is assigned, status should be 4 (Manager Assigned)
      orderStatusId = 4;
    } else if (hasSupervisorAndDriver) {
      // If both supervisor and driver numbers are set but no manager, status should be 3 (Telecaller Completed)
      orderStatusId = 3;
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
      manager_id: manager_id || null,
      field_verifier_id: field_verifier_id || null,
      registration_number: registration_number || null,
      place_of_inspection: place_of_inspection || null,
      date_of_inspection: date_of_inspection || null,
      current_status_id: orderStatusId,
      order_type: "VKA1",
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

    // Create the appropriate status based on supervisor_number, driver_number, and manager_id
    const finalStatusHistory = {
      order_id: order.id,
      status_id: orderStatusId,
      changed_by: req.user?.id,
      changed_at: new Date(),
    };
    await OrderStatusHistory.createStatusHistory(finalStatusHistory);

    if (field_verifier_id) {
      // If field verifier is assigned, create field verifier assignment record
      const fieldVerifierStatusHistory = {
        order_id: order.id,
        activity_extra: "Field Verifier Assigned",
        changed_by: req.user?.id,
        changed_at: new Date(),
      };

      // Create status history entry
      await OrderStatusHistory.createStatusHistory(fieldVerifierStatusHistory);
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
    console.log("req.body", req.body);
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

    // Determine new order status based on supervisor_number, driver_number, and manager_id
    let newStatusId;
    const currentSupervisorNumber = supervisor_number !== undefined ? supervisor_number : existingOrder.supervisor_number;
    const currentDriverNumber = driver_number !== undefined ? driver_number : existingOrder.driver_number;
    const currentManagerId = manager_id !== undefined ? manager_id : existingOrder.manager_id;
    
    const hasSupervisorAndDriver = currentSupervisorNumber && currentDriverNumber;
    
    if (currentManagerId) {
      // manager is assigned, status should be 4 (Manager Assigned)
      newStatusId = 4;
    } else if (hasSupervisorAndDriver) {
      // If both supervisor and driver numbers are set but no manager, status should be 3 (Telecaller Completed)
      newStatusId = 3;
    } else {
      // If supervisor or driver number is missing, status should be 2 (Telecaller Assigned)
      newStatusId = 2;
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
      manager_id: getIntegerValue(manager_id, existingOrder.manager_id),
      field_verifier_id: getIntegerValue(
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

    // Check for field changes and build detailed change descriptions
    const fieldsToCheck = [
      'customer_name', 'contact', 'alternative_contact', 'supervisor_number', 
      'driver_number', 'child_category_id', 'officer_id', 'manager_id', 
      'registration_number', 'place_of_inspection', 'date_of_inspection'
    ];

    for (const field of fieldsToCheck) {
      const newValue = req.body[field];
      if (newValue !== undefined) {
        const oldValue = existingOrder[field];
        
        if (oldValue !== newValue) {
          // Format field names for better readability
          const formatFieldName = (fieldName) => {
            const fieldMap = {
              'customer_name': 'CUSTOMER NAME',
              'contact': 'CONTACT',
              'alternative_contact': 'ALTERNATIVE CONTACT',
              'supervisor_number': 'SUPERVISOR NUMBER',
              'driver_number': 'DRIVER NUMBER',
              'child_category_id': 'CATEGORY',
              'officer_id': 'OFFICER',
              'manager_id': 'MANAGER',
              'registration_number': 'REGISTRATION NUMBER',
              'place_of_inspection': 'PLACE OF INSPECTION',
              'date_of_inspection': 'DATE OF INSPECTION'
            };
            return fieldMap[fieldName] || fieldName.replace(/_/g, ' ').toUpperCase();
          };
          
          // Get display values (names instead of IDs for certain fields)
          let displayOldValue, displayNewValue;
          
          if (field === 'manager_id') {
            displayOldValue = oldValue ? existingOrder.manager_name || `Manager ${oldValue}` : 'null';
            displayNewValue = newValue ? await getUserName(newValue) || `Manager ${newValue}` : 'null';
          } else if (field === 'officer_id') {
            displayOldValue = oldValue ? existingOrder.officer_name || `Officer ${oldValue}` : 'null';
            displayNewValue = newValue ? await getOfficerName(newValue) || `Officer ${newValue}` : 'null';
          } else if (field === 'child_category_id') {
            displayOldValue = oldValue ? existingOrder.child_category_name || `Category ${oldValue}` : 'null';
            displayNewValue = newValue ? await getCategoryName(newValue) || `Category ${newValue}` : 'null';
          } else {
            displayOldValue = oldValue === null ? 'null' : oldValue === '' ? 'empty' : oldValue;
            displayNewValue = newValue === null ? 'null' : newValue === '' ? 'empty' : newValue;
          }
          
          const formattedField = formatFieldName(field);
          changes.push(`${formattedField} changed from "${displayOldValue}" to "${displayNewValue}"`);
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
      const statusHistoryData = {
        order_id: orderId,
        status_id: newStatusId,
        changed_by: req.user?.id,
        changed_at: new Date(),
      };

      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    }

    // Create detailed field changes record (if there are field changes)
    if (changes.length > 0) {
      const statusHistoryData = {
        order_id: orderId,
        activity_extra: changes.join('; '),
        changed_by: req.user?.id,
        changed_at: new Date(),
      };

      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    }

    // Create field verifier assignment record (if field verifier changed)
    if (hasFieldVerifierChange) {
      const fieldVerifierStatusHistory = {
        order_id: orderId,
        activity_extra: "Field Verifier Assigned",
        changed_by: req.user?.id,
        changed_at: new Date(),
      };

      await OrderStatusHistory.createStatusHistory(fieldVerifierStatusHistory);
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
      throw new BadRequestError("At least one attribute must be provided for update");
    }

    // Extract user_ids from updateData (handle separately like officer categories)
    const { user_ids, ...otherUpdateData } = updateData;

    // Remove any system fields that shouldn't be updated directly
    const restrictedFields = ['id', 'order_number', 'created_at', 'created_by', 'updated_by', 'updated_at', 'deleted_at'];
    const filteredUpdateData = {};

    for (const [key, value] of Object.entries(otherUpdateData)) {
      if (restrictedFields.includes(key)) {
        throw new BadRequestError(`Field '${key}' cannot be updated through this endpoint`);
      }
      // Include fields with actual values (allow null, empty string, 0, false)
      // Only exclude undefined values
      if (value !== undefined) {
        filteredUpdateData[key] = value;
      }
    }

    // Validate that we have at least one valid field to update (either regular fields or user_ids)
    if (Object.keys(filteredUpdateData).length === 0 && user_ids === undefined) {
      throw new BadRequestError("No valid fields provided for update");
    }

    // Track changes for detailed activity log
    const changes = [];

    // Update the order attributes (if any regular fields exist)
    if (Object.keys(filteredUpdateData).length > 0) {
      // Build detailed change descriptions
      for (const [key, newValue] of Object.entries(filteredUpdateData)) {
        const oldValue = existingOrder[key];
        const displayOldValue = oldValue === null ? 'null' : oldValue === '' ? 'empty' : oldValue;
        const displayNewValue = newValue === null ? 'null' : newValue === '' ? 'empty' : newValue;
        
        if (oldValue !== newValue) {
          // Format field names for better readability
          const formatFieldName = (fieldName) => {
            const fieldMap = {
              'order_priority': 'ORDER PRIORITY',
              'order_type': 'ORDER TYPE',
              'valuer_name': 'VALUER NAME'
            };
            return fieldMap[fieldName] || fieldName.replace(/_/g, ' ').toUpperCase();
          };
          
          const formattedKey = formatFieldName(key);
          changes.push(`${formattedKey} changed from "${displayOldValue}" to "${displayNewValue}"`);
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
      const oldUserIds = oldAssignedUsers.map(u => u.id);
      
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
        const userNames = assignedUsers.map(u => u.name).join(', ');
        changes.push(`${userNames} assigned`);
      } else if (JSON.stringify(oldUserIds.sort()) !== JSON.stringify(user_ids.sort())) {
        // Find added and removed users
        const addedUserIds = user_ids.filter(id => !oldUserIds.includes(id));
        const removedUserIds = oldUserIds.filter(id => !user_ids.includes(id));
        
        // Get user names for added users
        if (addedUserIds.length > 0) {
          const addedUsers = await User.findManyByIds(addedUserIds);
          const addedUserNames = addedUsers.map(u => u.name).join(', ');
          changes.push(`${addedUserNames} assigned To order Assign List`);
        }
        
        // Get user names for removed users
        if (removedUserIds.length > 0) {
          const removedUsers = await User.findManyByIds(removedUserIds);
          const removedUserNames = removedUsers.map(u => u.name).join(', ');
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
        activity_extra: changes.join('; '),
      changed_by: userId,
      changed_at: new Date(),
    };

    await OrderStatusHistory.createStatusHistory(statusHistoryData);
    }

    res.status(200).json({
      success: true,
      message: "Order attributes updated successfully",
      data: enrichedOrder,
      changes: changes
    });

  } catch (err) {
    if (err.code === "23505") {
      return next(new ConflictError("Order number already exists"));
    }
    next(err);
  }
};
