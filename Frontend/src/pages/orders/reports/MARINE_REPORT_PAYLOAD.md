# Marine Report - Payload Documentation

This document describes the payload structure for the Marine Report API endpoints (Save and Generate/Submit).

## API Endpoints

1. **Save Report**: Saves the report data to the database (JSON format)
2. **Generate Report**: Generates PDF report from the data (FormData/multipart format)

Both endpoints receive the same data structure, with slight format differences:
- **Save**: JSON object with nested flexible_fields structure
- **Generate**: FormData with array-style flexible_fields structure

---

## Main Form Fields (`reportFormData`)

All fields from the main form are included in the payload, even if empty:

```json
{
  "report_type": "report_marine",
  "ref_no_year": "2025",
  "ref_no_bank": "",
  "ref_no_code": "VKM",
  "ref_no_id": "",
  "lan_no": "",
  "report_date": "25-01-2025",
  "bank_name": "",
  "branch_name": "",
  "state_name": "MUM",
  "model_number": "",
  "officer_name": "",
  "officer_designation": "",
  "inspected_item": "",
  "inspected_date": "",
  "inspection_address": "",
  "customer_name": "",
  "address_as_per_kyc": "",
  "machinery_locations": "",
  "lan_city_no": "",
  "date_of_disbursement": "",
  "date_of_invoice_delivery_no": "",
  "invoice_price": "",
  "lien_of_bank": "",
  "chassis_no": "",
  "machine_serial_no": "",
  "engine_no": "",
  "regn_no": "",
  "installed_running": "",
  "installed_asset_whether_functional_or_not": "",
  "class_make_of_asset": "",
  "year_of_mfg": "",
  "invoice_purchase_order_no": "",
  "pro_owner_address": "",
  "insurer_policy_no": "",
  "insurance_validity_insured_value": "",
  "insurance_having_lien_of_bank": "",
  "total_crane_weight_capacity": "",
  "material_usefulness": "",
  "colour": "",
  "observation": "",
  "status_of_machine": "",
  "visit_done_by": "",
  "place": "",
  "date_time": "",
  "valuer_name": "V.K. ASSOCIATES",
  "license_no": "SLA-60827",
  "surveyor_location": "MUMBAI, MAHARASHTRA",
  "vessel_photo": "",
  "vessel_photo_preview": "",
  "vessel_photo_id": null,
  
  // Vessel Details Section
  "name_of_the_vessel": "",
  "official_no": "",
  "imo_or_regd_type": "IMO NO.",
  "imo_or_regd_no": "",
  "client_city_state_name": "",
  
  // Front Page Fields
  "inspection_location_front_page": "",
  "inspection_date_front_page": "",
  "client_name_with_full_address": "",
  "imo_official_regd_no": "",
  "registry_vessel_date": "",
  "registry_vessel_location": "",
  "registered_or_proposed_owner": "",
  "registered_or_proposed_owner_address": "",
  
  // Vessel Information
  "marine_vessel_name": "",
  "type_or_description_of_vessel": "",
  "mmsi_no": "",
  "class_notation": "",
  "call_sign_class_notation_machinery": "",
  "current_registry_port": "",
  "classification_of_registry": "",
  "present_flag": "",
  "port_of_registry": "",
  "no_of_registry_registration_no": "",
  "registered_under": "",
  "year_of_built": "",
  "year_of_built_inwords": "",
  "place_of_built": "",
  "vessel_built_by": "",
  "type_of_propelled": "",
  
  // Dimensions
  "length_of_vessel": "",
  "loa_length_overall": "",
  "breadth_of_vessel": "",
  "depth_of_vessel": "",
  "draught_of_vessel": "",
  "summer_draft_of_vessel": "",
  "length_of_stroke": "",
  "ballast_water_capacity": "",
  "light_ship": "",
  "propeller": "",
  "gross_registered_tonnage_grt": "",
  "net_registered_tonnage_nrt": "",
  "deadweight_tonnage_dwt": "",
  "free_board": "",
  "operating_speed_max_speed": "",
  "regd_accommodation": "",
  "bollard_pull_sustained": "",
  "type_of_propulsion": "",
  "no_of_decks": "",
  "no_of_masts": "",
  "no_of_bulkheads": "",
  "stem_type": "",
  "stern_type": "",
  "built_type": "",
  "material_of_construction": "",
  
  // Owners/Operators
  "registered_owner": "",
  "technical_operator": "",
  "commercial_operator": "",
  "disponent_owner": "",
  
  // Insurance Policies
  // Protection & Indemnity Policy
  "institution_name_insurance_policy": "",
  "certificate_no_insurance_policy": "",
  "date_of_issue_insurance_policy": "",
  "p_i_clause_insurance_policy": "",
  "co_assured_insurance_policy": "",
  "start_period_of_p_i_policy_insurance_policy": "",
  "end_period_of_p_i_policy_insurance_policy": "",
  "insured_value_insurance_policy": "",
  "insured_value_in_words_insurance_policy": "",
  
  // Damage Policy
  "institution_name_damage_policy": "",
  "certificate_type_damage_policy": "",
  "type_of_security_damage_policy": "",
  "insurer_guarantor_name_address_damage_policy": "",
  "policy_ref_no_damage_policy": "",
  "date_of_issue_damage_policy": "",
  "start_period_of_damage_policy": "",
  "end_period_of_damage_policy": "",
  
  // War Risk Policy
  "insurance_company_name_war_risk_policy": "",
  "policy_no_war_risk_policy": "",
  "start_period_of_war_risk_policy": "",
  "end_period_of_war_risk_policy": "",
  "insured_value_war_risk_policy": "",
  "insured_value_in_words_war_risk_policy": "",
  
  // Hull & Machinery Policy
  "insurance_company_name_hull_machinery_policy": "",
  "policy_no_hull_machinery_policy": "",
  "start_period_of_hull_machinery_policy": "",
  "end_period_of_hull_machinery_policy": "",
  "insured_value_hull_machinery_policy": "",
  "insured_value_in_words_hull_machinery_policy": "",
  
  // Additional Vessel Details
  "trading_limit": "",
  "collision_bulkhead": "",
  "vessel_bottom_type": "",
  "ex_name_flag": "",
  "previous_registry": "",
  "keel_to_masthead_ktm": "",
  "manifold_bcm_scm": "",
  "classification_society": "",
  "is_vessel_subject_to_any_conditions": "",
  "if_classification_society_changed_name": "",
  "does_the_vessel_have_ice_class": "",
  "date_place_of_last_dry_dock": "",
  "start_date_next_dry_dock_due_next_annual_survey_due": "",
  "end_date_next_dry_dock_due_next_annual_survey_due": "",
  "start_date_of_last_special_survey_next_special_survey_due": "",
  "end_date_of_last_special_survey_next_special_survey_due": "",
  "if_ship_has_condition_assessment": "",
  "hull_design": "",
  "present_condition_1": "",
  "present_condition_2": "",
  "present_condition_3": "",
  "steering_details": "",
  
  // Dimensions Section
  "keel_to_masthead_ktm_dimensions": "",
  "distance_bridge_front_to_center_of_manifold_dimensions": "",
  "bow_to_center_manifold_bcm_dimensions": "",
  "stern_to_center_manifold_scm_dimensions": "",
  "forward_to_mid_point_manifold_lightship_dimensions": "",
  "forward_to_mid_point_manifold_normal_ballast_dimensions": "",
  "forward_to_mid_point_manifold_summer_dwt_dimensions": "",
  "aft_to_mid_point_manifold_lightship_dimensions": "",
  "aft_to_mid_point_manifold_normal_ballast_dimensions": "",
  "aft_to_mid_point_manifold_summer_dwt_dimensions": "",
  "parallel_body_length_lightship_dimensions": "",
  "parallel_body_length_normal_ballast_dimensions": "",
  "parallel_body_length_summer_dwt_dimensions": "",
  "summer_Freeboard_dimensions": "",
  "summer_Draft_dimensions": "",
  "summer_Deadweight_dimensions": "",
  "summer_Displacement_dimensions": "",
  "winter_Freeboard_dimensions": "",
  "winter_Draft_dimensions": "",
  "winter_Deadweight_dimensions": "",
  "winter_Displacement_dimensions": "",
  "tropical_Freeboard_dimensions": "",
  "tropical_Draft_dimensions": "",
  "tropical_Deadweight_dimensions": "",
  "tropical_Displacement_dimensions": "",
  "lightship_Freeboard_dimensions": "",
  "lightship_Draft_dimensions": "",
  "lightship_Deadweight_dimensions": "",
  "lightship_Displacement_dimensions": "",
  "normal_ballast_condition_Freeboard_dimensions": "",
  "normal_ballast_condition_Draft_dimensions": "",
  "normal_ballast_condition_Deadweight_dimensions": "",
  "normal_ballast_condition_Displacement_dimensions": "",
  "segregated_ballast_condition_Freeboard_dimensions": "",
  "segregated_ballast_condition_Draft_dimensions": "",
  "segregated_ballast_condition_Deadweight_dimensions": "",
  "segregated_ballast_condition_Displacement_dimensions": "",
  "fwa_tpc_at_summer_draft_Freeboard_dimensions": "",
  "fwa_tpc_at_summer_draft_Draft_dimensions": "",
  "fwa_tpc_at_summer_draft_Deadweight_dimensions": "",
  "fwa_tpc_at_summer_draft_Displacement_dimensions": "",
  
  // Report Title (selected from dropdown)
  "report_title": "Offshore Supply Vessel"
}
```

---

## Flexible Fields

Flexible fields are submitted as an array. Each entry can have different properties based on its `section_name`.

### System/Backend Fields (Always Present)

**Every flexible field entry includes these system fields (NOT visible in UI, but required for backend):**
- `section_name` (string): Identifies the type of flexible field
- `col_span` (number): Column span for layout (usually 1)
- `field_order` (number): Order/index of the field within its section (starts at 1)
  

### Flexible Field Types (Generic field_1..N)

#### 1. Standard Flexible Fields (Generic "Add One")
**Section Names**: Generic sections like `TANK_STORAGE_CAPACITIES` and other standard sections

**Visible UI Fields:**
- `field_1` (string): First input
- `field_2` (string): Second input

**Complete Payload Example:**
```json
{
  "flexible_fields[0][section_name]": "TANK_STORAGE_CAPACITIES",
  "flexible_fields[0][col_span]": 1,
  "flexible_fields[0][field_order]": 1,
  "flexible_fields[0][field_1]": "Fuel Tank",
  "flexible_fields[0][field_2]": "5000 liters capacity"
}
```

#### 2. Deck Equipment / Special Features
**Section Name**: `DECK_EQUIPMENT_SPECIAL_FEATURES`

**Visible UI Fields:**
- `field_1` (string): Particulars
- `field_2` (string): Specifications

**Note:** `field_label` and `field_value` are not sent; all user inputs use generic `field_1..N`.

**Complete Payload Example:**
```json
{
  "flexible_fields[0][section_name]": "DECK_EQUIPMENT_SPECIAL_FEATURES",
  "flexible_fields[0][col_span]": 1,
  "flexible_fields[0][field_order]": 1,
  "flexible_fields[0][field_1]": "Deck Crane",
  "flexible_fields[0][field_2]": "Hydraulic, 5 ton capacity"
}
```

#### 3. Certifications of the Vessel
**Section Name**: `CERTIFICATIONS_OF_THE_VESSEL`

**Visible UI Fields:**
- `field_1` (string): Certificates
- `field_2` (string): Issued (DD-MM-YYYY)
- `field_3` (string): Last Annual (DD-MM-YYYY)
- `field_4` (string): Last Intermediate (DD-MM-YYYY)
- `field_5` (string): Expires (DD-MM-YYYY)

**Note:** `field_label` and `field_value` are not sent; all user inputs use generic `field_1..N`.

**Complete Payload Example:**
```json
{
  "flexible_fields[0][section_name]": "CERTIFICATIONS_OF_THE_VESSEL",
  "flexible_fields[0][col_span]": 1,
  "flexible_fields[0][field_order]": 1,
  "flexible_fields[0][field_1]": "Cargo Ship Safety Certificate",
  "flexible_fields[0][field_2]": "01-01-2023",
  "flexible_fields[0][field_3]": "01-01-2024",
  "flexible_fields[0][field_4]": "01-07-2024",
  "flexible_fields[0][field_5]": "01-01-2025"
}
```

#### 4. Custom Media Blocks
**Section Names**: `HEADING_DESCRIPTION_IMAGE`, `HEADING_DESCRIPTION_IMAGE_2`, `HEADING_DESCRIPTION_IMAGE_3`

**Visible UI Fields:**
- `field_1` (string): Heading
- `field_2` (string): Description
- `field_3` (string): Image path (JSON or direct path)
- `field_4` (number, optional): Image ID

**Note:** `field_label` and `field_value` are not sent; all user inputs use generic `field_1..N`.

**Complete Payload Example:**
```json
{
  "flexible_fields[0][section_name]": "HEADING_DESCRIPTION_IMAGE",
  "flexible_fields[0][col_span]": 1,
  "flexible_fields[0][field_order]": 1,
  "flexible_fields[0][field_1]": "Navigation Equipment",
  "flexible_fields[0][field_2]": "Complete navigation system installation",
  "flexible_fields[0][field_3]": "{\"path\":\"/uploads/media/image123.jpg\"}",
  "flexible_fields[0][field_4]": 123
}
```

#### 5. Equipment Make/Model
**Section Names**: `EQUIPMENT_MAKE_MODEL`, `EQUIPMENT_MAKE_MODEL_2`

**Visible UI Fields:**
- `field_1` (string): Name of equipment
- `field_2` (string): Make
- `field_3` (string): Model

**Note:** only `field_1..N` are sent for user inputs.

**Complete Payload Example:**
```json
{
  "flexible_fields[0][section_name]": "EQUIPMENT_MAKE_MODEL",
  "flexible_fields[0][col_span]": 1,
  "flexible_fields[0][field_order]": 1,
  "flexible_fields[0][field_1]": "GPS Navigation System",
  "flexible_fields[0][field_2]": "Garmin",
  "flexible_fields[0][field_3]": "GPSMAP 8616"
}
```

---

## Complete Payload Example

### Save API (JSON)

```json
{
  "report_type": "report_marine",
  "ref_no_year": "2025",
  "ref_no_code": "VKM",
  "report_date": "25-01-2025",
  "state_name": "MUM",
  "name_of_the_vessel": "MV EXAMPLE SHIP",
  "official_no": "12345",
  "imo_or_regd_type": "IMO NO.",
  "imo_or_regd_no": "9876543",
  "vessel_photo": "{\"path\":\"/uploads/media/vessel.jpg\"}",
  "vessel_photo_id": 456,
  "valuer_name": "V.K. ASSOCIATES",
  "license_no": "SLA-60827",
  "report_title": "Offshore Supply Vessel",
  
  "flexible_fields[0][section_name]": "CERTIFICATIONS_OF_THE_VESSEL",
  "flexible_fields[0][col_span]": 1,
  "flexible_fields[0][field_order]": 1,
  "flexible_fields[0][field_1]": "Cargo Ship Safety Certificate",
  "flexible_fields[0][field_2]": "01-01-2023",
  "flexible_fields[0][field_3]": "01-01-2024",
  "flexible_fields[0][field_4]": "01-07-2024",
  "flexible_fields[0][field_5]": "01-01-2025",
  
  "flexible_fields[1][section_name]": "HEADING_DESCRIPTION_IMAGE",
  "flexible_fields[1][col_span]": 1,
  "flexible_fields[1][field_order]": 1,
  "flexible_fields[1][field_1]": "Navigation Equipment",
  "flexible_fields[1][field_2]": "Complete navigation system",
  "flexible_fields[1][field_3]": "{\"path\":\"/uploads/media/nav.jpg\"}",
  "flexible_fields[1][field_4]": 789,
  
  "flexible_fields[2][section_name]": "EQUIPMENT_MAKE_MODEL",
  "flexible_fields[2][col_span]": 1,
  "flexible_fields[2][field_order]": 1,
  "flexible_fields[2][field_1]": "GPS System",
  "flexible_fields[2][field_2]": "Garmin",
  "flexible_fields[2][field_3]": "GPSMAP 8616",
  
  "flexible_fields[3][section_name]": "DECK_EQUIPMENT_SPECIAL_FEATURES",
  "flexible_fields[3][col_span]": 1,
  "flexible_fields[3][field_order]": 1,
  "flexible_fields[3][field_1]": "Deck Crane",
  "flexible_fields[3][field_2]": "Hydraulic, 5 ton capacity",
  
  "flexible_fields[4][section_name]": "HEADING_DESCRIPTION_IMAGE_2",
  "flexible_fields[4][col_span]": 1,
  "flexible_fields[4][field_order]": 1,
  "flexible_fields[4][field_1]": "Additional Section",
  "flexible_fields[4][field_2]": "Another navigation system",
  "flexible_fields[4][field_3]": "{\"path\":\"/uploads/media/nav2.jpg\"}",
  "flexible_fields[4][field_4]": 790,
  
  "flexible_fields[5][section_name]": "EQUIPMENT_MAKE_MODEL_2",
  "flexible_fields[5][col_span]": 1,
  "flexible_fields[5][field_order]": 1,
  "flexible_fields[5][field_1]": "Radar System",
  "flexible_fields[5][field_2]": "Raymarine",
  "flexible_fields[5][field_3]": "Axiom 12"
}
```

### Generate API (FormData)

The Generate API uses `multipart/form-data` format. In FormData, the structure is the same but sent as form fields:

```
report_type: report_marine
ref_no_year: 2025
ref_no_code: VKM
report_date: 25-01-2025
state_name: MUM
name_of_the_vessel: MV EXAMPLE SHIP
...

flexible_fields[0][section_name]: CERTIFICATIONS_OF_THE_VESSEL
flexible_fields[0][col_span]: 1
flexible_fields[0][field_order]: 1
flexible_fields[0][field_1]: Cargo Ship Safety Certificate
flexible_fields[0][field_2]: 01-01-2023
...

flexible_fields[1][section_name]: HEADING_DESCRIPTION_IMAGE
flexible_fields[1][col_span]: 1
flexible_fields[1][field_order]: 1
flexible_fields[1][field_1]: Navigation Equipment
flexible_fields[1][field_2]: Complete navigation system
flexible_fields[1][field_3]: {"path":"/uploads/media/nav.jpg"}
flexible_fields[1][field_4]: 789

flexible_fields[3][section_name]: DECK_EQUIPMENT_SPECIAL_FEATURES
flexible_fields[3][col_span]: 1
flexible_fields[3][field_order]: 1
flexible_fields[3][field_1]: Deck Crane
flexible_fields[3][field_2]: Hydraulic, 5 ton capacity
...
```

---

## Important Notes

1. **All fields are included**: Even empty fields (`""`) are sent in the payload to ensure consistency.

2. **Image paths**: The `image_path` field can be:
   - A JSON string: `{"path":"/uploads/media/image.jpg"}`
   - A direct path: `/uploads/media/image.jpg`
   - An empty string if no image is selected

3. **Vessel Photo**: Stored separately in main form fields:
   - `vessel_photo`: Image path (same format as flexible field images - can be JSON string or direct path)
   - `vessel_photo_preview`: Full preview URL (frontend only, **NOT sent in payload**)
   - `vessel_photo_id`: Media ID (number, optional - only sent if image is selected)

4. **Date formats**: All date fields use `DD-MM-YYYY` format (e.g., "25-01-2025"). Users enter dates in this format, and the frontend auto-formats numeric input.

5. **Currency fields**: Currency values are formatted with Indian number system (commas as thousand separators, e.g., "12,34,567.89"). The corresponding `_in_words` fields are automatically generated and contain the textual representation (e.g., "TWELVE LAKH THIRTY FOUR THOUSAND FIVE HUNDRED SIXTY SEVEN AND EIGHTY NINE PAISE ONLY").

6. **Flexible field ordering**: `field_order` starts at 1 and increments for each entry within the same section. Multiple sections can have entries with `field_order: 1` as ordering is scoped to each `section_name`.

7. **Section names**: Used to determine which visible UI fields are present (all use `field_1..N`):
   - `DECK_EQUIPMENT_SPECIAL_FEATURES` → `field_1` (Particulars), `field_2` (Specifications)
   - `CERTIFICATIONS_OF_THE_VESSEL` → `field_1` (Certificates), `field_2` (Issued), `field_3` (Last Annual), `field_4` (Last Intermediate), `field_5` (Expires)
   - `HEADING_DESCRIPTION_IMAGE*` → `field_1` (Heading), `field_2` (Description), `field_3` (Image Path), `field_4` (Image ID)
   - `EQUIPMENT_MAKE_MODEL*` → `field_1` (Name), `field_2` (Make), `field_3` (Model)
   - Generic sections (e.g., `TANK_STORAGE_CAPACITIES`) → `field_1`, `field_2`

8. **System Fields Always Present**: Every flexible field entry will ALWAYS include these system fields (even if empty):
   - `section_name` (string, required): Identifies the type of flexible field
   - `col_span` (number, required): Column span for layout (usually 1)
   - `field_order` (number, required): Order/index within section (starts at 1)

---

## Backend Implementation Recommendations

1. **Parse flexible_fields array**: Loop through all `flexible_fields[N]` entries and group by index. Each index represents one flexible field entry with all its properties.

2. **Validate section_name**: Use `section_name` to determine which additional fields to expect:
   - `DECK_EQUIPMENT_SPECIAL_FEATURES` → expect `particulars` and `specifications`
   - `CERTIFICATIONS_OF_THE_VESSEL` → expect `certificates`, `issued`, `last_annual`, `last_intermediate`, `expires`
   - `HEADING_DESCRIPTION_IMAGE*` → expect `field_1`, `field_2`, `field_3`, `field_4` (optional)
   - `EQUIPMENT_MAKE_MODEL*` → expect `field_1`, `field_2`, `field_3`
   - Generic sections → expect `field_1`, `field_2`

3. **Handle image paths**: Check if `image_path` is JSON and parse accordingly. Both JSON string format (`{"path":"..."}`) and direct path format (`/uploads/...`) should be supported.

4. **Store flexible fields**: Consider storing as JSON in database or as separate table rows. Ensure system fields (`section_name`, `col_span`, `field_order`) plus generic `field_1..N` are stored.

5. **Date validation**: Validate DD-MM-YYYY format for date fields. Dates are sent as strings in this format.

6. **Null handling**: Convert empty strings (`""`) to NULL in database if preferred, but ensure the payload always includes all fields (even if empty) for consistency.

7. **All fields included**: Both Save and Generate APIs receive ALL form fields (from `reportFormData`) and ALL flexible field properties, even if empty. This ensures payload consistency and allows proper form reconstruction when loading saved reports.

