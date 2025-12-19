// src/pages/BankBranches.jsx

import React, { useEffect, useLayoutEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchBranches,
  addBranch,
  editBranch,
  removeBranch,
} from "../../redux/reducers/bankBranchReducer";
import { fetchBankById, fetchBanks } from "../../redux/reducers/bankReducer";
import { fetchCities } from "../../redux/reducers/cityReducer";
import { fetchOfficers } from "../../redux/reducers/officerReducer";
import { fetchOrders } from "../../redux/reducers/orderReducer";
import CustomDataTable from "../../components/CustomDataTable";
import FormModel from "../../components/FormModel";
import ConfirmationModal from "../../components/ConfirmationModal";
import { DeleteIcon, EditIcon } from "../../components/icons";
import { toast } from "react-toastify";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import { usePageTitle } from "../../context/PageTitleContext";

function BankBranches() {
  const { id } = useParams(); // 👈 Get bank ID from route param

  // Inside component
  const { setTitle } = usePageTitle();

  const dispatch = useDispatch();

  const allowedPermissions = useSelector(selectPermissions);

  // 🔁 Fetch branches, officers, and orders once
  useEffect(() => {
    dispatch(fetchBranches());
    /* dispatch(fetchBanks()); */
    dispatch(fetchCities());
    dispatch(fetchOfficers());
    dispatch(fetchOrders());
  }, [dispatch]);

  // 🔀 Redux state selectors
  const { list: allBranches, loading } = useSelector((state) => state.branches);
  /* const { list: banks } = useSelector((state) => state.banks); */
  const { list: cities } = useSelector((state) => state.cities);
  const { list: officers } = useSelector((state) => state.officers);
  const { list: orders } = useSelector((state) => state.orders);

  /* const currentBank = banks.find((b) => b.id === parseInt(id)); */
  const branches = allBranches.filter(
    (branch) => branch.bank_id === parseInt(id)
  );

  // Calculate officer and order counts for each branch
  const branchCounts = useMemo(() => {
    const counts = {};

    // Count officers per branch
    branches.forEach((branch) => {
      const officerCount = officers.filter(
        (officer) => officer.branch_id === branch.id
      ).length;

      // Get all officer IDs for this branch
      const branchOfficerIds = officers
        .filter((officer) => officer.branch_id === branch.id)
        .map((officer) => officer.id);

      // Count orders for officers of this branch
      const orderCount = orders.filter((order) =>
        branchOfficerIds.includes(order.officer_id)
      ).length;

      counts[branch.id] = {
        officers: officerCount,
        orders: orderCount,
      };
    });

    return counts;
  }, [branches, officers, orders]);

  // set page title
  useLayoutEffect(() => {
    dispatch(fetchBankById(id)).then((res) => {
      const bank = res.payload;
      setTitle(
        <>
          <Link to="/banks" className="text-blue-600 hover:underline">
            Banks
          </Link>{" "}
          &gt; {bank.name}
        </>
      );
    });
  }, [id]);

  // 🧾 Form and modal states
  const [formData, setFormData] = useState({ name: "", city_id: "" });
  const [isEdit, setIsEdit] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  // ➕ Open Add Modal
  const openAddModal = () => {
    setIsEdit(false);
    setFormData({ name: "", city_id: "" });
    setShowFormModal(true);
  };

  // ✏️ Open Edit Modal
  const openEditModal = (branch) => {
    setIsEdit(true);
    setEditId(branch.id);
    setFormData({
      name: branch.name,
      city_id: branch.city_id,
    });
    setShowFormModal(true);
  };

  // ✅ Submit (Add or Edit)
  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Branch name is required.");
      return;
    }

    if (!formData.city_id) {
      toast.error("City name is required.");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      bank_id: parseInt(id),
      city_id: formData.city_id ? parseInt(formData.city_id) : null,
    };

    /* if (isEdit) {
      dispatch(editBranch({ id: editId, data: payload }));
    } else {
      dispatch(addBranch(payload));
    }

    setShowFormModal(false); */

    try {
      const action = isEdit
        ? await dispatch(editBranch({ id: editId, data: payload }))
        : await dispatch(addBranch(payload));

      if (action.type.endsWith("fulfilled")) {
        // ✅ Close modal on success only
        setShowFormModal(false);

        // Optional: reset form
        setFormData({ name: "", city_id: "" });
      }
    } catch (error) {
      toast.error("Failed to submit branch");
    }
  };

  // ❌ Open confirm delete
  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  // 🗑️ Confirm delete handler
  const handleConfirmDelete = () => {
    dispatch(removeBranch(confirmDeleteId));
    setConfirmDeleteId(null);
  };

  return (
    <div className="height-full-occupied">
      {loading ? (
        <p>Loading branches...</p>
      ) : (
        <CustomDataTable>
          {{
            buttons: hasPermission(allowedPermissions, "add_bank_branch") && (
              <button className="btn" onClick={openAddModal}>
                Add Branch
              </button>
            ),
            header: (
              <tr>
                <th style={{ width: "52px" }}>ID</th>
                <th style={{ width: "200px" }}>Name</th>
                <th style={{ width: "150px" }}>City</th>
                <th style={{ width: "100px" }}>Officers</th>
                <th>Orders</th>
                <th style={{ width: "150px" }}>Created By</th>
                <th style={{ width: "150px" }}>Updated By</th>
                <th style={{ textAlign: "center", width: "150px" }}>Action</th>
              </tr>
            ),
            rows: branches.map((branch, index) => (
              <tr key={branch.id}>
                <td className="sequential-number">{index + 1}</td>
                <td>
                  {hasPermission(allowedPermissions, "view_branch_officer") ? (
                    <Link
                      className="get-me-inside"
                      to={`/officers?branch_id=${branch.id}`}
                    >
                      {branch.name}
                    </Link>
                  ) : (
                    branch.name
                  )}
                </td>
                <td>{branch.city_name}</td>
                <td>{branchCounts[branch.id]?.officers || 0}</td>
                <td>{branchCounts[branch.id]?.orders || 0}</td>
                <td>{branch.created_by}</td>
                <td>{branch.updated_by || "-"}</td>
                <td style={{ textAlign: "center" }}>
                  {hasPermission(allowedPermissions, "edit_bank_branch") && (
                    <button
                      className="action-icons"
                      onClick={() => openEditModal(branch)}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {hasPermission(allowedPermissions, "delete_bank_branch") && (
                    <button
                      className="action-icons"
                      onClick={() => confirmDelete(branch.id, branch.name)}
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

      {/* Add/Edit Modal */}
      {showFormModal && (
        <FormModel>
          {{
            title: isEdit ? "Edit Branch" : "Add Branch",
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
                    <label htmlFor="branchName">Branch Name</label>
                    <input
                      className="form-field"
                      id="branchName"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          name: e.target.value.toUpperCase(),
                        })
                      }
                    />
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
                      // Set the value as the selected city's ID
                      value={formData.city_id}
                      // On change, update only the city_id in formData
                      onChange={(val) =>
                        setFormData({ ...formData, city_id: val })
                      }
                      placeholder="Select city"
                    />
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
              setFormData({ name: "", city_id: "" });
              setIsEdit(false);
              setEditId(null);
            },
          }}
        </FormModel>
      )}

      {/* Confirm Delete Modal */}
      {confirmDeleteId && (
        <ConfirmationModal
          title="Confirm Delete"
          message={`Are you sure you want to delete <span class="danger">${confirmDeleteName}</span>?`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

export default BankBranches;
