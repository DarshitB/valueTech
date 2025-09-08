import axios from "./axios";

const ENDPOINT = "/api/collage-generator";

// Generate collage
export const collageGenerator = (payload) =>
  axios.post(`${ENDPOINT}/generate`, payload);
