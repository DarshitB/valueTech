// API utility functions for orders
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/orders"; // Base endpoint for all state-related requests

export const getOrders = () => axios.get(ENDPOINT); // Fetch all orders

export const getOrdersWithWoStatus = (params) =>
  axios.get(`${ENDPOINT}/finalized-and-on-hold-orders`, {
    ...(params && Object.keys(params).length > 0 ? { params } : {}),
  }); // Optional query: page, limit, filters; without params returns full list (legacy)

// Fetch finalized orders by child category ID
export const getFinalizedOrdersByChildCategory = (childCategoryId) =>
  axios.get(`${ENDPOINT}/child-category/${childCategoryId}/finalized`);

export const getOrderById = (id) => axios.get(`${ENDPOINT}/${id}`); // Get order by ID
export const getOrderByOrderNumber = (orderNumber) =>
  axios.get(`${ENDPOINT}/by-order-number/${encodeURIComponent(orderNumber)}`);

export const searchOrdersByRegistration = (q) =>
  axios.get(`${ENDPOINT}/by-registration`, { params: { q } });

export const getOrderR2SyncStatus = (id) =>
  axios.get(`${ENDPOINT}/${id}/r2-sync-status`);

export const startOrderR2Sync = (id) =>
  axios.post(`${ENDPOINT}/${id}/r2-sync`);
export const createOrder = (data) => axios.post(ENDPOINT, data); // Add order
export const updateOrder = (id, payload) =>
  axios.put(`${ENDPOINT}/${id}`, payload); // Update order
export const deleteOrder = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a order by ID

export const getComments = (id) => axios.get(`${ENDPOINT}/${id}/comments`); // Get all comments for an order
export const addComment = (id, payload) =>
  axios.post(`${ENDPOINT}/${id}/comments`, payload); // Add a comment to an order

export const updatePaymentStatus = (id, payload) =>
  axios.patch(`${ENDPOINT}/${id}/payment`, payload); // Update payment status of an order

export const updateOrderAttributes = (id, payload) =>
  axios.patch(`${ENDPOINT}/${id}/attributes`, payload); // Update attributes of an order

export const updateOrderToStatus9 = (id) =>
  axios.patch(`${ENDPOINT}/${id}/update-status-under-review`); // Update order status to 10

// Update order status directly (e.g., to Completed) with note
export const updateOrderStatusDirect = (id, payload) =>
  axios.patch(`${ENDPOINT}/${id}/update-status-direct`, payload);

export const updateStatusAfterUnderReview = (id, payload) =>
  axios.patch(`${ENDPOINT}/${id}/update-status-after-under-review`, payload); // Update order status after under review

export const getAssetMakesForReports = (orderType) =>
  axios.get(`/api/asset-makes-of-reports/${orderType}/order-types`); // Get asset makes for specific report type

/**
 * Send mail with order documents to recipients
 * @param {number} orderId - The order ID
 * @param {Object} payload - Mail payload object
 * @param {string[]} payload.to - Array of recipient email addresses (required)
 * @param {string[]} payload.cc - Array of CC email addresses (optional)
 * @param {string[]} payload.bcc - Array of BCC email addresses (optional)
 * @param {string} payload.subject - Email subject (optional)
 * @param {string} payload.comments - Email body/comments (optional)
 * @param {number[]} payload.document_ids - Array of approved document IDs to attach (collages and reports)
 * @param {number[]} payload.video_ids - Array of approved video IDs to attach (optional, only included if videos exist)
 * @returns {Promise} Axios response
 * 
 * Example payload:
 * {
 *   to: ["officer1@bank.com", "officer2@bank.com"],
 *   cc: ["manager@bank.com"],
 *   bcc: [],
 *   subject: "Order Documents - #12345",
 *   comments: "Please find attached the approved documents for order #12345",
 *   document_ids: [1, 2, 3, 4],
 *   video_ids: [5, 6]  // Optional: only included if videos are selected
 * }
 * 
 * Expected backend endpoint: POST /api/orders/:orderId/send-mail
 * Expected response: { success: true, message: "Mail sent successfully", ... }
 */
export const sendOrderMail = (orderId, payload) =>
  axios.post(`${ENDPOINT}/${orderId}/send-mail`, payload);

/**
 * Get last-sent mail data for an order (for prefill).
 * GET /api/orders/:orderId/last-mail
 */
export const getOrderLastMail = (orderId) =>
  axios.get(`${ENDPOINT}/${orderId}/last-mail`);