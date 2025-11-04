/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 * 
 * Migration for report_marine and report_marine_flexible_fields tables
 * 
 * report_marine_flexible_fields table stores additional flexible fields for marine reports
 * allowing dynamic field addition without schema changes
 */
exports.up = async function (knex) {
  // Create report_marine table
  await knex.schema.createTable("report_marine", (table) => {
    // Primary key
    table.increments("id").primary();
    
    // Foreign key to orders table
    table.integer("order_id").unsigned().notNullable()
      .references("id").inTable("orders").onDelete("CASCADE");
    
    // Vessel Details Section
    table.string("report_title_type", 255).nullable();
    table.string("report_title", 255).nullable();
    table.string("name_of_the_vessel", 255).nullable();
    table.string("official_no", 255).nullable();
    table.string("imo_or_regd_type", 255).nullable();
    table.string("imo_or_regd_no", 255).nullable();
    table.text("vessel_photo").nullable();
    table.string("vessel_photo_id", 255).nullable();
    table.text("client_city_state_name").nullable();
    table.string("execute_above", 255).nullable();
    table.string("valuer_name", 255).nullable();
    table.string("license_no", 255).nullable();
    table.string("inspection_location_front_page", 255).nullable();
    table.string("inspection_date_front_page", 255).nullable();
    
    table.string("ref_no_year", 255).nullable();
    table.string("ref_no_bank", 255).nullable();
    table.string("state_initial", 255).nullable();
    table.string("ref_no_code", 255).nullable();
    table.string("ref_no_id", 255).nullable();
    table.string("report_date", 255).nullable();
    table.string("report_date", 255).nullable();
    table.text("client_name_with_full_address").nullable();
    table.string("imo_official_regd_no", 255).nullable();
    
    // PARTICULARS OF THE VESSEL
    table.string("registry_vessel_date", 255).nullable();
    table.text("registry_vessel_location").nullable();
    table.text("registered_or_proposed_owner").nullable();
    table.string("registered_or_proposed_owner_address", 255).nullable();
    table.string("purpose_of_valuation", 255).nullable();
    table.string("marine_vessel_name", 255).nullable();
    table.string("type_or_description_of_vessel", 255).nullable();
    table.string("mmsi_no", 255).nullable();
    table.string("class_notation", 255).nullable();
    table.string("call_sign_class_notation_machinery", 255).nullable();
    table.string("current_registry_port", 255).nullable();
    table.string("classification_of_registry", 255).nullable();
    table.string("present_flag", 255).nullable();
    table.string("port_of_registry", 255).nullable();
    table.string("no_of_registry_registration_no", 255).nullable();
    table.string("registered_under", 255).nullable();
    table.string("year_of_built", 255).nullable();
    table.string("year_of_built_inwords", 255).nullable();
    table.string("place_of_built", 255).nullable();
    table.string("vessel_built_by", 255).nullable();
    table.string("type_of_propelled", 255).nullable();
    table.string("length_of_vessel", 255).nullable();
    table.string("loa_length_overall", 255).nullable();
    table.string("breadth_of_vessel", 255).nullable();
    table.string("depth_of_vessel", 255).nullable();
    table.string("draught_of_vessel", 255).nullable();
    table.string("summer_draft_of_vessel", 255).nullable();
    table.string("length_of_stroke", 255).nullable();
    table.string("ballast_water_capacity", 255).nullable();
    table.string("light_ship", 255).nullable();
    table.string("propeller", 255).nullable();
    table.string("gross_registered_tonnage_grt", 255).nullable();
    table.string("net_registered_tonnage_nrt", 255).nullable();
    table.string("deadweight_tonnage_dwt", 255).nullable();
    table.string("free_board", 255).nullable();
    table.string("operating_speed_max_speed", 255).nullable();
    table.string("regd_accommodation", 255).nullable();
    table.string("bollard_pull_sustained", 255).nullable();
    table.string("type_of_propulsion", 255).nullable();
    table.string("no_of_decks", 255).nullable();
    table.string("no_of_masts", 255).nullable();
    table.string("no_of_bulkheads", 255).nullable();
    table.string("rigged_not_rigged", 255).nullable();
    table.string("stem_type", 255).nullable();
    table.string("stern_type", 255).nullable();
    table.string("built_type", 255).nullable();
    table.string("material_of_construction", 255).nullable();
    
    //OWNERSHIP AND OPERATION:
    table.string("registered_owner", 255).nullable();
    table.string("technical_operator", 255).nullable();
    table.string("commercial_operator", 255).nullable();
    table.string("disponent_owner", 255).nullable();
    
    // PROTECTION & INDEMNITY POLICY :
    table.string("institution_name_insurance_policy", 255).nullable();
    table.string("certificate_no_insurance_policy", 255).nullable();
    table.string("date_of_issue_insurance_policy", 255).nullable();
    table.string("p_i_clause_insurance_policy", 255).nullable();
    table.string("co_assured_insurance_policy", 255).nullable();
    table.string("start_period_of_p_i_policy_insurance_policy", 255).nullable();
    table.string("end_period_of_p_i_policy_insurance_policy", 255).nullable();
    table.string("insured_value_insurance_policy", 255).nullable();
    table.string("insured_value_in_words_insurance_policy", 255).nullable();
    
    // INSURANCE FOR BUNKER OIL POLLUTION DAMAGE POLICY :
    table.string("institution_name_damage_policy", 255).nullable();
    table.string("certificate_type_damage_policy", 255).nullable();
    table.string("type_of_security_damage_policy", 255).nullable();
    table.text("insurer_guarantor_name_address_damage_policy").nullable();
    table.string("policy_ref_no_damage_policy", 255).nullable();
    table.string("date_of_issue_damage_policy", 255).nullable();
    table.string("start_period_of_damage_policy", 255).nullable();
    table.string("end_period_of_damage_policy", 255).nullable();
    
    // WAR RISK INSURANCE POLICY :
    table.string("insurance_company_name_war_risk_policy", 255).nullable();
    table.string("policy_no_war_risk_policy", 255).nullable();
    table.string("start_period_of_war_risk_policy", 255).nullable();
    table.string("end_period_of_war_risk_policy", 255).nullable();
    table.string("insured_value_war_risk_policy", 255).nullable();
    table.string("insured_value_in_words_war_risk_policy", 255).nullable();
    
    // HULL & MACHINERY INSURANCE POLICY :
    table.string("insurance_company_name_hull_machinery_policy", 255).nullable();
    table.string("policy_no_hull_machinery_policy", 255).nullable();
    table.string("start_period_of_hull_machinery_policy", 255).nullable();
    table.string("end_period_of_hull_machinery_policy", 255).nullable();
    table.string("insured_value_hull_machinery_policy", 255).nullable();
    table.string("insured_value_in_words_hull_machinery_policy", 255).nullable();
    
    // OTHER DETAILS :
    table.string("trading_limit", 255).nullable();
    table.string("collision_bulkhead", 255).nullable();
    table.string("vessel_bottom_type", 255).nullable();
    table.string("ex_name_flag", 255).nullable();
    table.string("previous_registry", 255).nullable();
    table.string("keel_to_masthead_ktm", 255).nullable();
    table.string("manifold_bcm_scm", 255).nullable();
    
    // CLASSIFICATION
    table.string("classification_society", 255).nullable();
    table.string("is_vessel_subject_to_any_conditions", 255).nullable();
    table.string("if_classification_society_changed_name", 255).nullable();
    table.string("does_the_vessel_have_ice_class", 255).nullable();
    table.string("date_place_of_last_dry_dock", 255).nullable();
    table.string("start_date_next_dry_dock_due_next_annual_survey_due", 255).nullable();
    table.string("end_date_next_dry_dock_due_next_annual_survey_due", 255).nullable();
    table.string("start_date_of_last_special_survey_next_special_survey_due", 255).nullable();
    table.string("end_date_of_last_special_survey_next_special_survey_due", 255).nullable();
    table.string("if_ship_has_condition_assessment", 255).nullable();
    
    // HULL DESIGN :
    table.text("hull_design").nullable();
    
    // Present Condition:
    table.text("present_condition_1").nullable();
    table.text("present_condition_2").nullable();
    table.text("present_condition_3").nullable();
    
    // AUXILIARY MACHINERIES - HARBOUR GENERATORS (IF AVAILABLE)
    table.text("auxiliary_machinerie_other_auxiliary_machinerie_condition").nullable();
    
    // STEERING :
    table.text("steering_details").nullable();
    
    // PROPELLER (ASD VESSEL) :
    table.string("propeller_asd_vessel_condition", 255).nullable();
    
    // DIMENSIONS
    table.string("keel_to_masthead_ktm_dimensions", 255).nullable();
    table.string("distance_bridge_front_to_center_of_manifold_dimensions", 255).nullable();
    table.string("bow_to_center_manifold_bcm_dimensions", 255).nullable();
    table.string("stern_to_center_manifold_scm_dimensions", 255).nullable();
    table.string("forward_to_mid_point_manifold_lightship_dimensions", 255).nullable();
    table.string("forward_to_mid_point_manifold_normal_ballast_dimensions", 255).nullable();
    table.string("forward_to_mid_point_manifold_summer_dwt_dimensions", 255).nullable();
    table.string("aft_to_mid_point_manifold_lightship_dimensions", 255).nullable();
    table.string("aft_to_mid_point_manifold_normal_ballast_dimensions", 255).nullable();
    table.string("aft_to_mid_point_manifold_summer_dwt_dimensions", 255).nullable();
    table.string("parallel_body_length_lightship_dimensions", 255).nullable();
    table.string("parallel_body_length_normal_ballast_dimensions", 255).nullable();
    table.string("parallel_body_length_summer_dwt_dimensions", 255).nullable();
    
    // LOADLINE INFORMATION
    table.string("summer_Freeboard_dimensions", 255).nullable();
    table.string("summer_Draft_dimensions", 255).nullable();
    table.string("summer_Deadweight_dimensions", 255).nullable();
    table.string("summer_Displacement_dimensions", 255).nullable();
    table.string("winter_Freeboard_dimensions", 255).nullable();
    table.string("winter_Draft_dimensions", 255).nullable();
    table.string("winter_Deadweight_dimensions", 255).nullable();
    table.string("winter_Displacement_dimensions", 255).nullable();
    table.string("tropical_Freeboard_dimensions", 255).nullable();
    table.string("tropical_Draft_dimensions", 255).nullable();
    table.string("tropical_Deadweight_dimensions", 255).nullable();
    table.string("tropical_Displacement_dimensions", 255).nullable();
    table.string("lightship_Freeboard_dimensions", 255).nullable();
    table.string("lightship_Draft_dimensions", 255).nullable();
    table.string("lightship_Deadweight_dimensions", 255).nullable();
    table.string("lightship_Displacement_dimensions", 255).nullable();
    table.string("normal_ballast_condition_Freeboard_dimensions", 255).nullable();
    table.string("normal_ballast_condition_Draft_dimensions", 255).nullable();
    table.string("normal_ballast_condition_Deadweight_dimensions", 255).nullable();
    table.string("normal_ballast_condition_Displacement_dimensions", 255).nullable();
    table.string("segregated_ballast_condition_Freeboard_dimensions", 255).nullable();
    table.string("segregated_ballast_condition_Draft_dimensions", 255).nullable();
    table.string("segregated_ballast_condition_Deadweight_dimensions", 255).nullable();
    table.string("segregated_ballast_condition_Displacement_dimensions", 255).nullable();
    table.string("fwa_tpc_at_summer_draft_Freeboard_dimensions", 255).nullable();
    table.string("fwa_tpc_at_summer_draft_Draft_dimensions", 255).nullable();
    table.string("does_vessel_have_multiple_sdwt", 255).nullable();
    table.string("constant_excluding_fresh_water", 255).nullable();
    table.text("company_guidelines_for_under_keel_clearance_ukc").nullable();
    table.string("full_mast_summer_deadweight_dimensions", 255).nullable();
    table.string("collapsed_mast_summer_deadweight_dimensions", 255).nullable();
    table.string("full_mast_normal_ballast_dimensions", 255).nullable();
    table.string("collapsed_mast_normal_ballast_dimensions", 255).nullable();
    table.string("full_mast_lightship_dimensions", 255).nullable();
    table.string("collapsed_mast_lightship_dimensions", 255).nullable();
    
    // DOCUMENTATION
    table.string("itopf_member", 255).nullable();
    table.string("ocimf_member", 255).nullable();
    
    // CREW
    table.string("nationality_of_master_name", 255).nullable();
    table.string("number_and_nationality_of_officers", 255).nullable();
    table.string("number_and_nationality_of_crew", 255).nullable();
    table.string("common_working_language_onboard", 255).nullable();
    table.string("do_officers_speak_and_understand_english", 255).nullable();
    table.string("if_officers_ratings_employed_by_a_manning_agency_full_style", 255).nullable();
    
    // SAFETY/HELICOPTER
    table.string("is_the_vessel_operated_under_a_quality_management_system", 255).nullable();
    table.string("can_the_ship_comply_with_the_ics_helicopter_guidelines", 255).nullable();
    
    // VESSEL ACCESSORIES & CAPACITIES
    //// COATING/ANODES
    table.string("coated_cargo_tanks", 255).nullable();
    table.string("type_of_cargo_tanks", 255).nullable();
    table.string("to_what_extent_cargo_tanks", 255).nullable();
    table.string("anode_cargo_tanks", 255).nullable();
    table.string("coated_ballast_tanks", 255).nullable();
    table.string("type_of_ballast_tanks", 255).nullable();
    table.string("to_what_extent_cargo_tanks", 255).nullable();
    table.string("anode_ballast_tanks", 255).nullable();
    table.string("coated_slop_tanks", 255).nullable();
    table.string("type_of_slop_tanks", 255).nullable();
    table.string("to_what_extent_slop_tanks", 255).nullable();
    table.string("anode_slop_tanks", 255).nullable();
    //// BALLAST
    table.string("number_of_ballast_pumps", 255).nullable();
    table.string("type_of_ballast_pumps", 255).nullable();
    table.string("capacity_of_ballast_pumps", 255).nullable();
    table.string("at_what_head_ballast_pumps", 255).nullable();
    table.string("number_of_ballast_eductors", 255).nullable();
    table.string("type_of_ballast_eductors", 255).nullable();
    table.string("capacity_of_ballast_eductors", 255).nullable();
    table.string("at_what_head_ballast_eductors", 255).nullable();
    //// CARGO
    table.string("is_vessel_fitted_with_centerline_bulkhead_in_all_cargo_tanks", 255).nullable();
    //// Cargo Tank Capacities
    table.string("number_of_cargo_tanks_and_total_cubic_capacity_98", 255).nullable();
    table.string("total_cubic_capacity_98", 255).nullable();
    table.string("capacity_of_each_natural_segregation_with_double_valve", 255).nullable();
    table.string("imo_class", 255).nullable();
    table.string("number_of_slop_tanks_and_total_cubic_capacity_98", 255).nullable();
    table.string("total_cubic_capacity_98_slop_tanks", 255).nullable();
    table.string("specify_segregations_double_valve", 255).nullable();
    table.string("residual_retention_oil_tank_capacity_98", 255).nullable();
    //// SBT VESSEL
    table.string("total_sbt_capacity_and_percentage_of_sdwt_vessel_can_maintain", 255).nullable();
    table.string("percentage_of_sdwt_vessel_can_maintain", 255).nullable();
    table.string("does_vessel_meet_the_requirements_of_marpol_annex_i_reg_18_2", 255).nullable();
    //// Cargo Handling and Pumping Systems
    table.string("how_many_grades_products_can_vessel_load_discharge_with_double_valve_segregation", 255).nullable();
    table.string("type_of_cargo_containment", 255).nullable();
    table.string("with_vecs_capacity", 255).nullable();
    table.string("without_vecs_capacity", 255).nullable();
    table.string("loaded_simultaneously_through_all_manifolds_with_vecs_capacity", 255).nullable();
    table.string("loaded_simultaneously_through_all_manifolds_without_vecs_capacity", 255).nullable();
    //// CARGO CONTROL ROOM
    table.string("is_ship_fitted_with_a_cargo_control_room_ccr", 255).nullable();
    table.string("can_tank_innage_ullage_be_read_from_the_ccr", 255).nullable();
    //// GAUGING & SAMPLING
    table.string("is_gauging_system_certified_and_calibrated", 255).nullable();
    table.string("type_of_fixed_closed_tank_gauging_system_fitted", 255).nullable();
    table.string("are_high_level_alarms_fitted_to_the_cargo_tanks", 255).nullable();
    table.string("number_of_portable_gauging_units_on_board", 255).nullable();
    //// Vapor Emission Control System (VECS)
    table.string("is_a_vapour_emission_control_system_vecs_fitted", 255).nullable();
    table.string("number_of_vecs_manifolds_per_side", 255).nullable();
    table.string("size_of_vecs_manifolds_per_side", 255).nullable();
    table.string("number_of_vecs_reducers_per_side", 255).nullable();
    //// VENTING
    table.string("state_what_type_of_venting_system_is_fitted", 255).nullable();
    //// CARGO MANIFOLDS & REDUCERS
    table.string("total_number_of_cargo_manifold_connections_on_each_side", 255).nullable();
    table.string("what_type_of_valves_are_fitted_at_manifold", 255).nullable();
    table.string("what_is_the_material_rating_of_the_manifold", 255).nullable();
    table.string("does_vessel_comply", 255).nullable();
    table.string("distance_between_cargo_manifold_centers", 255).nullable();
    table.string("distance_ships_rail_to_manifold", 255).nullable();
    table.string("distance_manifold_to_ships_side", 255).nullable();
    table.string("distance_top_of_rail_to_center_of_manifold", 255).nullable();
    table.string("distance_main_deck_to_center_of_manifold", 255).nullable();
    table.string("distance_spill_tank_grating_to_center_of_manifold", 255).nullable();
    table.string("manifold_height_above_the_waterline_in_normal_ballast_at_sdwt_condition", 255).nullable();
    table.string("manifold_height_above_the_waterline_in_lightship_condition", 255).nullable();
    table.string("number_of_reducers_per_side", 255).nullable();
    table.string("is_vessel_fitted_with_a_stern_manifold_if_yes_state_size", 255).nullable();
    
    // HEATING
    table.string("type_of_cargo_tanks_heating", 255).nullable();
    table.string("coiled_cargo_tanks_heating", 255).nullable();
    table.string("material_of_cargo_tanks_heating", 255).nullable();
    table.string("type_of_slop_tanks_heating", 255).nullable();
    table.string("coiled_slop_tanks_heating", 255).nullable();
    table.string("material_of_slop_tanks_heating", 255).nullable();
    table.string("maximum_temperature_cargo_can_be_loaded_maintained_1", 255).nullable();
    table.string("maximum_temperature_cargo_can_be_loaded_maintained_2", 255).nullable();
    
    // INERT GAS & CRUDE OIL WASHING
    table.string("is_an_inert_gas_system_igs_fitted_operational", 255).nullable();
    table.string("is_igs_supplied_by_flue_gas_inert_gas_ig_generator_and_or_nitrogen", 255).nullable();
    table.string("if_nitrogen_generator_specify", 255).nullable();
    
    // CARGO PUMPS
    table.string("how_many_cargo_pumps_can_be_run_simultaneously_at_full_capacity", 255).nullable();
    table.string("sr_no_of_cargo_pumps", 255).nullable();
    table.string("type_of_cargo_pumps", 255).nullable();
    table.string("capacity_of_cargo_pumps", 255).nullable();
    table.string("at_what_head_cargo_pumps", 255).nullable();
    table.string("sr_no_of_cargo_eductors", 255).nullable();
    table.string("type_of_cargo_eductors", 255).nullable();
    table.string("capacity_of_cargo_eductors", 255).nullable();
    table.string("at_what_head_cargo_eductors", 255).nullable();
    table.string("sr_no_of_stripping", 255).nullable();
    table.string("type_of_stripping", 255).nullable();
    table.string("capacity_of_stripping", 255).nullable();
    table.string("at_what_head_stripping", 255).nullable();
    table.string("is_at_least_one_emergency_portable_cargo_pump_provided", 255).nullable();
    
    // MOORING
    //// WIRES ( ON DRUMS)
    table.string("no_of_forecastle", 255).nullable();
    table.string("diameter_of_forecastle", 255).nullable();
    table.string("material_of_forecastle", 255).nullable();
    table.string("length_of_forecastle", 255).nullable();
    table.string("breaking_of_forecastle", 255).nullable();
    table.string("no_of_main_deck_fwd", 255).nullable();
    table.string("diameter_of_main_deck_fwd", 255).nullable();
    table.string("material_of_main_deck_fwd", 255).nullable();
    table.string("length_of_main_deck_fwd", 255).nullable();
    table.string("breaking_of_main_deck_fwd", 255).nullable();
    table.string("no_of_main_deck_aft", 255).nullable();
    table.string("diameter_of_main_deck_aft", 255).nullable();
    table.string("material_of_main_deck_aft", 255).nullable();
    table.string("length_of_main_deck_aft", 255).nullable();
    table.string("breaking_of_main_deck_aft", 255).nullable();
    table.string("no_of_poop_deck", 255).nullable();
    table.string("diameter_of_poop_deck", 255).nullable();
    table.string("material_of_poop_deck", 255).nullable();
    table.string("length_of_poop_deck", 255).nullable();
    table.string("breaking_of_poop_deck", 255).nullable();
    //// WIRES TAILS
    table.string("no_of_forecastle_tails", 255).nullable();
    table.string("diameter_of_forecastle_tails", 255).nullable();
    table.string("material_of_forecastle_tails", 255).nullable();
    table.string("length_of_forecastle_tails", 255).nullable();
    table.string("breaking_of_forecastle_tails", 255).nullable();
    table.string("no_of_main_deck_fwd_tails", 255).nullable();
    table.string("diameter_of_main_deck_fwd_tails", 255).nullable();
    table.string("material_of_main_deck_fwd_tails", 255).nullable();
    table.string("length_of_main_deck_fwd_tails", 255).nullable();
    table.string("breaking_of_main_deck_fwd_tails", 255).nullable();
    table.string("no_of_main_deck_aft_tails", 255).nullable();
    table.string("diameter_of_main_deck_aft_tails", 255).nullable();
    table.string("material_of_main_deck_aft_tails", 255).nullable();
    table.string("length_of_main_deck_aft_tails", 255).nullable();
    table.string("breaking_of_main_deck_aft_tails", 255).nullable();
    table.string("no_of_poop_deck_tails", 255).nullable();
    table.string("diameter_of_poop_deck_tails", 255).nullable();
    table.string("material_of_poop_deck_tails", 255).nullable();
    table.string("length_of_poop_deck_tails", 255).nullable();
    table.string("breaking_of_poop_deck_tails", 255).nullable();
    //// ROPES (ON DRUMS)
    table.string("no_of_forecastle_ropes", 255).nullable();
    table.string("diameter_of_forecastle_ropes", 255).nullable();
    table.string("material_of_forecastle_ropes", 255).nullable();
    table.string("length_of_forecastle_ropes", 255).nullable();
    table.string("breaking_of_forecastle_ropes", 255).nullable();
    table.string("no_of_main_deck_fwd_ropes", 255).nullable();
    table.string("diameter_of_main_deck_fwd_ropes", 255).nullable();
    table.string("material_of_main_deck_fwd_ropes", 255).nullable();
    table.string("length_of_main_deck_fwd_ropes", 255).nullable();
    table.string("breaking_of_main_deck_fwd_ropes", 255).nullable();
    table.string("no_of_main_deck_aft_ropes", 255).nullable();
    table.string("diameter_of_main_deck_aft_ropes", 255).nullable();
    table.string("material_of_main_deck_aft_ropes", 255).nullable();
    table.string("length_of_main_deck_aft_ropes", 255).nullable();
    table.string("breaking_of_main_deck_aft_ropes", 255).nullable();
    table.string("no_of_poop_deck_ropes", 255).nullable();
    table.string("diameter_of_poop_deck_ropes", 255).nullable();
    table.string("material_of_poop_deck_ropes", 255).nullable();
    table.string("length_of_poop_deck_ropes", 255).nullable();
    table.string("breaking_of_poop_deck_ropes", 255).nullable();
    //// OTHER LINES
    table.string("no_of_forecastle_other_lines", 255).nullable();
    table.string("diameter_of_forecastle_other_lines", 255).nullable();
    table.string("material_of_forecastle_other_lines", 255).nullable();
    table.string("length_of_forecastle_other_lines", 255).nullable();
    table.string("breaking_of_forecastle_other_lines", 255).nullable();
    table.string("no_of_main_deck_fwd_other_lines", 255).nullable();
    table.string("diameter_of_main_deck_fwd_other_lines", 255).nullable();
    table.string("material_of_main_deck_fwd_other_lines", 255).nullable();
    table.string("length_of_main_deck_fwd_other_lines", 255).nullable();
    table.string("breaking_of_main_deck_fwd_other_lines", 255).nullable();
    table.string("no_of_main_deck_aft_other_lines", 255).nullable();
    table.string("diameter_of_main_deck_aft_other_lines", 255).nullable();
    table.string("material_of_main_deck_aft_other_lines", 255).nullable();
    table.string("length_of_main_deck_aft_other_lines", 255).nullable();
    table.string("breaking_of_main_deck_aft_other_lines", 255).nullable();
    table.string("no_of_poop_deck_other_lines", 255).nullable();
    table.string("diameter_of_poop_deck_other_lines", 255).nullable();
    table.string("material_of_poop_deck_other_lines", 255).nullable();
    table.string("length_of_poop_deck_other_lines", 255).nullable();
    table.string("breaking_of_poop_deck_other_lines", 255).nullable();
    //// WINCHES
    table.string("no_of_forecastle_winches", 255).nullable();
    table.string("no_of_drums_of_forecastle_winches", 255).nullable();
    table.string("motive_power_of_forecastle_winches", 255).nullable();
    table.string("brake_capacity_of_forecastle_winches", 255).nullable();
    table.string("type_of_brake_of_forecastle_winches", 255).nullable();
    table.string("no_of_drums_of_main_deck_fwd_winches", 255).nullable();
    table.string("no_of_drums_of_main_deck_fwd_winches", 255).nullable();
    table.string("motive_power_of_main_deck_fwd_winches", 255).nullable();
    table.string("brake_capacity_of_main_deck_fwd_winches", 255).nullable();
    table.string("type_of_brake_of_main_deck_fwd_winches", 255).nullable();
    table.string("no_of_main_deck_aft_winches", 255).nullable();
    table.string("no_of_drums_of_main_deck_aft_winches", 255).nullable();
    table.string("motive_power_of_main_deck_aft_winches", 255).nullable();
    table.string("brake_capacity_of_main_deck_aft_winches", 255).nullable();
    table.string("type_of_brake_of_main_deck_aft_winches", 255).nullable();
    table.string("no_of_poop_deck_winches", 255).nullable();
    table.string("no_of_drums_of_poop_deck_winches", 255).nullable();
    table.string("motive_power_of_poop_deck_winches", 255).nullable();
    table.string("brake_capacity_of_poop_deck_winches", 255).nullable();
    table.string("type_of_brake_of_poop_deck_winches", 255).nullable();
    //// BITTS, CLOSED CHOKS/FAIRLEADS
    table.string("no_of_forecastle_bitts", 255).nullable();
    table.string("swl_bitts_of_forecastle_bitts", 255).nullable();
    table.string("no_of_closed_chocks_of_forecastle_bitts", 255).nullable();
    table.string("swl_closed_chocks_of_forecastle_bitts", 255).nullable();
    table.string("no_of_main_deck_fwd_bitts", 255).nullable();
    table.string("swl_bitts_of_main_deck_fwd_bitts", 255).nullable();
    table.string("no_of_closed_chocks_of_main_deck_fwd_bitts", 255).nullable();
    table.string("swl_closed_chocks_of_main_deck_fwd_bitts", 255).nullable();
    table.string("no_of_main_deck_aft_bitts", 255).nullable();
    table.string("swl_bitts_of_main_deck_aft_bitts", 255).nullable();
    table.string("no_of_closed_chocks_of_main_deck_aft_bitts", 255).nullable();
    table.string("swl_closed_chocks_of_main_deck_aft_bitts", 255).nullable();
    table.string("no_of_poop_deck_bitts", 255).nullable();
    table.string("swl_bitts_of_poop_deck_bitts", 255).nullable();
    table.string("no_of_closed_chocks_of_poop_deck_bitts", 255).nullable();
    table.string("swl_closed_chocks_of_poop_deck_bitts", 255).nullable();
    
    // ANCHORS/EMERGENCY TOWING SYSTEM
    table.string("number_of_shackles_on_port_starboard_cable", 255).nullable();
    table.string("type_of_emergency_towing_system_forward_type", 255).nullable();
    table.string("type_of_emergency_towing_system_forward_swl", 255).nullable();
    table.string("type_of_emergency_towing_system_aft_type", 255).nullable();
    table.string("type_of_emergency_towing_system_aft_swl", 255).nullable();
    
    // ESCORT TUG
    table.string("type_of_escort_tug_type", 255).nullable();
    table.string("type_of_escort_tug_swl", 255).nullable();
    table.string("swl_of_bollard_on_poop_deck_suitable_for_escort_tug", 255).nullable();
    
    // LIFTING EQUIPMENT/ GANGWAY
    table.string("derrick_crane_description", 255).nullable();
    table.string("accommodation_ladder_direction", 255).nullable();
    table.string("does_vessel_have_a_portable_gangway", 255).nullable();
    
    // SINGLE POINT MOORING (SPM) EQUIPMENT
    table.string("does_vessel_meet_the_recommendations", 255).nullable();
    table.string("how_many_chain_stoppers", 255).nullable();
    table.string("state_type_swl_of_chain_stopper_s", 255).nullable();
    table.string("maximum_size_chain_diameter_the_bow_stopper_s_can_handle", 255).nullable();
    table.string("distance_between_the_bow_fairlead_and_chain_stopper_bracket", 255).nullable();
    table.string("is_bow_chock_and_or_fairlead", 255).nullable();
    
    //PROPULSION
    table.string("ballast_speed_maximum", 255).nullable();
    table.string("ballast_speed_minimum", 255).nullable();
    table.string("laden_speed_maximum", 255).nullable();
    table.string("laden_speed_minimum", 255).nullable();
    table.string("what_type_of_fuel_is_used_maximum", 255).nullable();
    table.string("what_type_of_fuel_is_used_economic", 255).nullable();
    table.string("type_of_bunker_tanks", 255).nullable();
    table.string("is_vessel_fitted_with_fixed", 255).nullable();
    
    // ENGINE EQUIPMENTS
    //// ENGINES
    table.string("no_of_main_engine", 255).nullable();
    table.string("capacity_of_main_engine", 255).nullable();
    table.string("make_type_of_main_engine", 255).nullable();
    table.string("no_of_aux_engine", 255).nullable();
    table.string("capacity_of_aux_engine", 255).nullable();
    table.string("make_type_of_aux_engine", 255).nullable();
    table.string("no_of_power_packs", 255).nullable();
    table.string("capacity_of_power_packs", 255).nullable();
    table.string("make_type_of_power_packs", 255).nullable();
    table.string("no_of_boilers", 255).nullable();
    table.string("capacity_of_boilers", 255).nullable();
    table.string("make_type_of_boilers", 255).nullable();
    //// BOW/STERN THRUSTER
    table.string("what_is_brake_horse_power_of_bow_thruster", 255).nullable();
    table.string("what_is_brake_horse_power_of_stern_thruster", 255).nullable();
    //// EMISSIONS
    table.string("main_engine_imo_nox_emission_standard", 255).nullable();
    table.string("energy_efficiency_design_index_eedi_rating_number", 255).nullable();

    // SHIP TO SHIP TRANSFER
    table.string("does_vessel_comply_with_recommendations_contained_in_ocimf_ics_ship_to_ship", 255).nullable();
    table.string("what_is_maximum_outreach_of_cranes_derricks_outboard_of_the_ship_s_side", 255).nullable();
    table.string("date_place_of_last_sts_operation", 255).nullable();
    
    // RECENT OPERATIONAL HISTORY
    table.string("last_three_cargoes_charterers_voyages", 255).nullable();
    table.string("has_vessel_been_involved_in_a_pollution", 255).nullable();
    table.string("date_and_place_of_last_port_state_control_inspection", 255).nullable();
    table.string("any_outstanding_deficiencies_as_reported_by_any_port_state_control", 255).nullable();
    table.string("recent_oil_company_inspections_screenings", 255).nullable();
    table.string("date_place_of_last_sire_inspection", 255).nullable();

    // Audit fields
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.integer("created_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").nullable();
    table.integer("updated_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
  });

  // Create report_marine_flexible_fields table
  await knex.schema.createTable("report_marine_flexible_fields", (table) => {
    // Primary key
    table.increments("id").primary();
    
    // Foreign key to report_marine table
    table.integer("report_id").unsigned().notNullable()
      .references("id").inTable("report_marine").onDelete("CASCADE");
    
    // Flexible field structure
    table.string("section_name", 255).nullable(); // Section where field belongs
    table.integer("col_span").nullable(); // Column span for display
    
    table.text("field_1").nullable(); // Field 1
    table.text("field_2").nullable(); // Field 2
    table.text("field_3").nullable(); // Field 3
    table.text("field_4").nullable(); // Field 4
    table.text("field_5").nullable(); // Field 5

    table.text("field_6").nullable(); // Field 6
    table.text("field_7").nullable(); // Field 7
    table.text("field_8").nullable(); // Field 8
    table.text("field_9").nullable(); // Field 9
    table.text("field_10").nullable(); // Field 10
    
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
  await knex.schema.dropTableIfExists("report_marine_flexible_fields");
  await knex.schema.dropTableIfExists("report_marine");
};
