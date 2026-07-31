import axios from "./axios"; // Importing axios instance (preconfigured with base URL and interceptors)

const ENDPOINT = "/api/attendance"; // Base endpoint for all attendance-related requests

export const getAttendanceByUserId = (userId) => axios.get(`${ENDPOINT}/user/${userId}`); // Fetch attendance records for a specific user
export const getLastAttendanceByUserId = (userId) => axios.get(`${ENDPOINT}/last/${userId}`); // Fetch the last attendance record for a user
export const createAttendance = (data) => axios.post(ENDPOINT, data); // Create a new attendance record (check-in)
export const updateAttendance = (data) => axios.put(ENDPOINT, data); // Update attendance record (check-out)
export const lunchInAttendance = (data) => axios.put(`${ENDPOINT}/lunch-in`, data);
export const lunchOutAttendance = (data) => axios.put(`${ENDPOINT}/lunch-out`, data);
// UI Break In = start break; UI Break Out = end break
export const breakInAttendance = (data) => axios.put(`${ENDPOINT}/break-in`, data);
export const breakOutAttendance = (data) => axios.put(`${ENDPOINT}/break-out`, data);
export const getBreaksByUserId = (userId) =>
  axios.get(`${ENDPOINT}/breaks/user/${userId}`);

