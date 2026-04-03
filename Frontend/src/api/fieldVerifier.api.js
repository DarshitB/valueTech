// API utility functions for field Verifier
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/field-verifiers"; // Base endpoint for all state-related requests

export const getFieldVerifiers = () => axios.get(ENDPOINT); // Fetch all field Verifier
export const getFieldVerifierById = (id) => axios.get(`${ENDPOINT}/${id}`); // Get field Verifier by ID
export const getFieldVerifierByMobile = (mobile) =>
  axios.post(`${ENDPOINT}/check-mobile`, { mobile }); // check mobile number exist or not
export const getFieldVerifierByUsername = (username) =>
  axios.post(`${ENDPOINT}/check-username`, { username }); // check username exist or not
export const createFieldVerifier = (data) => axios.post(ENDPOINT, data); // Add field Verifier city
export const updateFieldVerifier = (id, payload) =>
  axios.put(`${ENDPOINT}/${id}`, payload); // Update field Verifier city
export const toggleFieldVerifierStatus = (id) =>
  axios.patch(`${ENDPOINT}/${id}/toggle-status`);
export const deleteFieldVerifier = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a field Verifier by ID

export const getFieldVerifierLogins = () => axios.get(`${ENDPOINT}/logins/all`); // Fetch all field Verifier logins
export const deleteFieldVerifierLogins = (id) =>
  axios.delete(`${ENDPOINT}/logins/${id}`); // Delete a field Verifier logins by ID
