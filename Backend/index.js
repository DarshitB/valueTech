require("dotenv").config();
const app = require("./src/app");
const logger = require("./src/utils/logger");

const PORT = process.env.PORT || 5000;

// Log current environment
console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
