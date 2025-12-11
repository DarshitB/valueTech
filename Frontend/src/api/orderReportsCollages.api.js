// API utility functions for order reports and collages upload
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/orders-reports-collages"; // Base endpoint for all order reports/collages upload requests

// Upload single report or collage file
export const uploadOrderReportCollage = (formData) =>
  axios.post(`${ENDPOINT}/upload`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

// Upload multiple report or collage files
export const uploadMultipleOrderReportsCollages = (formData) =>
  axios.post(`${ENDPOINT}/upload-multiple`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

