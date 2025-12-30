/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 * 
 * Migration for report_ce and report_ce_flexible_fields tables
 * 
 * report_ce table mirrors the structure of report_machinery
 * report_ce_flexible_fields mirrors report_machinery_flexible_fields
 */
exports.up = async function (knex) {
  // Create report_ce table
  await knex.schema.createTable("report_ce", (table) => {
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
    table.string("ref_no_id", 255).nullable();
    table.string("ref_no_month", 255).nullable();
    table.string("rev_report_date", 255).nullable();

    // Report and valuer information
    table.string("valuer_name", 255).nullable();
    table.string("license_no", 255).nullable();
    table.string("valuer_contact", 255).nullable();

    table.string("valuation_purpose", 255).nullable();
    table.text("initiated_by").nullable();

    // Inspection details
    table.string("date_of_inspection", 255).nullable();
    table.text("place_of_inspection").nullable();

    // Owner information
    table.string("registered_owner_name", 255).nullable();
    table.text("registered_owner_address").nullable();
    table.string("proposed_owner_name", 255).nullable();
    table.text("proposed_owner_address").nullable();

    // Asset registration/details (mirroring machinery fields)
    table.text("inspected_equipment_heading").nullable();

    table.string("registration_no", 255).nullable();
    table.string("registration_date", 255).nullable();
    table.string("registered_location", 255).nullable();

    table.string("owner_serial_no", 255).nullable();
    table.string("manufacture_year", 255).nullable();
    table.string("asset_make", 255).nullable();
    table.string("model", 255).nullable();

    table.string("engine_no_heading", 255).nullable();
    table.string("engine_no_detail", 255).nullable();
    table.string("crane_chassis_heading", 255).nullable();
    table.string("crane_chassis_no", 255).nullable();
    table.string("body_type", 255).nullable();
    table.string("crane_model_code", 255).nullable();

    table.string("hours_meter_reading", 255).nullable();
    table.string("invoice_no_date", 255).nullable();
    table.string("invoice_no", 255).nullable();
    table.string("invoice_date", 255).nullable();

    // Hypothecation details
    table.text("hyp_with").nullable();
    table.string("hyp_from_date", 255).nullable();

    table.text("comments_on_equipment_heading").nullable();

    table.string("asset_classification", 255).nullable();
    table.string("no_of_cylinder", 255).nullable();

    // Condition assessment
    table.string("engine_condition", 255).nullable();
    table.string("chassis_condition", 255).nullable();
    table.string("body_condition", 255).nullable();
    table.string("cabin_condition", 255).nullable();
    table.string("electrical_condition", 255).nullable();
    table.string("gear_transmission", 255).nullable();
    
    table.string("battery_available", 255).nullable();
    table.string("machine_weight_heading", 255).nullable();
    table.string("gross_machine_weight", 255).nullable();

    // Fixed but flexible heading/value pairs
    table.string("fix_but_flex_heading_1", 255).nullable();
    table.string("fix_but_flex_value_1", 255).nullable();
    table.string("fix_but_flex_heading_2", 255).nullable();
    table.string("fix_but_flex_value_2", 255).nullable();
    table.string("fix_but_flex_heading_3", 255).nullable();
    table.string("fix_but_flex_value_3", 255).nullable();
    
    table.string("fix_but_flex_title_1", 255).nullable();
    table.string("fix_but_flex_title_2", 255).nullable();
    table.string("fix_but_flex_title_3", 255).nullable();

    table.string("fix_but_flex_heading_4", 255).nullable();
    table.string("fix_but_flex_value_4", 255).nullable();
    table.string("fix_but_flex_heading_5", 255).nullable();
    table.string("fix_but_flex_value_5", 255).nullable();
    table.string("fix_but_flex_heading_6", 255).nullable();
    table.string("fix_but_flex_value_6", 255).nullable();

    table.string("fix_but_flex_heading_7", 255).nullable();
    table.string("fix_but_flex_value_7", 255).nullable();
    table.string("fix_but_flex_heading_8", 255).nullable();
    table.string("fix_but_flex_value_8", 255).nullable();
    table.string("fix_but_flex_heading_9", 255).nullable();
    table.string("fix_but_flex_value_9", 255).nullable();

    table.string("fix_but_flex_heading_10", 255).nullable();
    table.string("fix_but_flex_value_10", 255).nullable();
    table.string("fix_but_flex_heading_11", 255).nullable();
    table.string("fix_but_flex_value_11", 255).nullable();
    table.string("fix_but_flex_heading_12", 255).nullable();
    table.string("fix_but_flex_value_12", 255).nullable();
    
    table.string("fix_but_flex_top_heading_13", 255).nullable();
    table.string("fix_but_flex_heading_13", 255).nullable();
    table.string("fix_but_flex_value_13", 255).nullable();
    table.string("fix_but_flex_heading_14", 255).nullable();
    table.string("fix_but_flex_value_14", 255).nullable();
    table.string("fix_but_flex_heading_15", 255).nullable();
    table.string("fix_but_flex_value_15", 255).nullable();

    table.string("fix_but_flex_heading_16", 255).nullable();
    table.string("fix_but_flex_value_16", 255).nullable();
    table.string("fix_but_flex_heading_17", 255).nullable();
    table.string("fix_but_flex_value_17", 255).nullable();

    table.string("fix_but_flex_heading_18", 255).nullable();
    table.string("fix_but_flex_value_18", 255).nullable();
    table.string("fix_but_flex_heading_19", 255).nullable();
    table.string("fix_but_flex_value_19", 255).nullable();
    table.string("fix_but_flex_heading_20", 255).nullable();
    table.string("fix_but_flex_value_20", 255).nullable();

    table.string("fix_but_flex_heading_21", 255).nullable();
    table.string("fix_but_flex_value_21", 255).nullable();
    table.string("fix_but_flex_heading_22", 255).nullable();
    table.string("fix_but_flex_value_22", 255).nullable();
    table.string("fix_but_flex_heading_23", 255).nullable();
    table.string("fix_but_flex_value_23", 255).nullable();

    table.string("fix_but_flex_heading_24", 255).nullable();
    table.string("fix_but_flex_value_24", 255).nullable();
    table.string("fix_but_flex_heading_25", 255).nullable();
    table.string("fix_but_flex_value_25", 255).nullable();

    table.string("damages_if_any", 255).nullable();

    // Document verification
    table.text("rc_permit_tax_fitness_insurance_heading").nullable();
 
    table.string("bill_of_entry", 255).nullable();
    table.string("proforma_invoice_verified", 255).nullable();
    table.string("tax_upto", 255).nullable();
    table.string("bill_of_lading", 255).nullable();

    table.string("chartered_engineer_certificate", 255).nullable();
    table.string("fitness_upto", 255).nullable();

    // Insurance details
    table.string("insurance_co_name", 255).nullable();
    table.string("policy_no", 255).nullable();
    table.string("insurance_valid_date", 255).nullable();
    table.string("insured_value", 255).nullable();
    table.string("insurance_verified", 255).nullable();

    // Valuation details
    table.text("overall_feedback_heading").nullable();
    
    table.string("invoice_cost", 255).nullable();
    table.string("depreciation", 255).nullable();
    table.string("depreciation_value", 255).nullable();
    table.string("appraiser_value", 255).nullable();
    table.string("fair_market_value_heading", 255).nullable();
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

  // Create report_ce_flexible_fields table
  await knex.schema.createTable("report_ce_flexible_fields", (table) => {
    // Primary key
    table.increments("id").primary();

    // Foreign key to report_ce table
    table.integer("report_id").unsigned().notNullable()
      .references("id").inTable("report_ce").onDelete("CASCADE");

    // Flexible field structure
    table.string("section_name", 255).nullable();
    table.integer("col_span").nullable();
    table.string("field_label", 255).nullable();
    table.text("field_value").nullable();
    table.integer("field_order").nullable();

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
  await knex.schema.dropTableIfExists("report_ce_flexible_fields");
  await knex.schema.dropTableIfExists("report_ce");
};


