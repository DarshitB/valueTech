import axios from "./axios";

const ENDPOINT = "/api/order-media-document";

// Get order media documents by order ID
export const getOrderMediaDocuments = (orderId) =>
  axios.get(`${ENDPOINT}/${orderId}`);

// Upload order media documents
export const uploadOrderMediaDocuments = (payload) =>
  axios.post(`${ENDPOINT}/upload`, payload);

// Delete order media documents
export const deleteOrderMediaDocuments = (documentId) =>
  axios.delete(`${ENDPOINT}/${documentId}`);

// Get approved order media documents by order ID
export const getApprovedOrderMediaDocuments = (orderId) =>
  axios.get(`${ENDPOINT}/${orderId}/approved`);

// Approve order media documents
export const approveOrderMediaDocuments = (orderId, payload) =>
  axios.post(`${ENDPOINT}/${orderId}/approve`, payload);

// Remove approval from order media documents
export const removeApproveOrderMediaDocuments = (orderId, payload) =>
  axios.post(`${ENDPOINT}/${orderId}/remove-approve`, payload);