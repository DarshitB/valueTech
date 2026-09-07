// API utility functions for spreadsheets
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/spreadsheets"; // Base endpoint for all spreadsheet-related requests

export const getSpreadsheets = (params = {}) =>
  axios.get(ENDPOINT, {
    params: params.archived === true ? { archived: true } : undefined,
  });
export const getSpreadsheetById = (id) => axios.get(`${ENDPOINT}/${id}`); // Get spreadsheet by ID
export const createSpreadsheet = (data) => axios.post(ENDPOINT, data); // Create new spreadsheet
export const updateSpreadsheet = (id, data) => axios.put(`${ENDPOINT}/${id}`, data); // Update spreadsheet metadata
export const deleteSpreadsheet = (id) => axios.delete(`${ENDPOINT}/${id}`); // Soft delete spreadsheet
export const pinSpreadsheet = (id) => axios.post(`${ENDPOINT}/${id}/pin`);
export const unpinSpreadsheet = (id) => axios.delete(`${ENDPOINT}/${id}/pin`);
export const archiveSpreadsheet = (id) => axios.post(`${ENDPOINT}/${id}/archive`);
export const unarchiveSpreadsheet = (id) =>
  axios.delete(`${ENDPOINT}/${id}/archive`);
export const saveSpreadsheet = (id, data) =>
  axios.post(`${ENDPOINT}/${id}/save`, data); // Save spreadsheet workbook snapshot
