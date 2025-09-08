const knex = require('knex');
const config = require('../knexfile');

// Use NODE_ENV to decide the config (default to 'development' if not set)
const environment = process.env.NODE_ENV || "development";
const db = knex(config[environment]);

console.log(`📦 DB Connected using "${environment}" configuration`);

/* const db = knex(config.development); */ // Initialize Knex with the development configuration
module.exports = db; 
// This file sets up the database connection using Knex.js