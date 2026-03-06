import React, { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams, useLocation } from "react-router-dom";
import {
  fetchOfficers,
  addOfficer,
  editOfficer,
  removeOfficer,
} from "../../redux/reducers/officerReducer";
import { fetchRoles } from "../../redux/reducers/roleReducer";
import { fetchBranches } from "../../redux/reducers/bankBranchReducer";
import { fetchCategories } from "../../redux/reducers/categoryReducer";
import { fetchOrders } from "../../redux/reducers/orderReducer";
import CustomDataTable from "../../components/CustomDataTable";
import ConfirmationModal from "../../components/ConfirmationModal";
import FormModel from "../../components/FormModel";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import {
  selectPermissions,
  selectUser,
} from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import {
  DeleteIcon,
  EditIcon,
  ContactIcon,
  PasswordIcon,
} from "../../components/icons";
import { toast } from "react-toastify";
import {
  checkEmailExist,
  checkUserByMobile,
} from "../../redux/reducers/userReducer";
import { usePageTitle } from "../../context/PageTitleContext";
import { Link } from "react-router-dom";

function Officers() {
  const dispatch = useDispatch();
  const allowedPermissions = useSelector(selectPermissions);
  const [searchParams] = useSearchParams();
  const branchIdParam = searchParams.get("branch_id");

  const { list: officers, loading } = useSelector((state) => state.officers);
  const { list: roles } = useSelector((state) => state.roles);
  const { list: branches } = useSelector((state) => state.branches);
  const { list: categories } = useSelector((state) => state.categories);
  const { list: orders } = useSelector((state) => state.orders);

  // get loggedin user
  const users = useSelector(selectUser);

  useEffect(() => {
    dispatch(fetchOfficers());
    dispatch(fetchRoles());
    dispatch(fetchBranches());
    dispatch(fetchCategories());
    dispatch(fetchOrders());
  }, [dispatch]);

  // Filter officers by branch_id if branch_id param exists
  const filteredOfficers = useMemo(() => {
    if (!branchIdParam) {
      return officers;
    }
    const branchId = parseInt(branchIdParam, 10);
    return officers.filter((officer) => officer.branch_id === branchId);
  }, [officers, branchIdParam]);

  // Calculate order counts for each officer
  const officerOrderCounts = useMemo(() => {
    const counts = {};
    filteredOfficers.forEach((officer) => {
      const orderCount = orders.filter(
        (order) => order.officer_id === officer.id
      ).length;
      counts[officer.id] = orderCount;
    });
    return counts;
  }, [filteredOfficers, orders]);

  // Calculate bank officers count for each officer
  const bankOfficerCounts = useMemo(() => {
    const counts = {};
    
    filteredOfficers.forEach((officer) => {
      // If officer's role_name is BANK OFFICER, show "-" (set to null)
      if (officer.role_name?.toUpperCase().includes("BANK OFFICER")) {
        counts[officer.id] = null; // null means show "-"
      }
      // If officer's role_name is BANK AUTHORITY, count BANK OFFICERS created by them
      else if (officer.role_name?.toUpperCase().includes("BANK AUTHORITY")) {
        // Match authority's name with created_by field (string comparison)
        const bankOfficersCreated = officers.filter(
          (o) =>
            o.created_by === officer.name &&
            o.role_name?.toUpperCase().includes("BANK OFFICER")
        ).length;
        counts[officer.id] = bankOfficersCreated;
      }
    });

    return counts;
  }, [filteredOfficers, officers]);

  // Calculate linked authorities count for each officer
  const linkedAuthoritiesCounts = useMemo(() => {
    const counts = {};
    
    filteredOfficers.forEach((officer) => {
      // If officer's role_name is BANK OFFICER, show "-" (set to null)
      if (officer.role_name?.toUpperCase().includes("BANK OFFICER")) {
        counts[officer.id] = null; // null means show "-"
      }
      // If officer's role_name is BANK AUTHORITY, count linked authorities
      else if (officer.role_name?.toUpperCase().includes("BANK AUTHORITY")) {
        const linkedCount = (officer.linked_authorities || []).length;
        counts[officer.id] = linkedCount;
      }
    });

    return counts;
  }, [filteredOfficers]);

  // Get main authority names for each officer (can have multiple)
  const mainAuthorityNames = useMemo(() => {
    const names = {};
    
    filteredOfficers.forEach((officer) => {
      // Find ALL officers who have this officer in their linked_authorities
      const mainAuthorities = officers.filter((o) => {
        if (!o.linked_authorities || !Array.isArray(o.linked_authorities)) return false;
        // Check if current officer's user_id is in the linked_authorities
        return o.linked_authorities.some((linked) => linked.id === officer.user_id);
      });
      
      // Join all main authority names (e.g., "A, B, C")
      names[officer.id] = mainAuthorities.length > 0
        ? mainAuthorities.map((o) => o.name).join(", ")
        : "-";
    });

    return names;
  }, [filteredOfficers, officers]);

  // Get selected branch for breadcrumb
  const selectedBranch = useMemo(() => {
    if (!branchIdParam) return null;
    const branchId = parseInt(branchIdParam, 10);
    return branches.find((branch) => branch.id === branchId);
  }, [branches, branchIdParam]);

  // Set page title with breadcrumb
  const { setTitle } = usePageTitle();
  useEffect(() => {
    if (selectedBranch) {
      setTitle(
        <>
          <Link to="/banks" className="text-blue-600 hover:underline">
            Banks
          </Link>{" "}
          &gt;{" "}
          <Link
            to={`/banks/${selectedBranch.bank_id}/branches`}
            className="text-blue-600 hover:underline"
          >
            {selectedBranch.bank_name || "Bank"}
          </Link>{" "}
          &gt; {selectedBranch.name} &gt; Officers
        </>
      );
    } else {
      setTitle("Officers");
    }
  }, [selectedBranch, setTitle]);

  const [formData, setFormData] = useState({
    name: "",
    role_id: "",
    department: [],
    branch_id: "",
    mobile: "",
    email: "",
    password: "",
    confirm_password: "",
    created_by: "",
    linked_authorities: [], // Changed from bank_authorities to linked_authorities
  });

  const [isEdit, setIsEdit] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");
  const [mobileError, setMobileError] = useState(null);
  const [emailError, setEmailError] = useState(null);
  const [createdByChanged, setCreatedByChanged] = useState(false);

  /* console.log("users",users); */

  // Check if current user is BANK AUTHORITY - matches any role containing "BANK AUTHORITY"
  const isBankAuthority = users?.role.name
    ?.toUpperCase()
    .includes("BANK AUTHORITY");

  const officerRoles = roles.filter((role) => {
    // If user is BANK AUTHORITY or Bank Officer, allow only Bank Officer to be selected
    if (
      users?.role.name?.toUpperCase().includes("BANK AUTHORITY") ||
      users?.role.name?.toUpperCase().includes("BANK OFFICER")
    ) {
      return role.name?.toUpperCase().includes("BANK OFFICER");
    }
    // Otherwise, allow both
    return (
      role.name?.toUpperCase().includes("BANK AUTHORITY") ||
      role.name?.toUpperCase().includes("BANK OFFICER")
    );
  });

  const openAddModal = () => {
    setIsEdit(false);

    // Find current user's officer record if they are BANK AUTHORITY
    let preSelectedDepartment = [];
    let preSelectedBranch = "";
    let defaultRoleId = "";

    if (isBankAuthority) {
      // Find the officer record that matches the current user
      const currentOfficer = officers.find(
        (officer) =>
          officer.user_id === users?.id ||
          officer.email === users?.email ||
          officer.name === users?.name
      );

      if (currentOfficer) {
        // Pre-select the same department(s) and branch as the BANK AUTHORITY user
        preSelectedDepartment = (currentOfficer.departments || []).map(
          (d) => d.id
        );
        preSelectedBranch = currentOfficer.branch_id;

        /* console.log("BANK AUTHORITY pre-selection:", {
          currentOfficer,
          preSelectedDepartment,
          preSelectedBranch
        }); */
      }

      // Set default role to Bank Officer for BANK AUTHORITY users
      const bankOfficerRole = roles.find((role) =>
        role.name?.toUpperCase().includes("BANK OFFICER")
      );
      if (bankOfficerRole) {
        defaultRoleId = bankOfficerRole.id.toString();
      }
    }

    setFormData({
      name: "",
      role_id: defaultRoleId,
      department: preSelectedDepartment,
      branch_id: preSelectedBranch,
      mobile: "",
      email: "",
      password: "",
      confirm_password: "",
      created_by: "",
      linked_authorities: [],
    });
    setShowFormModal(true);
  };

  /* console.log(branches); */
  const openEditModal = (officer) => {
    setIsEdit(true);
    setEditId(officer.id);
    setCreatedByChanged(false);
    
    // Check if the officer being edited is a BANK OFFICER
    const isOfficerBankOfficer = officer.role_name?.toUpperCase().includes("BANK OFFICER");
    
    // Find the creator's user_id from the created_by name
    let createdByUserId = "";
    if (isOfficerBankOfficer && officer.created_by) {
      const creatorOfficer = officers.find((o) => o.name === officer.created_by);
      createdByUserId = creatorOfficer?.user_id || "";
    }
    
    // Backend sends linked_authorities with 'id' field which is actually user_id
    // Extract just the IDs (which are user_ids from the user table)
    const linkedAuthIds = (officer.linked_authorities || []).map((a) => a.id);
    
    setFormData({
      name: officer.name,
      role_id:
        roles.find((r) => r.name === officer.role_name)?.id?.toString() || "",
      department: (officer.departments || []).map((d) => d.id),
      branch_id: officer.branch_id,
      mobile: officer.mobile,
      email: officer.email,
      password: "",
      confirm_password: "",
      created_by: createdByUserId,
      linked_authorities: linkedAuthIds,
    });
    setShowFormModal(true);
  };

  const handleSubmit = () => {
    const mobileRegex = /^[0-9]{10}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.name.trim()) return toast.error("Name is required.");
    if (!formData.email.trim() || !emailRegex.test(formData.email))
      return toast.error("Valid email is required.");
    if (!formData.mobile || !mobileRegex.test(formData.mobile))
      return toast.error("Mobile number must be 10 digits.");
    if (!formData.role_id) return toast.error("Role is required.");
    if (!formData.branch_id) return toast.error("Branch is required.");
    if (!formData.department.length)
      return toast.error("Department is required.");
    if (!isEdit && !formData.password)
      return toast.error("Password is required.");
    if (!isEdit && !formData.confirm_password)
      return toast.error("Confirm Password is required.");
    if (formData.password !== formData.confirm_password)
      return toast.error("Passwords do not match.");

    if (mobileError)
      return toast.error("Please fix mobile number error before submitting.");

    const payload = {
      name: formData.name,
      role_id: parseInt(formData.role_id),
      department: formData.department,
      branch_id: parseInt(formData.branch_id),
      mobile: formData.mobile,
      email: formData.email,
      linked_authorities: formData.linked_authorities,
    };

    if (!isEdit || formData.password) payload.password = formData.password;
    
    // Add created_by to payload ONLY if user manually changed it
    if (isEdit && createdByChanged) {
      // Find the officer being edited to check their role
      const editingOfficer = officers.find((o) => o.id === editId);
      const isEditingBankOfficer = editingOfficer?.role_name?.toUpperCase().includes("BANK OFFICER");
      
      // Check permission
      const canUpdateCreatedBy = hasPermission(allowedPermissions, "update_officer_created_by");
      
      if (isEditingBankOfficer && canUpdateCreatedBy) {
        // Only add to payload if user manually changed it - null if cleared, value if selected
        payload.created_by = formData.created_by ? formData.created_by : null;
      }
    }

    if (isEdit) {
      dispatch(editOfficer({ id: editId, data: payload }));
    } else {
      dispatch(addOfficer(payload));
    }

    setShowFormModal(false);
  };

  const handleMobileBlur = async () => {
    const mobile = formData.mobile;

    if (mobile.length !== 10) {
      setMobileError(null);
      toast.error("Mobile number must be exactly 10 digits.");
      return;
    }

    if (isEdit) {
      const existingUser = officers.find((u) => u.id === editId);
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
    const email = formData.email.trim().toLowerCase();
    if (!email) return;

    if (isEdit) {
      const existingUser = officers.find((u) => u.id === editId);
      if (existingUser && existingUser.email === email) {
        setEmailError(null);
        return;
      }
    }

    try {
      const resultAction = await dispatch(checkEmailExist(email));
      if (checkEmailExist.fulfilled.match(resultAction)) {
        const { exists } = resultAction.payload;
        if (exists) {
          setEmailError("Email already exists");
          toast.error("Email already exists.");
        } else {
          setEmailError(null);
        }
      }
    } catch (err) {
      console.error("Email check failed", err);
      toast.error("Something went wrong while checking Email.");
    }
  };

  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  const handleConfirmDelete = () => {
    dispatch(removeOfficer(confirmDeleteId));
    setConfirmDeleteId(null);
  };
  /* console.log(officers); */
  return (
    <div className="height-full-occupied user-data-container">
      {loading ? (
        <p>Loading...</p>
      ) : (
        <CustomDataTable>
          {{
            buttons: hasPermission(
              allowedPermissions,
              "add_branch_officer"
            ) && (
              <button className="btn" onClick={openAddModal}>
                Add Officer
              </button>
            ),
            header: (
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Department</th>
                <th>Branch</th>
                <th>Mobile</th>
                <th>Email</th>
                <th style={{ textAlign: "center" }}>Orders</th>
                <th style={{ textAlign: "center" }}>Bank Officers</th>
                <th style={{ textAlign: "center" }}>Linked Authorities</th>
                <th>Main Authority</th>
                <th>Created By</th>
                <th>Updated By</th>
                <th>Action</th>
              </tr>
            ),
            rows: filteredOfficers.map((officer, index) => (
              <tr key={officer.id}>
                <td className="sequential-number">{index + 1}</td>
                <td>{officer.name}</td>
                <td>{officer.role_name}</td>
                <td>{officer.departments.map((d) => d.name).join(", ")}</td>
                <td>{officer.branch_name}</td>
                <td>{officer.mobile}</td>
                <td>{officer.email}</td>
                <td style={{ textAlign: "center" }}>
                  {officerOrderCounts[officer.id] || 0}
                </td>
                <td style={{ textAlign: "center" }}>
                  {bankOfficerCounts[officer.id] === null
                    ? "-"
                    : bankOfficerCounts[officer.id] !== undefined
                    ? bankOfficerCounts[officer.id]
                    : "-"}
                </td>
                <td style={{ textAlign: "center" }}>
                  {linkedAuthoritiesCounts[officer.id] === null
                    ? "-"
                    : linkedAuthoritiesCounts[officer.id] !== undefined
                    ? linkedAuthoritiesCounts[officer.id]
                    : 0}
                </td>
                <td>{mainAuthorityNames[officer.id] || "-"}</td>
                <td>{officer.created_by}</td>
                <td>{officer.updated_by || "-"}</td>
                <td>
                  {hasPermission(allowedPermissions, "edit_branch_officer") && (
                    <button
                      className="action-icons"
                      onClick={() => openEditModal(officer)}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {hasPermission(
                    allowedPermissions,
                    "delete_branch_officer"
                  ) && (
                    <button
                      className="action-icons"
                      onClick={() => confirmDelete(officer.id, officer.name)}
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

      {/* Officer Form Modal */}
      {showFormModal && (
        <FormModel>
          {{
            title: isEdit ? "Edit Officer" : "Add Officer",
            body: (
              <form
                className="body-form-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
              >
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

                {/* Show Created By dropdown only when editing a BANK OFFICER */}
                {isEdit && (() => {
                  const editingOfficer = officers.find((o) => o.id === editId);
                  const isEditingBankOfficer = editingOfficer?.role_name?.toUpperCase().includes("BANK OFFICER");
                  
                  if (!isEditingBankOfficer) return null;
                  
                  // Check permission for updating created_by
                  const canUpdateCreatedBy = hasPermission(allowedPermissions, "update_officer_created_by");
                  
                  if (!canUpdateCreatedBy) return null;
                  
                  // Filter to show only BANK AUTHORITY users
                  const authorityUsers = officers.filter((officer) =>
                    officer.role_name?.toUpperCase().includes("BANK AUTHORITY")
                  );
                  
                  return (
                    <div className="form-group">
                      <label>Created By</label>
                      <SingleSearchSelect
                        options={authorityUsers.map((u) => ({
                          value: u.user_id,
                          label: u.name,
                        }))}
                        value={formData.created_by}
                        onChange={(val) => {
                          setFormData({ ...formData, created_by: val });
                          setCreatedByChanged(true); // Mark as changed when user selects
                        }}
                        placeholder="Select created by (Authority)"
                      />
                    </div>
                  );
                })()}

                {/* Only show role selector if user is NOT Bank Authority */}
                {!isBankAuthority && (
                  <div className="form-group">
                    <label>Role</label>
                    <div className="radio-group officer">
                      {officerRoles.map((role) => (
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
                    {/*  <SingleSearchSelect
                      options={officerRoles.map((r) => ({
                        value: r.id,
                        label: r.name,
                      }))}
                      value={formData.role_id}
                      onChange={(val) => setFormData({ ...formData, role_id: val })}
                      placeholder="Select role"
                    /> */}
                  </div>
                )}
                
                {/* Show Linked Authorities dropdown only when editing/creating a BANK AUTHORITY */}
                {(() => {
                  // Check permission first
                  const canUpdateLinkedAuthorities = hasPermission(allowedPermissions, "update_linked_authorities");
                  
                  if (!canUpdateLinkedAuthorities) return null;
                  
                  // Check if we're editing and if the officer being edited is BANK AUTHORITY
                  if (isEdit) {
                    const editingOfficer = officers.find((o) => o.id === editId);
                    const isEditingBankAuthority = editingOfficer?.role_name?.toUpperCase().includes("BANK AUTHORITY");
                    
                    if (!isEditingBankAuthority) return null;
                  } else {
                    // In create mode, check if the selected role is BANK AUTHORITY
                    const selectedRole = roles.find((r) => r.id.toString() === formData.role_id);
                    const isCreatingBankAuthority = selectedRole?.name?.toUpperCase().includes("BANK AUTHORITY");
                    
                    if (!isCreatingBankAuthority) return null;
                  }
                  
                  return (
                    <div className="form-group">
                      <label>Linked Authorities</label>
                      <SingleSearchSelect
                        isMulti
                        options={officers
                          .filter((officer) => {
                            // Only show BANK AUTHORITY officers
                            const isBankAuthority = officer.role_name?.toUpperCase().includes("BANK AUTHORITY");
                            // Exclude current officer being edited
                            const isNotCurrentOfficer = isEdit ? officer.id !== editId : true;
                            return isBankAuthority && isNotCurrentOfficer;
                          })
                          .map((u) => ({
                            value: u.user_id,
                            label: u.name,
                          }))}
                        value={formData.linked_authorities}
                        onChange={(val) =>
                          setFormData({ ...formData, linked_authorities: val })
                        }
                        placeholder="Select linked authorities"
                      />
                    </div>
                  );
                })()}
                
                {!isBankAuthority && (
                  <>
                    <div className="form-group">
                      <label>Department</label>
                      <SingleSearchSelect
                        isMulti
                        options={categories.map((c) => ({
                          value: c.id,
                          label: c.name,
                        }))}
                        value={formData.department}
                        onChange={(val) =>
                          setFormData({ ...formData, department: val })
                        }
                        placeholder="Select departments"
                        isDisabled={isBankAuthority}
                      />
                    </div>

                    <div className="form-group">
                      <label>Branch</label>
                      <SingleSearchSelect
                        options={branches.map((b) => ({
                          value: b.id,
                          label:
                            b.name + " - " + b.bank_name + " - " + b.city_name,
                        }))}
                        value={formData.branch_id}
                        onChange={(val) =>
                          setFormData({ ...formData, branch_id: val })
                        }
                        placeholder="Select branch"
                        isDisabled={isBankAuthority}
                      />
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label>Email</label>
                  <input
                    className={`form-field ${emailError ? "error-border" : ""}`}
                    value={formData.email}
                    name="emailFiled"
                    onChange={(e) => {
                      const email = e.target.value;
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
                  <label>Mobile</label>
                  <div className="have-field-with-icon">
                    <div className="input-icon">
                      <ContactIcon />
                    </div>
                    <input
                      className={`form-field ${
                        mobileError ? "error-border" : ""
                      }`}
                      maxLength={10}
                      inputMode="numeric"
                      value={formData.mobile}
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
              </form>
            ),
            onClose: () => {
              setShowFormModal(false);
              setIsEdit(false);
              setEditId(null);
              setCreatedByChanged(false); // Reset the flag
              setFormData({
                name: "",
                role_id: "",
                department: [],
                branch_id: "",
                mobile: "",
                email: "",
                password: "",
                confirm_password: "",
                created_by: "",
                linked_authorities: [],
              });
            },
          }}
        </FormModel>
      )}

      {/* Confirm Delete Modal */}
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

export default Officers;
