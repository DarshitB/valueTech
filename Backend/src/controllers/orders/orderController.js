const Order = require("../../models/orders/order");
const OrderStatusMaster = require("../../models/orders/orderStatusMaster");
const OrderStatusHistory = require("../../models/orders/orderStatusHistory");
const Officer = require("../../models/user/officer");
const User = require("../../models/user/user");

const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

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
    const orders = await Order.getForMobile();
    res.json(orders);
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
      child_category_id,
      officer_id,
      manager_id,
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

    // Determine order status based on manager_id
    let orderStatusId;
    if (manager_id) {
      // If manager is assigned, status should be 2 (Assigned to Manager)
      orderStatusId = 2;
    } else {
      // If no manager, status should be 1 (Pending)
      orderStatusId = 1;
    }

    // Generate unique random order number with configurable length
    const ORDER_NUMBER_LENGTH = 8; // Change this number to modify order number length

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
      child_category_id: child_category_id || null,
      officer_id: officer_id || null,
      manager_id: manager_id || null,
      registration_number: registration_number || null,
      place_of_inspection: place_of_inspection || null,
      date_of_inspection: date_of_inspection || null,
      current_status_id: orderStatusId,
      created_by: req.user?.id,
      created_at: new Date(),
    };

    /* console.log("About to create order with data:", orderData); */
    const order = await Order.createOrder(orderData);
    /* console.log("Order created successfully:", order); */

    // Create status history entries
    if (manager_id) {
      // If manager is assigned, create both status 1 and 2
      const pendingStatusHistory = {
        order_id: order.id,
        status_id: 1, // Pending status
        changed_by: req.user?.id,
        changed_at: new Date(),
      };

      const assignedStatusHistory = {
        order_id: order.id,
        status_id: 2, // Assigned to Manager status
        changed_by: req.user?.id,
        changed_at: new Date(),
      };

      // Create both status history entries
      await OrderStatusHistory.createStatusHistory(pendingStatusHistory);
      await OrderStatusHistory.createStatusHistory(assignedStatusHistory);
    } else {
      // If no manager, only create status 1
      const statusHistoryData = {
        order_id: order.id,
        status_id: 1, // Pending status
        changed_by: req.user?.id,
        changed_at: new Date(),
      };

      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    }

    res.locals.newRecordId = order.id;

    // Get enriched order data for response
    const enrichedOrder = await Order.findById(order.id, req.user);

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
      child_category_id,
      officer_id,
      manager_id,
      registration_number,
      place_of_inspection,
      date_of_inspection,
    } = req.body;

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

    // Determine new order status based on manager_id
    let newStatusId;
    if (manager_id !== undefined) {
      // If manager_id is being updated
      if (manager_id) {
        // If manager is assigned, status should be 2 (Assigned to Manager)
        newStatusId = 2;
      } else {
        // If no manager, status should be 1 (Pending)
        newStatusId = 1;
      }
    } else {
      // If manager_id is not being updated, keep existing status
      newStatusId = existingOrder.current_status_id;
    }

    // Update order - only update fields that are provided
    const updateData = {
      customer_name,
      contact,
      alternative_contact:
        alternative_contact !== undefined
          ? alternative_contact
          : existingOrder.alternative_contact,
      child_category_id:
        child_category_id !== undefined
          ? child_category_id
          : existingOrder.child_category_id,
      officer_id:
        officer_id !== undefined ? officer_id : existingOrder.officer_id,
      manager_id:
        manager_id !== undefined ? manager_id : existingOrder.manager_id,
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

    // Create status history entry if status changed
    if (
      manager_id !== undefined &&
      newStatusId !== existingOrder.current_status_id
    ) {
      const statusHistoryData = {
        order_id: orderId,
        status_id: newStatusId,
        changed_by: req.user?.id,
        changed_at: new Date(),
      };

      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    } else {
      const statusHistoryData = {
        order_id: orderId,
        activity_extra: "Order Edited",
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
        payment_amount !== undefined ? payment_amount : existingOrder.payment_amount,
      payment_mode:
        payment_mode !== undefined ? payment_mode : existingOrder.payment_mode,
      payment_status:
        payment_status !== undefined ? payment_status : existingOrder.payment_status,
    };

    const updated = await Order.updatePaymentStatus(orderId, updateData, req.user?.id);
    
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
