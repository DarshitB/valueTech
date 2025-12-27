import axios from "./axios";

const ENDPOINT = "/api/order-media";

// Get order media by order ID
export const getOrderMedia = (orderId) => axios.get(`${ENDPOINT}/${orderId}`);

// Get public order media by order ID
export const getPublicOrderMedia = (orderId) => axios.get(`${ENDPOINT}/public/${orderId}`);

// Update order media status
export const updateOrderMediaStatus = (payload) => axios.patch(`${ENDPOINT}/status`, payload);

// Upload ZIP file containing images/videos
export const uploadZipFile = (formData) => axios.post(`${ENDPOINT}/upload-zip`, formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
  },
});