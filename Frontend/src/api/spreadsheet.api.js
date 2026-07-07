// API utility functions for spreadsheets
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/spreadsheets"; // Base endpoint for all spreadsheet-related requests

export const getSpreadsheets = () => axios.get(ENDPOINT); // Fetch all spreadsheets
export const getSpreadsheetById = (id) => axios.get(`${ENDPOINT}/${id}`); // Get spreadsheet by ID
export const createSpreadsheet = (data) => axios.post(ENDPOINT, data); // Create new spreadsheet
export const saveSpreadsheet = (id, data) =>
  axios.post(`${ENDPOINT}/${id}/save`, data); // Save spreadsheet workbook snapshot
