// API utility functions for branches
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/bank-branch"; // Base endpoint for all state-related requests

export const getBranches = () => axios.get(ENDPOINT); // Fetch all branches
export const getBranchById = (id) => axios.get(`${ENDPOINT}/${id}`); // Get branch by ID
export const createBranch = (data) => axios.post(ENDPOINT, data); // Add branch city
export const updateBranch = (id, payload) =>
  axios.put(`${ENDPOINT}/${id}`, payload); // Update branch city
export const deleteBranch = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a branch by ID
