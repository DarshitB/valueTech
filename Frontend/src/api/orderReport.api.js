// API utility functions for order reports
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/orders-reports"; // Base endpoint for all order report-related requests

// Get order report by order ID and report type
export const getOrderReport = (orderId, reportType) => 
  axios.get(`${ENDPOINT}/${orderId}/${reportType}`); // Fetch order report by order ID and report type

// Generate/Create order report 
export const generateOrderReport = (orderId, data) => 
  axios.post(`${ENDPOINT}/${orderId}/generate`, data, {
    headers: {
      'Content-Type': 'multipart/form-data', // Required for FormData uploads
    },
  }); // Generate order report with FormData payload
