import React, { useEffect, useState } from "react";
import "./order.scss";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  fetchOrders,
  addOrder,
  editOrder,
  removeOrder,
} from "../../redux/reducers/orderReducer";
import { fetchUsers } from "../../redux/reducers/userReducer";
import { fetchOfficers } from "../../redux/reducers/officerReducer";
import { fetchChildCategories } from "../../redux/reducers/childCategoryReducer";
import { fetchFieldVerifiers } from "../../redux/reducers/fieldVerifierReducer";
import CustomDataTable from "../../components/CustomDataTable";
import { DeleteIcon, EditIcon } from "../../components/icons";
import ConfirmationModal from "../../components/ConfirmationModal";
import FormModel from "../../components/FormModel";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";

function Orders() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  /* get logged user permission */
  const allowedPermissions = useSelector(selectPermissions);

  // Redux data
  const { list: orders, loading } = useSelector((state) => state.orders);
  const { list: officers } = useSelector((state) => state.officers);
  const { list: users } = useSelector((state) => state.users);
  const { list: allChildCategories } = useSelector(
    (state) => state.childCategories
  );
  const { list: fieldVerifiers } = useSelector((state) => state.fieldVerifier);

  // Fetch everything on mount
  useEffect(() => {
    dispatch(fetchOrders());
    dispatch(fetchOfficers());
    dispatch(fetchUsers());
    dispatch(fetchChildCategories());
    dispatch(fetchFieldVerifiers());
  }, [dispatch]);
  /* console.log("allChildCategories", allChildCategories); */
  // New/Edit Order State
  const [formData, setFormData] = useState({
    customer_name: "",
    contact: "",
    alternative_contact: "",
    supervisor_number: "",
    driver_number: "",
    child_category_id: "",
    registration_number: "",
    place_of_inspection: "",
    officer_id: null,
    manager_id: null,
    field_verifier_id: null,
  });

  const [isEdit, setIsEdit] = useState(false);
  const [editOrderId, setEditOrderId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  // Filter users by role for officer and manager selection
  const bankOfficers = officers.filter(
    (officer) =>
      officer.role_name === "Bank Officer" ||
      officer.role_name === "Bank Authority"
  );

  const managers = users.filter((user) => user.role_name === "Manager");

  // Open Add Order Form
  const openAddModal = () => {
    setIsEdit(false);
    setFormData({
      customer_name: "",
      contact: "",
      alternative_contact: "",
      supervisor_number: "",
      driver_number: "",
      child_category_id: "",
      registration_number: "",
      place_of_inspection: "",
      officer_id: null,
      manager_id: null,
      field_verifier_id: null,
    });
    setShowFormModal(true);
  };

  // Open Edit Modal
  const openEditModal = (order) => {
    setIsEdit(true);
    setEditOrderId(order.id);
    setFormData({
      customer_name: order.customer_name || "",
      contact: order.contact || "",
      alternative_contact: order.alternative_contact || "",
      supervisor_number: order.supervisor_number || "",
      driver_number: order.driver_number || "",
      child_category_id: order.child_category_id || "",
      registration_number: order.registration_number || "",
      place_of_inspection: order.place_of_inspection || "",
      officer_id: order.officer_id || null,
      manager_id: order.manager_id || null,
      field_verifier_id: order.field_verifier_id || null,
    });
    setShowFormModal(true);
  };

  // Submit Add/Edit
  const handleSubmit = () => {
    // Collect all validation errors
    if (!formData.customer_name.trim()) {
      toast.error("Name is required.");
      return;
    }

    if (!formData.contact.trim()) {
      toast.error("Contact number is required.");
      return;
    }

    // No validation needed - field verifier is optional

    // All validations passed — build payload
    const payload = {
      customer_name: formData.customer_name.trim(),
      contact: formData.contact.trim(),
      alternative_contact: formData.alternative_contact.trim() || null,
      supervisor_number: formData.supervisor_number.trim() || null,
      driver_number: formData.driver_number.trim() || null,
      child_category_id: formData.child_category_id,
      registration_number: formData.registration_number.trim() || null,
      place_of_inspection: formData.place_of_inspection.trim() || null,
      officer_id: formData.officer_id,
      manager_id: formData.manager_id,
    };

    // Only include field_verifier_id in payload if manager is assigned
    if (formData.manager_id) {
      payload.field_verifier_id = formData.field_verifier_id;
    }

    if (isEdit) {
      dispatch(editOrder({ id: editOrderId, data: payload }));
    } else {
      dispatch(addOrder(payload));
    }

    // Close modal after submit
    setShowFormModal(false);
  };

  // Confirm delete
  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  const handleConfirmDelete = () => {
    dispatch(removeOrder(confirmDeleteId));
    setConfirmDeleteId(null);
  };

  return (
    <div className="height-full-occupied order-data-container">
      {loading ? (
        <p>Loading...</p>
      ) : (
        <CustomDataTable>
          {{
            buttons: hasPermission(allowedPermissions, "add_order") && (
              <button className="btn" onClick={openAddModal}>
                Add Order
              </button>
            ),
            header: (
              <tr>
                <th style={{ width: "150px" }}>Order Number</th>
                <th style={{ width: "150px" }}>Officer</th>
                <th style={{ width: "200px" }}>Registration Number</th>
                <th style={{ width: "150px" }}>Bank</th>
                <th style={{ width: "120px" }}>Created By</th>
                <th>Updated By</th>
                <th style={{ width: "175px" }}>Status</th>
                <th style={{ textAlign: "center", width: "150px" }}>Action</th>
              </tr>
            ),
            rows: orders.map((order) => (
              <tr 
                key={order.id}
                className={hasPermission(allowedPermissions, "view_order_details") ? "clickable-row" : ""}
                onClick={() => {
                  if (hasPermission(allowedPermissions, "view_order_details")) {
                    navigate(`/orders/${order.id}/details`);
                  }
                }}
                style={{ 
                  cursor: hasPermission(allowedPermissions, "view_order_details") ? "pointer" : "default" 
                }}
              >
                <td className={hasPermission(allowedPermissions, "view_order_details") ? "get-me-inside" : ""}>
                  {order.order_number}
                </td>
                <td>{order.officer_name || "-"}</td>
                <td>{order.registration_number || "-"}</td>
                <td>{order.bank_name || "-"}</td>
                <td>{order.created_by}</td>
                <td>{order.updated_by || "-"}</td>
                <td>
                  <span className="status-state order-state">
                    {order.current_status_name}
                  </span>
                </td>
                <td style={{ textAlign: "center" }}>
                  {hasPermission(allowedPermissions, "edit_order") && (
                    <button
                      className="action-icons"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(order);
                      }}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {hasPermission(allowedPermissions, "delete_order") && (
                    <button
                      className="action-icons"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(order.id, order.customer_name);
                      }}
                    >
                      <DeleteIcon />
                    </button>
                  )}
                </td>
              </tr>
            )),
          }}
        </CustomDataTable>
      )}

      {/* 👤 Form Modal (Add/Edit) */}
      {showFormModal && (
        <FormModel>
          {{
            title: isEdit ? "Edit Order" : "Add Order",
            body: (
              <form
                className="body-form-box"
                onSubmit={(e) => {
                  e.preventDefault(); // prevent full page reload
                  handleSubmit();
                }}
              >
                <div className="body-form-box">
                  <div className="form-group">
                    <label htmlFor="nameField">Name *</label>
                    <input
                      className="form-field"
                      id="nameField"
                      name="nameField"
                      value={formData.customer_name}
                      onChange={(e) => {
                        const customer_name = e.target.value.toUpperCase();
                        setFormData({
                          ...formData,
                          customer_name,
                        });
                      }}
                    />
                  </div>
                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="contactNumber">Contact Number *</label>
                      <input
                        className="form-field"
                        id="contactNumber"
                        name="contactNumber"
                        value={formData.contact}
                        inputMode="numeric"
                        maxLength={10}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow only numeric input
                          if (/^\d*$/.test(value)) {
                            setFormData({ ...formData, contact: value });
                          }
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="alternativeContact">
                        Alternative Contact Number
                      </label>
                      <input
                        className="form-field"
                        id="alternativeContact"
                        name="alternativeContact"
                        value={formData.alternative_contact}
                        inputMode="numeric"
                        maxLength={10}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow only numeric input
                          if (/^\d*$/.test(value)) {
                            setFormData({
                              ...formData,
                              alternative_contact: value,
                            });
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="supervisor_number">
                        Supervisor Number
                      </label>
                      <input
                        className="form-field"
                        id="supervisor_number"
                        name="supervisor_number"
                        value={formData.supervisor_number}
                        inputMode="numeric"
                        maxLength={10}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow only numeric input
                          if (/^\d*$/.test(value)) {
                            setFormData({
                              ...formData,
                              supervisor_number: value,
                            });
                          }
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="driver_number">Driver Number</label>
                      <input
                        className="form-field"
                        id="driver_number"
                        name="driver_number"
                        value={formData.driver_number}
                        inputMode="numeric"
                        maxLength={10}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow only numeric input
                          if (/^\d*$/.test(value)) {
                            setFormData({
                              ...formData,
                              driver_number: value,
                            });
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="registrationNumber">
                      Registration Number
                    </label>
                    <input
                      className="form-field"
                      id="registrationNumber"
                      name="registrationNumber"
                      value={formData.registration_number}
                      onChange={(e) => {
                        const registration_number = e.target.value.toUpperCase();
                        setFormData({
                          ...formData,
                          registration_number,
                        });
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="placeOfInspection">
                      Place of Inspection
                    </label>
                    <input
                      className="form-field"
                      id="placeOfInspection"
                      name="placeOfInspection"
                      value={formData.place_of_inspection}
                      onChange={(e) => {
                        const place_of_inspection = e.target.value.toUpperCase();
                        setFormData({
                          ...formData,
                          place_of_inspection,
                        });
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="Subcategory">Subcategory</label>
                    <SingleSearchSelect
                      id="Subcategory"
                      className="search-selector"
                      options={allChildCategories.map((childCategory) => ({
                        value: childCategory.id,
                        label: `${childCategory.name}`,
                      }))}
                      value={formData.child_category_id}
                      onChange={(val) =>
                        setFormData({ ...formData, child_category_id: val })
                      }
                      placeholder="Select Subcategory"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="officerField">Officer</label>
                    <SingleSearchSelect
                      id="officerField"
                      className="search-selector"
                      options={bankOfficers.map((user) => ({
                        value: user.id,
                        label: `${user.name} (${user.role_name})`,
                      }))}
                      value={formData.officer_id}
                      onChange={(val) =>
                        setFormData({ ...formData, officer_id: val })
                      }
                      placeholder="Select officer"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="managerField">Manager</label>
                    <SingleSearchSelect
                      id="managerField"
                      className="search-selector"
                      options={managers.map((user) => ({
                        value: user.id,
                        label: user.name,
                      }))}
                      value={formData.manager_id}
                      onChange={(val) =>
                        setFormData({ 
                          ...formData, 
                          manager_id: val,
                          // Clear field verifier when manager is removed
                          field_verifier_id: val ? formData.field_verifier_id : null
                        })
                      }
                      placeholder="Select manager"
                    />
                  </div>

                  {/* Field Verifier - Only show when manager is assigned */}
                  {formData.manager_id && (
                    <div className="form-group">
                      <label htmlFor="fieldVerifierField">Field Verifier</label>
                      <SingleSearchSelect
                        id="fieldVerifierField"
                        className="search-selector"
                        options={fieldVerifiers.map((verifier) => ({
                          value: verifier.id,
                          label: verifier.name,
                        }))}
                        value={formData.field_verifier_id}
                        onChange={(val) =>
                          setFormData({ ...formData, field_verifier_id: val })
                        }
                        placeholder="Select field verifier"
                      />
                    </div>
                  )}

                  <div className="form-buttons">
                    <button className="submit-button" type="submit">
                      {isEdit ? "Update" : "Add"}
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => {
              setShowFormModal(false);
              setIsEdit(false);
              setEditOrderId(null);
              setFormData({
                customer_name: "",
                contact: "",
                alternative_contact: "",
                supervisor_number: "",
                driver_number: "",
                child_category_id: "",
                registration_number: "",
                place_of_inspection: "",
                officer_id: null,
                manager_id: null,
              });
            },
          }}
        </FormModel>
      )}

      {/* ❗ Delete Confirm Modal */}
      {confirmDeleteId && (
        <ConfirmationModal
          title="Confirm Deletion"
          message={`Are you sure you want to delete <span class="danger">${confirmDeleteName}</span>?`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

export default Orders;
