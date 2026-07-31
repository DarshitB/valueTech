import axios from "./axios";

const ENDPOINT = "/api/user-leaves";

export const getUserLeavesByUserId = (userId, params) =>
  axios.get(`${ENDPOINT}/user/${userId}`, { params });
export const createUserLeave = (data) => axios.post(ENDPOINT, data);
export const deleteUserLeave = (id) => axios.delete(`${ENDPOINT}/${id}`);
