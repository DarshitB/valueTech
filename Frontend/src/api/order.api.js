// API utility functions for orders
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/orders"; // Base endpoint for all state-related requests

export const getOrders = () => axios.get(ENDPOINT); // Fetch all orders
export const getOrderById = (id) => axios.get(`${ENDPOINT}/${id}`); // Get order by ID
export const createOrder = (data) => axios.post(ENDPOINT, data); // Add order
export const updateOrder = (id, payload) =>
  axios.put(`${ENDPOINT}/${id}`, payload); // Update order
export const deleteOrder = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a order by ID

export const getComments = (id) => axios.get(`${ENDPOINT}/${id}/comments`); // Get all comments for an order
export const addComment = (id, payload) =>
  axios.post(`${ENDPOINT}/${id}/comments`, payload); // Add a comment to an order

export const updatePaymentStatus = (id, payload) =>
  axios.patch(`${ENDPOINT}/${id}/payment`, payload); // Update payment status of an order