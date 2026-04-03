/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 * 
 * Migration for report_avr and report_avr_flexible_fields tables
 * 
 * report_avr table stores AVR (Asset Valuation Report) with all fields as nullable
 * except for foreign key constraints and audit fields
 * 
 * report_avr_flexible_fields table stores additional flexible fields for AVR reports
 * allowing dynamic field addition without schema changes
 */
exports.up = async function (knex) {
  // Create report_avr table
  await knex.schema.createTable("report_avr", (table) => {
    // Primary key
    table.increments("id").primary();
    
    // Foreign key to orders table
    table.integer("order_id").unsigned().notNullable()
      .references("id").inTable("orders").onDelete("CASCADE");
      
    // Reference number fields
    table.string("ref_no_year", 255).nullable();
    table.string("ref_no_bank", 255).nullable();
    table.string("ref_no_code", 255).nullable();
    table.string("ref_no_id", 255).nullable();
    table.string("ref_no_month", 255).nullable();
    table.string("lan_no", 255).nullable();
    
    // Report and bank information
    table.string("report_date", 255).nullable();
    table.string("bank_name", 255).nullable();
    table.string("branch_name", 255).nullable();
    table.string("state_name", 255).nullable();
    
    // Officer and inspection details
    table.string("model_number", 255).nullable();
    table.string("officer_name", 255).nullable();
    table.string("officer_designation", 255).nullable();
    table.string("inspected_item", 255).nullable();
    table.string("inspected_date", 255).nullable();
    table.text("inspection_address").nullable();
    
    // Customer and location information
    table.string("customer_name", 255).nullable();
    table.text("address_as_per_kyc").nullable();
    table.text("machinery_locations").nullable();
    table.string("lan_city_no", 255).nullable();
    
    // Financial details
    table.string("date_of_disbursement", 255).nullable();
    table.string("date_of_invoice_delivery_no", 255).nullable();
    table.text("invoice_price").nullable();
    table.string("lien_of_bank", 255).nullable();
    
    // Asset identification details
    table.string("chassis_no", 255).nullable();
    table.string("machine_serial_no", 255).nullable();
    table.string("engine_no", 255).nullable();
    table.string("regn_no", 255).nullable();
    
    // Asset status and condition
    table.string("installed_running", 255).nullable();
    table.string("installed_asset_whether_functional_or_not", 255).nullable();
    table.string("class_make_of_asset", 255).nullable();
    table.string("year_of_mfg", 255).nullable();
    table.string("invoice_purchase_order_no", 255).nullable();
    table.text("pro_owner_address").nullable();
    
    // Insurance details
    table.string("insurer_policy_no", 255).nullable();
    table.string("insurance_validity_insured_value", 255).nullable();
    table.string("insurance_having_lien_of_bank", 255).nullable();
    
    // Technical specifications
    table.string("total_crane_weight_capacity", 255).nullable();
    table.string("material_usefulness", 255).nullable();
    table.string("colour", 255).nullable();
    table.text("observation").nullable();
    table.string("status_of_machine", 255).nullable();
    
    // Survey and visit details
    table.string("visit_done_by", 255).nullable();
    table.string("place", 255).nullable();
    table.string("date_time", 255).nullable();
    table.string("surveyor", 255).nullable();
    table.string("license_no", 255).nullable();
    table.string("surveyor_location", 255).nullable();
    
    // Audit fields
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
  });

  // Create report_avr_flexible_fields table
  await knex.schema.createTable("report_avr_flexible_fields", (table) => {
    // Primary key
    table.increments("id").primary();
    
    // Foreign key to report_avr table
    table.integer("report_id").unsigned().notNullable()
      .references("id").inTable("report_avr").onDelete("CASCADE");
    
    // Flexible field structure
    table.string("section_name", 255).nullable(); // Section where field belongs
    table.integer("col_span").nullable(); // Column span for display
    table.string("field_label", 255).nullable(); // Display label
    table.text("field_value").nullable(); // Field value
    table.integer("field_order").nullable(); // Display order
    
    // Audit fields
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
    
    // Indexes for better performance
    table.index("report_id");
    table.index("section_name");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // Drop tables in reverse order due to foreign key constraints
  await knex.schema.dropTableIfExists("report_avr_flexible_fields");
  await knex.schema.dropTableIfExists("report_avr");
};