import axios from "./axios"; // Importing axios instance (preconfigured with base URL and interceptors)

const ENDPOINT = "/api/permissions"; // Base endpoint for all permissions-related requests

export const getAllPermissions  = () => axios.get(`${ENDPOINT}/all`); // Get all permissions
export const getRoleWisePermissions  = () => axios.get(`${ENDPOINT}/role-wise`); // Get permissions assigned to roles
export const updatePermissionsInBulk  = (data) => axios.put(`${ENDPOINT}/role-bulk`, data); // Update permissions for multiple roles
