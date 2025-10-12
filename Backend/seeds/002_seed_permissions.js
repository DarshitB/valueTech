/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  const permissions = [
    "view_dashboard",
    "view_dashboard_statistics",
    "view_dashboard_checkin_checkout",
    "view_dashboard_order_table",
    "view_dashboard_order_cards_telecaller",

    "view_user",
    "add_user",
    "edit_user",
    "delete_user",
    "add_role",
    "edit_role",
    "delete_role",
    "view_permission",
    "edit_permission",
    "view_state",
    "add_state",
    "edit_state",
    "delete_state",
    "view_cities",
    "add_cities",
    "edit_cities",
    "delete_cities",

    "view_bank",
    "add_bank",
    "edit_bank",
    "delete_bank",
    "view_bank_branch",
    "add_bank_branch",
    "edit_bank_branch",
    "delete_bank_branch",
    "view_branch_officer",
    "add_branch_officer",
    "edit_branch_officer",
    "delete_branch_officer",

    "view_category",
    "add_category",
    "edit_category",
    "delete_category",
    "view_sub_category",
    "add_sub_category",
    "edit_sub_category",
    "delete_sub_category",
    "view_child_category",
    "add_child_category",
    "edit_child_category",
    "delete_child_category",

    "view_field_verifier",
    "add_field_verifier",
    "edit_field_verifier",
    "edit_field_verifier_status",
    "delete_field_verifier",
    "view_field_verifier_login",
    "delete_field_verifier_login",
    "view_field_verifier_mobile",

    "view_order",
    "add_order",
    "edit_order",
    "delete_order",
    "view_order_details",
    "view_order_priority_filter",
    "edit_order_priority",
    "view_order_type_filter",
    "edit_order_type",
    "assign_user_to_order",
    "add_valuer_name_to_order",
    "edit_valuer_name_to_order",
    "view_order_details_order_status",
    "view_order_details_payment_status",
    "view_order_details_manager_name",
    "view_order_details_field_verifier_name",

    "view_order_recent_activity",

    "view_order_comments",
    "add_order_comments",

    "view_order_media_files",
    "add_order_media_files",
    "approve_reject_order_media_files",

    "generate_order_collage",
    "approve_order_collage",
    "generate_order_report",
    "approve_order_report",

    "view_order_media_documents",
    "add_order_media_documents",
    "download_order_media_documents",
    "delete_order_media_documents",

    "view_order_add_edit_subcategory_filed",
    "view_order_add_edit_officer_filed",
    "view_order_add_edit_manager_filed",

    "view_order_approve_button",
    "view_order_validate_button",
    "view_order_payment_button",
    "view_order_mail_button",
    "view_order_complete_button",
    "view_order_authenticate_button",
    "view_order_re_validate_button",

    "view_order_table_order_number",
    "view_order_table_category",
    "view_order_table_asset_category",
    "view_order_table_sub_category",
    "view_order_table_manager",
    "view_order_table_field_verifier",
    "view_order_table_Bank",
    "view_order_table_Bank_Branch",
    "view_order_table_Branch_Officer",
    "view_order_table_registration_number",
    "view_order_table_created_by",
    "view_order_table_updated_by",
    "view_order_table_priority",
    "view_order_table_type",
    "view_order_table_valuer_name",
    "view_order_table_status",
    "view_order_table_action",

    "view_order_table_order_number_db",
    "view_order_table_category_db",
    "view_order_table_asset_category_db",
    "view_order_table_sub_category_db",
    "view_order_table_manager_db",
    "view_order_table_field_verifier_db",
    "view_order_table_Bank_db",
    "view_order_table_Bank_Branch_db",
    "view_order_table_Branch_Officer_db",
    "view_order_table_registration_number_db",
    "view_order_table_created_by_db",
    "view_order_table_updated_by_db",
    "view_order_table_priority_db",
    "view_order_table_type_db",
    "view_order_table_valuer_name_db",
    "view_order_table_status_db",
    "view_order_table_action_db",
  ];

  // Insert permissions
  const inserted = await Promise.all(
    permissions.map((name) => {
      return knex("permissions").insert({ name }).returning("id");
    })
  );
  /*const allPermissionIds = inserted.map(([row]) => row.id);

  const developerAdminRole = await knex("roles")
    .where({ name: "developer_admin" })
    .first();

  // Assign all permissions to developer_admin
    for (const permission_id of allPermissionIds) {
    await knex("role_permissions").insert({
      role_id: developerAdminRole.id,
      permission_id,
      created_by: 1,
    });
  } */
};
