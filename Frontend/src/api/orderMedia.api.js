import axios from "./axios";

const ENDPOINT = "/api/order-media";

// Get order media by order ID
export const getOrderMedia = (orderId) => axios.get(`${ENDPOINT}/${orderId}`);

// Get public order media by order ID
export const getPublicOrderMedia = (orderId) => axios.get(`${ENDPOINT}/public/${orderId}`);
export const getPublicOrderMediaByToken = (token) =>
  axios.get(`${ENDPOINT}/public/share/${token}`);

// Update order media status
export const updateOrderMediaStatus = (payload) => axios.patch(`${ENDPOINT}/status`, payload);

// Upload ZIP file containing images/videos
export const uploadZipFile = (formData) => axios.post(`${ENDPOINT}/upload-zip`, formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
  },
});

// Soft delete order media by IDs (requires delete_order_media_files permission)
export const deleteOrderMedia = (payload) => axios.patch(`${ENDPOINT}/delete`, payload);

// Force download media file by id (backend streams as attachment)
export const downloadOrderMediaFile = (mediaId) =>
  axios.get(`${ENDPOINT}/download/${mediaId}`, { responseType: "blob" });