require("dotenv").config();

module.exports = {
  development: {
    client: process.env.DB_CLIENT || "pg",
    connection: {
      host: process.env.DB_DEV_HOST,
      port: process.env.DB_DEV_PORT,
      user: process.env.DB_DEV_USER,
      password: process.env.DB_DEV_PASSWORD,
      database: process.env.DB_DEV_NAME,
    },
    migrations: {
      directory: "./migrations",
    },
    seeds: {
      directory: "./seeds",
    },
  },

  production: {
    client: process.env.DB_CLIENT || "pg",
    connection: {
      host: process.env.DB_PROD_HOST,
      port: process.env.DB_PROD_PORT,
      user: process.env.DB_PROD_USER,
      password: process.env.DB_PROD_PASSWORD,
      database: process.env.DB_PROD_NAME,
      ssl:
        process.env.DB_PROD_SSL === "true"
          ? { rejectUnauthorized: false }
          : false, // ✅ FIXED
    },
    migrations: {
      directory: "./migrations",
    },
    seeds: {
      directory: "./seeds",
    },
  },
};
