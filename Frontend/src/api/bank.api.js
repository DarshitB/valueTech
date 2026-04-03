// API utility functions for banks
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/bank"; // Base endpoint for all state-related requests

export const getBanks = () => axios.get(ENDPOINT); // Fetch all banks
export const getBankById = (id) => axios.get(`${ENDPOINT}/${id}`); // Get bank by ID
export const createBank = (data) => axios.post(ENDPOINT, data); // Add bank city
export const updateBank = (id, payload) =>
  axios.put(`${ENDPOINT}/${id}`, payload); // Update bank city
export const deleteBank = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a bank by ID
