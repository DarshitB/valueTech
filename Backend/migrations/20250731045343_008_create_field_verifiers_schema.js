/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Create 'field_verifiers' table
  await knex.schema.createTable("field_verifiers", (table) => {
    table.increments("id").primary(); // PK

    table.string("name").notNullable(); // Verifier name
    table.string("mobile", 15).notNullable(); // Unique mobile
    table.string("username").nullable(); // Optional username
    table.string("password").notNullable(); // Hashed password

    table.integer("city_id").unsigned().notNullable()
        .references("id").inTable("cities").onDelete("CASCADE"); // FK to cities
    table.string("upi_id").nullable(); // store upi id 
    table.string("upi_QR_image_url").nullable(); // store upi qur code image url
    
    // Status column (optional, for soft disabling user)
    table.boolean("is_active").defaultTo(true);
    
    // More data to for filed verifier
    table.string("bank_name").nullable(); // store bank name
    table.string("verifier_name_in_bank").nullable(); // store verifier name which is same as in the bank
    table.string("bank_address").nullable(); // store bank address
    table.string("bank_account_type").nullable(); // store bank account type
    table.string("bank_account_number").nullable(); // store bank account number
    table.string("bank_IFSC_code").nullable(); // store bank ifsc code

    table.string("adharcard_image_url").nullable(); // store adhar card image url

    // Audit columns
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table
      .integer("created_by")
      .unsigned()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    table.timestamp("updated_at").nullable();
    table
      .integer("updated_by")
      .unsigned()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    table.timestamp("deleted_at").nullable();
    table
      .integer("deleted_by")
      .unsigned()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
  });

  // Create 'field_verifier_logins' table
  await knex.schema.createTable("field_verifier_logins", (table) => {
    table.increments("id").primary(); // PK

    table
      .integer("field_verifier_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("field_verifiers")
      .onDelete("CASCADE");

    table.string("token").notNullable(); // JWT Token

    table.timestamp("login_at").notNullable(); // Login time
    table.timestamp("expires_at").notNullable(); // Valid till

    // Metadata: device or IP info (optional)
    table.string("ip_address").nullable();
    table.string("device_info").nullable();

    // Audit columns
    table.timestamp("deleted_at").nullable();
    table
      .integer("deleted_by")
      .unsigned()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("field_verifier_logins");
  await knex.schema.dropTableIfExists("field_verifiers");
};
