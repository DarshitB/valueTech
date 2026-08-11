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

const MARINE_LOCK_REPORT_TYPE = "report_marine";

/** GET current Marine edit lock status (does not acquire). */
export const getReportEditLock = (
  orderId,
  reportType = MARINE_LOCK_REPORT_TYPE
) =>
  axios.get(`${ENDPOINT}/${orderId}/lock`, {
    params: { report_type: reportType },
  });

/** Acquire / refresh Marine edit lock for the current user. */
export const acquireReportEditLock = (
  orderId,
  reportType = MARINE_LOCK_REPORT_TYPE
) =>
  axios.post(`${ENDPOINT}/${orderId}/lock`, {
    report_type: reportType,
  });

/** Heartbeat to keep Marine edit lock alive. */
export const heartbeatReportEditLock = (
  orderId,
  reportType = MARINE_LOCK_REPORT_TYPE
) =>
  axios.post(`${ENDPOINT}/${orderId}/lock/heartbeat`, {
    report_type: reportType,
  });

/**
 * Release Marine edit lock.
 * Use keepalive on tab close so the request can finish during unload.
 */
export const releaseReportEditLock = (
  orderId,
  reportType = MARINE_LOCK_REPORT_TYPE,
  { keepalive = false } = {}
) => {
  if (!keepalive) {
    return axios.delete(`${ENDPOINT}/${orderId}/lock`, {
      params: { report_type: reportType },
    });
  }

  const token = localStorage.getItem("token");
  const base =
    process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";
  const url = `${base}${ENDPOINT}/${orderId}/lock?report_type=${encodeURIComponent(
    reportType
  )}`;

  return fetch(url, {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    keepalive: true,
  });
};