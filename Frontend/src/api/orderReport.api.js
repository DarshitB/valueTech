// API utility functions for order reports
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/orders-reports"; // Base endpoint for all order report-related requests

// Get order report by order ID and report type
export const getOrderReport = (orderId, reportType) => 
  axios.get(`${ENDPOINT}/${orderId}/${reportType}`); // Fetch order report by order ID and report type

// Get order report by child category ID and report type
export const getOrderReportByChildCategory = (childCategoryId, reportType) => 
  axios.get(`${ENDPOINT}/child-category/${childCategoryId}/${reportType}`); // Fetch order report by child category ID and report type

// Generate/Create order report 
export const generateOrderReport = (orderId, data) => 
  axios.post(`${ENDPOINT}/${orderId}/generate`, data, {
    headers: {
      'Content-Type': 'multipart/form-data', // Required for FormData uploads
    },
  }); // Generate order report with FormData payload

// Generate custom report with content structure
export const generateCustomReport = (orderId, content) => 
  axios.post(`${ENDPOINT}/custom-report/generate`, {
    order_id: orderId,
    content: content
  }, {
    headers: {
      'Content-Type': 'application/json',
    },
  }); // Generate custom report with JSON payload

// Save order report data
export const saveOrderReport = (orderId, reportData) => {
  const isFormData = reportData instanceof FormData;
  return axios.post(`${ENDPOINT}/${orderId}/save`, reportData, {
    headers: {
      'Content-Type': isFormData ? 'multipart/form-data' : 'application/json',
    },
  });
}; // Save order report data; supports JSON or multipart payloads