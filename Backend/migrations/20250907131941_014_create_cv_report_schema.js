/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 * 
 * Migration for report_cv and report_cv_flexible_fields tables
 * 
 * report_cv table stores commercial vehicle valuation reports with all fields as nullable
 * except initiated_by which is a text field, all others are varchar(255)
 * 
 * report_cv_flexible_fields table stores additional flexible fields for cv reports
 * allowing dynamic field addition without schema changes
 */
exports.up = async function (knex) {
  // Create report_cv table
  await knex.schema.createTable("report_cv", (table) => {
    // Primary key
    table.increments("id").primary();
    
    // Foreign key to orders table
    table.integer("order_id").unsigned().notNullable()
      .references("id").inTable("orders").onDelete("CASCADE");
      
    table.text("valueation_report_for_heading").nullable();
    table.text("general_details_heading").nullable();

    // Reference number fields
    table.string("ref_no_year", 255).nullable();
    table.string("ref_no_bank", 255).nullable();
    table.string("state_name", 255).nullable();
    table.string("ref_no_code", 255).nullable();
    table.string("ref_no_month", 255).nullable();
    table.string("ref_no_id", 255).nullable();
    
    // Report and valuer information
    table.string("report_date",255).nullable();
    table.string("valuer_name", 255).nullable();
    table.string("license_no", 255).nullable();
    table.string("valuer_contact", 255).nullable();
    table.string("valuation_purpose", 255).nullable();
    table.text("initiated_by").nullable(); // Text field as specified
    
    // Inspection details
    table.string("date_of_inspection",255).nullable();
    table.text("place_of_inspection").nullable();
    
    // Owner information
    table.string("registered_owner_name", 255).nullable();
    table.text("registered_owner_address").nullable();
    table.string("proposed_owner_name", 255).nullable();
    table.text("proposed_owner_address").nullable();
    
    table.text("inspected_equipment_heading").nullable();

    // Vehicle registration details
    table.string("registration_no", 255).nullable();
    table.string("registration_date",255).nullable();
    table.string("registered_location", 255).nullable();
    table.string("owner_serial_no", 255).nullable();
    table.string("manufacture_year", 255).nullable();
    table.string("asset_make", 255).nullable();
    table.string("model", 255).nullable();
    table.string("engine_no_detail", 255).nullable();
    table.string("chassis_no", 255).nullable();
    table.string("body_type", 255).nullable();
    table.string("fuel_type", 255).nullable();
    table.string("chassis_no_type", 255).nullable();
    table.string("kilometer_reading", 255).nullable();
    table.string("invoice_no_date", 255).nullable();
    
    // Hypothecation details
    table.text("hyp_with").nullable();
    table.string("hyp_from_date",255).nullable();

    table.text("comments_on_equipment_heading").nullable();

    table.string("asset_classification", 255).nullable();
    table.string("no_of_cylinder", 255).nullable();
    
    // Vehicle condition assessment
    table.string("engine_condition", 255).nullable();
    table.string("chassis_condition", 255).nullable();
    table.string("body_condition", 255).nullable();
    table.string("cabin_condition", 255).nullable();
    table.string("electrical_condition", 255).nullable();
    table.string("gear_transmission", 255).nullable();
    table.string("battery_available", 255).nullable();
    table.string("gross_vehicle_weight", 255).nullable();
    
    // Tyre information
    table.string("front_tyre_no", 255).nullable();
    table.string("front_tyre_condition", 255).nullable();
    table.string("middle_tyre_no", 255).nullable();
    table.string("middle_tyre_condition", 255).nullable();
    table.string("rear_tyre_no", 255).nullable();
    table.string("rear_tyre_condition", 255).nullable();
    table.string("no_of_tyres", 255).nullable();
    table.string("stepney", 255).nullable();
    
    // Technical specifications
    table.string("horse_power", 255).nullable();
    table.string("mechanical_unit_condition", 255).nullable();
    table.string("cubic_capacity", 255).nullable();
    table.string("suspension", 255).nullable();
    table.string("seating_capacity", 255).nullable();
    table.string("tool_kit_available", 255).nullable();
    table.string("vehicle_colour", 255).nullable();
    table.string("color_condition", 255).nullable();
    table.string("damages_if_any", 255).nullable();
    
    // Document verification
    table.text("rc_permit_tax_fitness_insurance_heading").nullable();

    table.string("rc_book_verified", 255).nullable();
    table.string("invoice_verified", 255).nullable();
    table.string("tax_upto", 255).nullable();
    table.string("permit_upto", 255).nullable();
    table.string("permit_type", 255).nullable();
    table.string("fitness_upto", 255).nullable();
    
    // Insurance details
    table.string("insurance_co_name", 255).nullable();
    table.string("policy_no", 255).nullable();
    table.string("period_of_insurance", 255).nullable();
    table.string("insured_value", 255).nullable();
    table.string("insurance_verified", 255).nullable();
    
    // Valuation details
    table.text("overall_feedback_heading").nullable();

    table.string("current_invoice_cost", 255).nullable();
    table.string("depreciation", 255).nullable();
    table.string("depreciation_value", 255).nullable();
    table.string("appraiser_value", 255).nullable();
    table.string("fair_market_value", 255).nullable();
    table.string("amount_in_words", 255).nullable();
    
    // Report completion details
    table.string("no_of_photograph", 255).nullable();
    table.string("no_of_collage", 255).nullable();
    table.text("valuer_comments_remarks").nullable();
    table.text("declaration").nullable();
    table.text("disclaimer").nullable();
    table.text("chassis_no_pencil_impression").nullable();
    
    // Audit fields
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
  });

  // Create report_cv_flexible_fields table
  await knex.schema.createTable("report_cv_flexible_fields", (table) => {
    // Primary key
    table.increments("id").primary();
    
    // Foreign key to report_cv table
    table.integer("report_id").unsigned().notNullable()
      .references("id").inTable("report_cv").onDelete("CASCADE");
    
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
  await knex.schema.dropTableIfExists("report_cv_flexible_fields");
  await knex.schema.dropTableIfExists("report_cv");
};
