import axios from "./axios"; // Importing axios instance (preconfigured with base URL and interceptors)

const ENDPOINT = "/api/roles"; // Base endpoint for all roles-related requests

export const getRoles = () => axios.get(ENDPOINT); // Fetch all roles
export const getRoleById = (id) => axios.get(`${ENDPOINT}/${id}`); // Fetch a single roles by its ID
export const createRole = (data) => axios.post(ENDPOINT, data); // Add a new roles
export const updateRole = (id, payload) => axios.put(`${ENDPOINT}/${id}`, payload); // Update an existing roles
export const deleteRole = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a roles by ID
