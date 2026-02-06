import axios from "./axios";

const ENDPOINT = "/api/collage-generator";

// Generate collage
export const collageGenerator = (payload) =>
  axios.post(`${ENDPOINT}/generate`, payload);

// Generate text-image collage
export const generateTextImageCollage = (payload) =>
  axios.post(`${ENDPOINT}/generate-text-image`, payload);
