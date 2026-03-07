import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  fetchUsers,
  addUser,
  editUser,
  removeUser,
  checkUserByMobile,
  checkEmailExist,
} from "../../redux/reducers/userReducer";
import { fetchRoles } from "../../redux/reducers/roleReducer";
import { fetchCities } from "../../redux/reducers/cityReducer";
import CustomDataTable from "../../components/CustomDataTable";
import {
  DeleteIcon,
  EditIcon,
  PasswordIcon,
  ContactIcon,
  ViewIcon,
} from "../../components/icons";
import ConfirmationModal from "../../components/ConfirmationModal";
import FormModel from "../../components/FormModel";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { toast } from "react-toastify";

function Users() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  /* get logged user permission */
  const allowedPermissions = useSelector(selectPermissions);

  // Redux data
  const { list: users, loading } = useSelector((state) => state.users);
  const { list: roles } = useSelector((state) => state.roles);
  const { list: cities } = useSelector((state) => state.cities);

  // 🔃 Fetch everything on mount
  useEffect(() => {
    dispatch(fetchUsers());
    dispatch(fetchRoles());
    dispatch(fetchCities());
  }, [dispatch]);

  // 👤 New/Edit User State
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    mobile: "",
    role_id: "",
    city_id: "",
    password: "",
    confirm_password: "",
  });

  const [isEdit, setIsEdit] = useState(false);
  const [editUserId, setEditUserId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  const [mobileError, setMobileError] = useState(null);
  const [emailError, setEmailError] = useState(null);

  // Open Add User Form
  const openAddModal = () => {
    setIsEdit(false);
    setFormData({
      name: "",
      email: "",
      mobile: "",
      role_id: "",
      city_id: "",
      password: "",
      confirm_password: "",
    });
    setShowFormModal(true);
  };

  // ✏️ Open Edit Modal
  const openEditModal = (user) => {
    setIsEdit(true);
    setEditUserId(user.id);
    setFormData({
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role_id: user.role_id?.toString() || "",
      city_id: user.city_id || "",
      password: "",
      confirm_password: "",
    });
    setShowFormModal(true);
  };

  // View Attendance
  const viewAttendance = (userId) => {
    navigate(`/users/${userId}/attendance`);
  };

  // ✅ Submit Add/Edit
  const handleSubmit = () => {
    const mobileRegex = /^[0-9]{10}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Collect all validation errors
    if (!formData.name.trim()) {
      toast.error("Name is required.");
      return;
    }

    // ✅ Email validation
    if (!formData.email.trim()) {
      toast.error("Email is required.");
      return;
    }
    if (!emailRegex.test(formData.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    // ✅ Mobile validation
    if (!formData.mobile) {
      toast.error("Mobile number is required.");
      return;
    }
    if (!mobileRegex.test(formData.mobile)) {
      toast.error("Mobile number must be exactly 10 digits.");
      return;
    }

    if (!formData.role_id) {
      toast.error("Role is required.");
      return;
    }
    if (!formData.city_id) {
      toast.error("City is required.");
      return;
    }
    /* // ✅ Validate mobile number
    
    if (!formData.mobile || !mobileRegex.test(formData.mobile)) {
      setMobileError("Mobile number must be exactly 10 digits.");
      toast.error("Mobile number must be exactly 10 digits.");
      return;
    } */

    // Password handling: set default "123456" if empty, validate confirm password only if custom password is entered
    let finalPassword = formData.password || "123456";

    // Only validate confirm password if user entered a custom password
    if (formData.password && formData.password !== formData.confirm_password) {
      toast.error("Password and Confirm Password do not match.");
      return;
    }
    if (mobileError) {
      toast.error("Please fix mobile number error before submitting.");
      return;
    }
    // All validations passed — build payload
    const payload = {
      name: formData.name,
      email: formData.email,
      mobile: formData.mobile,
      role_id: parseInt(formData.role_id),
      city_id: parseInt(formData.city_id),
    };

    if (!isEdit || formData.password) {
      payload.password = finalPassword;
    }

    if (isEdit) {
      dispatch(editUser({ id: editUserId, data: payload }));
    } else {
      dispatch(addUser(payload));
    }

    // Close modal after submit
    setShowFormModal(false);
    setMobileError(null);
    setEmailError(null);
  };

  const handleMobileBlur = async () => {
    const mobile = formData.mobile;

    if (mobile.length !== 10) {
      setMobileError(null);
      toast.error("Mobile number must be exactly 10 digits.");
      return;
    }

    // Skip check if same mobile number in edit mode
    if (isEdit) {
      const existingUser = users.find((u) => u.id === editUserId);
      if (existingUser && existingUser.mobile === mobile) {
        setMobileError(null);
        return;
      }
    }

    try {
      const res = await dispatch(checkUserByMobile(mobile)).unwrap();
      if (res.exists) {
        setMobileError("Mobile number already exists.");
        toast.error("Mobile number already exists.");
      } else {
        setMobileError(null);
      }
    } catch (err) {
      console.error("Mobile check failed", err);
      toast.error("Something went wrong while checking mobile.");
    }
  };

  const handleEmailBlur = async () => {
    let email = formData.email.trim().toLowerCase();
    /* console.log("email", email); */
    if (!email) return;

    // Add domain if not present
    if (!email.includes("@")) {
      email = email + "@valuetechsolutions.in";
      setFormData({
        ...formData,
        email,
      });
    }

    try {
      const resultAction = await dispatch(checkEmailExist(email));

      if (checkEmailExist.fulfilled.match(resultAction)) {
        const { exists } = resultAction.payload;
        if (exists) {
          setEmailError("Email already exists");
          toast.error("Email already exists.");
        } else {
          setEmailError(null); // clear error if valid
        }
      }
    } catch (err) {
      console.error("Email check failed", err);
      toast.error("Something went wrong while checking Email.");
    }
  };
  // 🗑️ Confirm delete
  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  const handleConfirmDelete = () => {
    dispatch(removeUser(confirmDeleteId));
    setConfirmDeleteId(null);
  };

  return (
    <div className="height-full-occupied user-data-container">
      {loading ? (
        <p>Loading...</p>
      ) : (
        <CustomDataTable>
          {{
            buttons: hasPermission(allowedPermissions, "add_user") && (
              <button className="btn" onClick={openAddModal}>
                Add User
              </button>
            ),
            header: (
              <tr>
                <th style={{ width: "52px" }}>ID</th>
                <th style={{ width: "200px" }}>Name</th>
                <th style={{ width: "200px" }}>Email</th>
                <th style={{ width: "150px" }}>Contact</th>
                <th style={{ width: "150px" }}>Role</th>
                {hasPermission(allowedPermissions, "otp_tab_in_user_table") && (
                  <th style={{ width: "120px" }}>Login Code</th>
                )}
                <th style={{ width: "150px" }}>Created By</th>
                <th>Updated By</th>
                <th style={{ textAlign: "center", width: "150px" }}>Action</th>
              </tr>
            ),
            rows: users.map((user, index) => (
              <tr key={user.id}>
                <td className="sequential-number">{index + 1}</td>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.mobile}</td>
                <td>{user.role_name}</td>
                {hasPermission(allowedPermissions, "otp_tab_in_user_table") && (
                  <td style={{ fontFamily: "monospace", fontWeight: "bold", fontSize: "14px" }}>
                    {user.otp || user.current_otp || "-"}
                  </td>
                )}
                <td>{user.created_by}</td>
                <td>{user.updated_by || "-"}</td>
                <td style={{ textAlign: "center" }}>
                  {hasPermission(allowedPermissions, "show_attendance_of_all_users") && (
                    <button
                      className="action-icons"
                      onClick={() => viewAttendance(user.id)}
                    >
                      <ViewIcon />
                    </button>
                  )}
                  {hasPermission(allowedPermissions, "edit_user") && (
                    <button
                      className="action-icons"
                      onClick={() => openEditModal(user)}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {hasPermission(allowedPermissions, "delete_user") && (
                    <button
                      className="action-icons"
                      onClick={() => confirmDelete(user.id, user.name)}
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
            title: isEdit ? "Edit User" : "Add User",
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
                    <label htmlFor="nameFiled">Name</label>
                    <input
                      className="form-field"
                      id="nameFiled"
                      name="nameFiled"
                      value={formData.name}
                      onChange={(e) => {
                        const name = e.target.value.toUpperCase();
                        setFormData({
                          ...formData,
                          name,
                        });
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="emailFiled">Email</label>
                    <input
                      className={`form-field ${
                        emailError ? "error-border" : ""
                      }`}
                      id="emailFiled"
                      name="emailFiled"
                      value={formData.email}
                      onChange={(e) => {
                        // Remove spaces and symbols, convert to lowercase
                        const email = e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]/g, "");
                        setFormData({
                          ...formData,
                          email,
                        });
                        setEmailError("");
                      }}
                      onBlur={handleEmailBlur}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="contactNumber">Contact Number</label>
                    <div className="have-field-with-icon">
                      <div className="input-icon">
                        <ContactIcon />
                      </div>
                      <input
                        className={`form-field ${
                          mobileError ? "error-border" : ""
                        }`}
                        id="contactNumber"
                        name="contactNumber"
                        value={formData.mobile}
                        inputMode="numeric"
                        maxLength={10}
                        onChange={(e) => {
                          const value = e.target.value;

                          // Allow only numeric input (prevents typing anything else)
                          if (/^\d*$/.test(value)) {
                            setFormData({ ...formData, mobile: value });
                            setMobileError(null);
                          }
                        }}
                        onBlur={handleMobileBlur}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData("text");
                          if (!/^\d+$/.test(pasted)) {
                            e.preventDefault();
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <div className="radio-group">
                      {roles
                        .filter(
                          (role) =>
                            !role.name
                              .toUpperCase()
                              .includes("BANK AUTHORITY") &&
                            !role.name.toUpperCase().includes("BANK OFFICER") &&
                            !role.name.toUpperCase().includes("CREDIT HEAD")
                        )
                        .map((role) => (
                          <label
                            key={role.id}
                            className={`radio-label ${
                              formData.role_id === role.id.toString()
                                ? "selected"
                                : ""
                            }`}
                          >
                            <input
                              type="radio"
                              name="role"
                              value={role.id}
                              checked={formData.role_id === role.id.toString()}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  role_id: e.target.value,
                                })
                              }
                            />
                            {role.name}
                          </label>
                        ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="citiesFiled">City</label>
                    <SingleSearchSelect
                      id="citiesFiled"
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
                  </div>

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
              setEditUserId(null);
              setFormData({
                name: "",
                contact_number: "",
                role_id: "",
                city_ids: [],
                password: "",
                confirm_password: "",
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

export default Users;
