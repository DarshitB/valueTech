const orderMediaPortal = require("../../models/orders/orderMediaPortal");
const Order = require("../../models/orders/order");

/**
 * GET /api/portal/order-media/:orderId
 * Get all media records for a specific order
 */
async function getOrderMedia(req, res) {
  try {
    const { orderId } = req.params;
    const { id: userId } = req.user; // Assuming you have user info in req.user

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Validate order ID is a number
    const orderIdNum = parseInt(orderId);
    if (isNaN(orderIdNum)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID format",
      });
    }

    // Check if order exists
    const order = await Order.findById(orderIdNum, req.user);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Get all media for the order
    const mediaRecords = await orderMediaPortal.getMediaByOrderId(orderIdNum);


    res.json({
      success: true,
      data: {
        order: {
          id: order.id,
          order_number: order.order_number,
        },
        media: mediaRecords,
        total_count: mediaRecords.length,
      },
    });
  } catch (error) {
    console.error("Error in getOrderMedia:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
}

/**
 * PATCH /api/portal/order-media/status
 * Update status for multiple media records
 * Body: { updates: [{ id: 1, status: 1 }, { id: 2, status: 0 }] }
 */
async function updateMediaStatus(req, res) {
  try {
    const { updates } = req.body;
    const { id: userId } = req.user; // Assuming you have user info in req.user

    /* console.log("updates", updates); */
    
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required and must not be empty",
      });
    }

    // Validate each update object
    for (const update of updates) {
      if (!update.id || update.status === undefined) {
        return res.status(400).json({
          success: false,
          message: "Each update must have 'id' and 'status' fields",
        });
      }

      // Validate status is a number (0 or 1)
      if (![0, 1, 2].includes(update.status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be 0, 1 or 2",
        });
      }

      // Validate id is a number
      if (isNaN(parseInt(update.id))) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID format",
        });
      }
    }

    // Update all media records
    const updatedRecords = await orderMediaPortal.updateMultipleStatus(
      updates,
      userId
    );

    res.locals.id = updatedRecords[0].id;

    res.json({
      success: true,
      message: `Successfully updated ${updatedRecords.length} media records`,
      data: {
        updated_count: updatedRecords.length,
        updated_records: updatedRecords,
      },
    });
  } catch (error) {
    console.error("Error in updateMediaStatus:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
}

/**
 * GET /api/portal/order-media/:orderId/count
 * Get count of media records for a specific order
 */
async function getOrderMediaCount(req, res) {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Validate order ID is a number
    const orderIdNum = parseInt(orderId);
    if (isNaN(orderIdNum)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID format",
      });
    }

    // Check if order exists
    const order = await Order.findById(orderIdNum, req.user);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Get media count for the order
    const mediaRecords = await orderMediaPortal.getMediaByOrderId(orderIdNum);

    // Count by status
    const statusCounts = {
      pending: mediaRecords.filter((m) => m.status === 0).length,
      approved: mediaRecords.filter((m) => m.status === 1).length,
      total: mediaRecords.length,
    };

    res.json({
      success: true,
      data: {
        order: {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
        },
        media_counts: statusCounts,
      },
    });
  } catch (error) {
    console.error("Error in getOrderMediaCount:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
}

module.exports = {
  getOrderMedia,
  updateMediaStatus,
  getOrderMediaCount,
};
