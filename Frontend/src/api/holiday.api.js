import axios from "./axios";

const ENDPOINT = "/api/holidays";

export const getHolidays = (params) => axios.get(ENDPOINT, { params });
export const createHoliday = (data) => axios.post(ENDPOINT, data);
export const deleteHoliday = (id) => axios.delete(`${ENDPOINT}/${id}`);
