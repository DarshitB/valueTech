import axios from "./axios";

const ENDPOINT = "/api/order-media";

// Get order media by order ID
export const getOrderMedia = (orderId) => axios.get(`${ENDPOINT}/${orderId}`);

// Update order media status
export const updateOrderMediaStatus = (payload) => axios.patch(`${ENDPOINT}/status`, payload);
