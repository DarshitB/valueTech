// API utility functions for officer
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/officers"; // Base endpoint for all state-related requests

export const getOfficers = () => axios.get(ENDPOINT); // Fetch all officer
export const getOfficerById = (id) => axios.get(`${ENDPOINT}/${id}`); // Get officer by ID
export const createOfficer = (data) => axios.post(ENDPOINT, data); // Add officer city
export const updateOfficer = (id, payload) =>
  axios.put(`${ENDPOINT}/${id}`, payload); // Update officer city
export const deleteOfficer = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a officer by ID