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
