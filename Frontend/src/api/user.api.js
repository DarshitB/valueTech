import axios from "./axios"; // Importing axios instance (preconfigured with base URL and interceptors)

const ENDPOINT = "/api/users"; // Base endpoint for all users-related requests

export const getUsers = () => axios.get(ENDPOINT); // Fetch all users
export const getUsersById = (id) => axios.get(`${ENDPOINT}/${id}`); // Fetch a single users by its ID
export const getUsersByMobile = (mobile) =>
  axios.post(`${ENDPOINT}/check-mobile`, { mobile }); // check mobile umber exist or not
export const getUsersByEmail = (email) =>
  axios.post(`${ENDPOINT}/check-email`, { email }); // check email exist or not
export const createUsers = (data) => axios.post(ENDPOINT, data); // Add a new users
export const updateUsers = (id, payload) =>
  axios.put(`${ENDPOINT}/${id}`, payload); // Update an existing users
export const deleteUsers = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a users by ID
