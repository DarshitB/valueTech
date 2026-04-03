import React, { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchFieldVerifiers,
  addFieldVerifier,
  editFieldVerifier,
  removeFieldVerifier,
  checkFieldVerifierByMobile,
  checkFieldVerifierByUsername,
  toggleFieldVerifierStatus,
} from "../../redux/reducers/fieldVerifierReducer";
import { fetchCities } from "../../redux/reducers/cityReducer";
import { fetchOrders } from "../../redux/reducers/orderReducer";
import { fetchUsers } from "../../redux/reducers/userReducer";
import CustomDataTable from "../../components/CustomDataTable";
import ConfirmationModal from "../../components/ConfirmationModal";
import FormModel from "../../components/FormModel";
import {
  DeleteIcon,
  EditIcon,
  PasswordIcon,
  ContactIcon,
} from "../../components/icons";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { toast } from "react-toastify";
import SingleSearchSelect from "../../components/SingleSearchSelect"; // Make sure this path is correct

function FieldVerifiers() {
  const dispatch = useDispatch();

  const allowedPermissions = useSelector(selectPermissions);
  const { list: fieldVerifiers, loading } = useSelector(
    (state) => state.fieldVerifier
  );
  /*  console.log(fieldVerifiers); */
  const { list: users } = useSelector((state) => state.users);
  const { list: cities } = useSelector((state) => state.cities); // Fetch cities
  const { list: orders } = useSelector((state) => state.orders);

  // Function to mask mobile number based on permission
  const getMaskedMobile = (mobile) => {
    if (hasPermission(allowedPermissions, "view_field_verifier_mobile")) {
      return mobile;
    }
    // Show only last 4 digits, mask the rest with x
    if (mobile && mobile.length >= 4) {
      return "x".repeat(mobile.length - 4) + mobile.slice(-4);
    }
    return mobile;
  };

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    mobile: "",
    password: "",
    confirm_password: "",
    city_id: null,
    upi_id: "",

    // New optional fields
    bank_name: "",
    verifier_name_in_bank: "",
    bank_address: "",
    bank_account_type: "",
    bank_account_number: "",
    bank_IFSC_code: "",
  });

  const [isEdit, setIsEdit] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [selectedManagerFilter, setSelectedManagerFilter] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  const [mobileError, setMobileError] = useState(null);
  const [usernameError, setUsernameError] = useState(null);

  useEffect(() => {
    dispatch(fetchFieldVerifiers());
    dispatch(fetchCities());
    dispatch(fetchOrders());
    dispatch(fetchUsers());
  }, [dispatch]);

  // Calculate order counts for each field verifier
  const fieldVerifierOrderCounts = useMemo(() => {
    const counts = {};
    fieldVerifiers.forEach((verifier) => {
      const orderCount = orders.filter(
        (order) => order.field_verifier_id === verifier.id
      ).length;
      counts[verifier.id] = orderCount;
    });
    return counts;
  }, [fieldVerifiers, orders]);

  // Manager options for filter (only MANAGER role and present as creator of at least one field verifier)
  const managerFilterOptions = useMemo(() => {
    const creatorNames = new Set(
      fieldVerifiers
        .filter((v) => v.created_by)
        .map((v) => v.created_by)
    );

    return users
      .filter((u) => {
        const isManager = String(u.role_name || "")
          .toUpperCase()
          .includes("MANAGER");
        const isCreatorInList = creatorNames.has(u.name);
        return isManager && isCreatorInList;
      })
      .map((u) => ({
        value: u.id,
        label: `${u.name} (${u.role_name})`,
      }));
  }, [users, fieldVerifiers]);

  // Map user id -> user for quick lookup
  const usersById = useMemo(() => {
    const map = {};
    users.forEach((u) => {
      if (u && u.id != null) {
        map[u.id] = u;
      }
    });
    return map;
  }, [users]);

  // Apply manager/created_by filter to field verifiers
  const filteredFieldVerifiers = useMemo(() => {
    if (!selectedManagerFilter) return fieldVerifiers;

    const managerUser = usersById[selectedManagerFilter];
    if (!managerUser || !managerUser.name) return fieldVerifiers;

    return fieldVerifiers.filter(
      (verifier) => verifier.created_by === managerUser.name
    );
  }, [fieldVerifiers, selectedManagerFilter, usersById]);

  const openAddModal = () => {
    setIsEdit(false);
    setFormData({
      name: "",
      username: "",
      mobile: "",
      password: "",
      confirm_password: "",
      city_id: null,
      upi_id: "",

      // New optional fields
      bank_name: "",
      verifier_name_in_bank: "",
      bank_address: "",
      bank_account_type: "",
      bank_account_number: "",
      bank_IFSC_code: "",
      created_by: "",
    });
    setShowFormModal(true);
  };

  const openEditModal = (verifier) => {
    setIsEdit(true);
    setEditId(verifier.id);

    // Map created_by name (string) to user_id (from users list)
    let createdByUserId = "";
    if (verifier.created_by) {
      const creatorUser = users.find((u) => u.name === verifier.created_by);
      createdByUserId = creatorUser?.id || "";
    }

    setFormData({
      name: verifier.name,
      username: verifier.username,
      mobile: hasPermission(allowedPermissions, "view_field_verifier_mobile") 
        ? verifier.mobile 
        : getMaskedMobile(verifier.mobile),
      password: "",
      confirm_password: "",
      city_id: verifier.city_id || null,
      upi_id: verifier.upi_id || "",

      bank_name: verifier.bank_name || "",
      verifier_name_in_bank: verifier.verifier_name_in_bank || "",
      bank_address: verifier.bank_address || "",
      bank_account_type: verifier.bank_account_type || "",
      bank_account_number: verifier.bank_account_number || "",
      bank_IFSC_code: verifier.bank_IFSC_code || "",
      created_by: createdByUserId,
    });
    setShowFormModal(true);
  };

  const handleSubmit = () => {
    const mobileRegex = /^[0-9]{10}$/;

    if (!formData.name.trim()) return toast.error("Name is required.");
    if (!formData.username.trim()) return toast.error("Username required.");
    if (!formData.mobile || !mobileRegex.test(formData.mobile))
      return toast.error("Valid mobile required.");
    if (!formData.upi_id.trim()) return toast.error("UPI ID is required.");
    if (!formData.city_id) return toast.error("City selection is required.");

    if (!isEdit && (!formData.password || !formData.confirm_password)) {
      return toast.error("Password and confirm password are required.");
    }

    if (formData.password !== formData.confirm_password) {
      return toast.error("Passwords do not match.");
    }

    if (mobileError || usernameError) {
      toast.error("Please fix errors before submitting.");
      return;
    }

    const payload = {
      name: formData.name,
      username: formData.username,
      mobile: formData.mobile,
      upi_id: formData.upi_id,
      city_id: formData.city_id,

      // Optional fields (will send even if empty)
      bank_name: formData.bank_name,
      verifier_name_in_bank: formData.verifier_name_in_bank,
      bank_address: formData.bank_address,
      bank_account_type: formData.bank_account_type,
      bank_account_number: formData.bank_account_number,
      bank_IFSC_code: formData.bank_IFSC_code,
    };

    if (!isEdit || formData.password) {
      payload.password = formData.password;
    }

    // Add created_by in create & edit when user has permission
    const canUpdateCreatedBy = hasPermission(
      allowedPermissions,
      "update_field_verifier_manager"
    );
    if (canUpdateCreatedBy) {
      // Null when cleared, otherwise selected manager's user_id
      payload.created_by = formData.created_by ? formData.created_by : null;
    }

    if (isEdit) {
      dispatch(editFieldVerifier({ id: editId, data: payload }));
    } else {
      dispatch(addFieldVerifier(payload));
    }

    setShowFormModal(false);
  };

  const handleMobileBlur = async () => {
    if (formData.mobile.length !== 10) return;

    if (isEdit) {
      const existing = fieldVerifiers.find((fv) => fv.id === editId);
      if (existing && existing.mobile === formData.mobile) return;
    }

    try {
      const res = await dispatch(
        checkFieldVerifierByMobile(formData.mobile)
      ).unwrap();
      if (res.exists) {
        setMobileError("Mobile already exists.");
        toast.error("Mobile already exists.");
      } else {
        setMobileError(null);
      }
    } catch {
      toast.error("Error checking mobile.");
    }
  };

  const handleUsernameBlur = async () => {
    if (!formData.username) return;

    try {
      const res = await dispatch(
        checkFieldVerifierByUsername(formData.username)
      ).unwrap();
      if (res.exists) {
        setUsernameError("Username already exists.");
        toast.error("Username already exists.");
      } else {
        setUsernameError(null);
      }
    } catch {
      toast.error("Error checking username.");
    }
  };

  const handleToggleStatus = (id) => {
    dispatch(toggleFieldVerifierStatus(id));
  };

  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  const handleConfirmDelete = () => {
    dispatch(removeFieldVerifier(confirmDeleteId));
    setConfirmDeleteId(null);
  };

  return (
    <div className="height-full-occupied user-data-container">
      {/* Manager filter above table, similar to other components */}
      {hasPermission(allowedPermissions, "field_verifier_filter_manager") && (
        <div className="filter-container-card" style={{ marginBottom: "16px" }}>
          <div
            className="filter-row"
            style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}
          >
            <SingleSearchSelect
              className="search-selector"
              options={[
                { value: "", label: "All Managers" },
                ...managerFilterOptions,
              ]}
              value={selectedManagerFilter || ""}
              onChange={(value) => {
                const val = value || "";
                setSelectedManagerFilter(val);
              }}
              placeholder="All Managers"
            />
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <CustomDataTable>
          {{
            buttons:
              hasPermission(allowedPermissions, "add_field_verifier") && (
                <button className="btn" onClick={openAddModal}>
                  Add Field Verifier
                </button>
              ),
            header: (
              <tr>
                <th style={{ width: "52px" }}>ID</th>
                <th style={{ width: "200px" }}>Name</th>
                <th style={{ width: "200px" }}>Username</th>
                <th style={{ width: "125px" }}>Mobile</th>
                <th style={{ width: "125px" }}>City</th>
                <th style={{ width: "125px" }}>Orders</th>
                <th>Created By/Manager</th>
                <th style={{ width: "125px" }}>Updated By</th>
                <th style={{ width: "100px" }}>Status</th>
                <th style={{ width: "150px" }}>Action</th>
              </tr>
            ),
            rows: filteredFieldVerifiers.map((verifier, index) => (
              <tr key={verifier.id}>
                <td className="sequential-number">{index + 1}</td>
                <td>{verifier.name}</td>
                <td>{verifier.username}</td>
                <td>{getMaskedMobile(verifier.mobile)}</td>
                <td>{verifier.city_name}</td>
                <td>
                  {fieldVerifierOrderCounts[verifier.id] || 0}
                </td>
                <td>{verifier.created_by}</td>
                <td>{verifier.updated_by || "-"}</td>
                <td>
                  {/* <span
                    className={
                      verifier.is_active ? "status-active" : "status-inactive"
                    }
                    onClick={() => handleToggleStatus(verifier.id)}
                    style={{ cursor: "pointer" }}
                    title="Click to toggle status"
                  >
                    {verifier.is_active ? "Active" : "Inactive"}
                  </span> */}
                  {hasPermission(allowedPermissions, "edit_field_verifier_status") ? (
                    <span
                      className={
                        verifier.is_active
                          ? "status-state status-active"
                          : "status-state status-inactive"
                      }
                      onClick={() => handleToggleStatus(verifier.id)}
                      style={{ cursor: "pointer" }}
                      title="Click to toggle status"
                    >
                      {verifier.is_active ? "Active" : "Inactive"}
                    </span>
                  ) : (
                    <span
                      className={
                        verifier.is_active
                          ? "status-state status-active"
                          : "status-state status-inactive"
                      }
                      title="You don't have permission to change status"
                    >
                      {verifier.is_active ? "Active" : "Inactive"}
                    </span>
                  )}
                </td>
                <td>
                  {hasPermission(allowedPermissions, "edit_field_verifier") && (
                    <button
                      className="action-icons"
                      onClick={() => openEditModal(verifier)}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {hasPermission(
                    allowedPermissions,
                    "delete_field_verifier"
                  ) && (
                    <button
                      className="action-icons"
                      onClick={() => confirmDelete(verifier.id, verifier.name)}
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

      {showFormModal && (
        <FormModel size="xl">
          {{
            title: isEdit ? "Edit Field Verifier" : "Add Field Verifier",
            body: (
              <form
                className="body-form-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
              >
                <div className="form-group-row">
                  <div className="form-group">
                    <label>Name</label>
                    <input
                      className="form-field"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>Username</label>
                    <input
                      className={`form-field ${
                        usernameError ? "error-border" : ""
                      }`}
                      value={formData.username}
                      onChange={(e) =>
                        setFormData({ ...formData, username: e.target.value })
                      }
                      onBlur={handleUsernameBlur}
                    />
                  </div>
                </div>

                {/* Manager (Created By) - controlled by permission */}
                {hasPermission(
                  allowedPermissions,
                  "update_field_verifier_manager"
                ) && (
                    <div className="form-group">
                      <label>Manager</label>
                      <SingleSearchSelect
                        className="search-selector"
                        options={users
                          .filter((u) =>
                            String(u.role_name || "")
                              .toUpperCase()
                              .includes("MANAGER")
                          )
                          .map((u) => ({
                            value: u.id,
                            label: `${u.name} (${u.role_name})`,
                          }))}
                        value={formData.created_by}
                        onChange={(val) =>
                          setFormData({ ...formData, created_by: val })
                        }
                        placeholder="Select manager"
                      />
                    </div>
                  )}
                <div className="form-group-row">
                  <div className="form-group">
                    <label>Mobile</label>
                    <div className="have-field-with-icon">
                      <div className="input-icon">
                        <ContactIcon />
                      </div>
                      <input
                        className={`form-field ${
                          mobileError ? "error-border" : ""
                        } ${
                          isEdit && !hasPermission(allowedPermissions, "view_field_verifier_mobile")
                            ? "disabled-field"
                            : ""
                        }`}
                        value={formData.mobile}
                        maxLength={10}
                        inputMode="numeric"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^\d*$/.test(val)) {
                            setFormData({ ...formData, mobile: val });
                            setMobileError(null);
                          }
                        }}
                        onBlur={handleMobileBlur}
                        disabled={isEdit && !hasPermission(allowedPermissions, "view_field_verifier_mobile")}
                        placeholder={
                          isEdit && !hasPermission(allowedPermissions, "view_field_verifier_mobile")
                            ? "Mobile number hidden - insufficient permissions"
                            : "Enter mobile number"
                        }
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>City</label>
                    {cities.length === 0 ? (
                      <p className="text-red-500">
                        No cities available or failed to load.
                      </p>
                    ) : (
                      <SingleSearchSelect
                        className="search-selector"
                        options={cities.map((city) => ({
                          value: city.id,
                          label: city.name,
                        }))}
                        value={formData.city_id}
                        onChange={(val) =>
                          setFormData({ ...formData, city_id: val })
                        }
                        placeholder="Select city"
                      />
                    )}
                  </div>
                </div>
                <div className="form-group-row">
                  <div className="form-group">
                    <label>UPI ID</label>
                    <input
                      className="form-field"
                      value={formData.upi_id}
                      onChange={(e) =>
                        setFormData({ ...formData, upi_id: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Bank Name</label>
                    <input
                      className="form-field"
                      value={formData.bank_name}
                      onChange={(e) =>
                        setFormData({ ...formData, bank_name: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="form-group-row">
                  <div className="form-group">
                    <label>Verifier Name in Bank</label>
                    <input
                      className="form-field"
                      value={formData.verifier_name_in_bank}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          verifier_name_in_bank: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>Bank Address</label>
                    <input
                      className="form-field"
                      value={formData.bank_address}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          bank_address: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-group-row">
                  <div className="form-group">
                    <label>Bank Account Type</label>
                    <input
                      className="form-field"
                      value={formData.bank_account_type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          bank_account_type: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>Bank Account Number</label>
                    <input
                      className="form-field"
                      value={formData.bank_account_number}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^\d*$/.test(val)) {
                          setFormData({
                            ...formData,
                            bank_account_number: val,
                          });
                          setMobileError(null);
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Bank IFSC Code</label>
                  <input
                    className="form-field"
                    value={formData.bank_IFSC_code}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bank_IFSC_code: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </div>
                <div className="form-group-row">
                  <div className="form-group">
                    <label>Password</label>
                    <div className="have-field-with-icon">
                      <div className="input-icon">
                        <PasswordIcon />
                      </div>
                      <input
                        type="password"
                        className="form-field"
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Confirm Password</label>
                    <div className="have-field-with-icon">
                      <div className="input-icon">
                        <PasswordIcon />
                      </div>
                      <input
                        type="password"
                        className="form-field"
                        value={formData.confirm_password}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            confirm_password: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="form-buttons">
                  <button className="submit-button" type="submit">
                    {isEdit ? "Update" : "Add"}
                  </button>
                </div>
              </form>
            ),
            onClose: () => {
              setShowFormModal(false);
              setIsEdit(false);
              setEditId(null);
              setFormData({
                name: "",
                username: "",
                mobile: "",
                password: "",
                confirm_password: "",
                city_id: null,
                upi_id: "",
                // New optional fields
                bank_name: "",
                verifier_name_in_bank: "",
                bank_address: "",
                bank_account_type: "",
                bank_account_number: "",
                bank_IFSC_code: "",
              });
              setMobileError(null);
              setUsernameError(null);
            },
          }}
        </FormModel>
      )}

      {confirmDeleteId && (
        <ConfirmationModal
          title="Confirm Deletion"
          message={`Are you sure you want to delete <span class='danger'>${confirmDeleteName}</span>?`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

export default FieldVerifiers;
