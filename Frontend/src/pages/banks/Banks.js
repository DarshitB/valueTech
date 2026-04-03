import React, { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchBanks,
  addBank,
  editBank,
  removeBank,
} from "../../redux/reducers/bankReducer";
import { fetchBranches } from "../../redux/reducers/bankBranchReducer";
import { fetchOfficers } from "../../redux/reducers/officerReducer";
import { fetchOrders } from "../../redux/reducers/orderReducer";
import CustomDataTable from "../../components/CustomDataTable";
import FormModel from "../../components/FormModel";
import ConfirmationModal from "../../components/ConfirmationModal";
import { DeleteIcon, EditIcon } from "../../components/icons";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";

function Banks() {
  const dispatch = useDispatch();

  // 🔐 Get user permissions
  const allowedPermissions = useSelector(selectPermissions);

  // 🏦 Get bank list and loading status from Redux
  const { list: banks, loading } = useSelector((state) => state.banks);
  const { list: branches } = useSelector((state) => state.branches);
  const { list: officers } = useSelector((state) => state.officers);
  const { list: orders } = useSelector((state) => state.orders);

  // 🔃 Fetch banks, branches, officers, and orders on mount
  useEffect(() => {
    dispatch(fetchBanks());
    dispatch(fetchBranches());
    dispatch(fetchOfficers());
    dispatch(fetchOrders());
  }, [dispatch]);

  // Calculate counts for each bank
  const bankCounts = useMemo(() => {
    const counts = {};

    banks.forEach((bank) => {
      // Count branches for this bank
      const branchCount = branches.filter(
        (branch) => branch.bank_id === bank.id
      ).length;

      // Get all branch IDs for this bank
      const bankBranchIds = branches
        .filter((branch) => branch.bank_id === bank.id)
        .map((branch) => branch.id);

      // Count officers in branches of this bank
      const officerCount = officers.filter((officer) =>
        bankBranchIds.includes(officer.branch_id)
      ).length;

      // Get all officer IDs for this bank
      const bankOfficerIds = officers
        .filter((officer) => bankBranchIds.includes(officer.branch_id))
        .map((officer) => officer.id);

      // Count orders for officers of this bank
      const orderCount = orders.filter((order) =>
        bankOfficerIds.includes(order.officer_id)
      ).length;

      counts[bank.id] = {
        branches: branchCount,
        officers: officerCount,
        orders: orderCount,
      };
    });

    return counts;
  }, [banks, branches, officers, orders]);

  // ✍️ Local state for form data and modal visibility
  const [formData, setFormData] = useState({ name: "", initial: "" });
  const [isEdit, setIsEdit] = useState(false);
  const [editBankId, setEditBankId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  // ➕ Open add modal
  const openAddModal = () => {
    setIsEdit(false);
    setEditBankId(null);
    setFormData({ name: "", initial: "" });
    setShowFormModal(true);
  };

  // 📝 Open edit modal
  const openEditModal = (bank) => {
    setIsEdit(true);
    setEditBankId(bank.id);
    setFormData({ name: bank.name, initial: bank.initial });
    setShowFormModal(true);
  };

  // ✅ Submit form (add or edit)
  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Bank name is required.");
      return;
    }
    if (!formData.initial.trim()) {
      toast.error("Bank initial is required.");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      initial: formData.initial.trim(),
    };

    /* if (isEdit) {
      dispatch(editBank({ id: editBankId, data: payload }));
    } else {
      dispatch(addBank(payload));
    }

    setShowFormModal(false); */
    try {
      const action = isEdit
        ? await dispatch(editBank({ id: editBankId, data: payload }))
        : await dispatch(addBank(payload));

      if (action.type.endsWith("fulfilled")) {
        // ✅ Close modal on success only
        setShowFormModal(false);

        // Optional: reset form
        setFormData({ name: "", initial: "" });
      }
    } catch (error) {
      toast.error("Failed to submit bank");
    }
  };

  // ❌ Open delete confirmation
  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  // 🗑️ Confirm delete handler
  const handleConfirmDelete = () => {
    dispatch(removeBank(confirmDeleteId));
    setConfirmDeleteId(null);
  };

  return (
    <div className="height-full-occupied bank-data-container">
      {loading ? (
        <p>Loading...</p>
      ) : (
        <CustomDataTable>
          {{
            buttons: hasPermission(allowedPermissions, "add_bank") && (
              <button className="btn" onClick={openAddModal}>
                Add Bank
              </button>
            ),
            header: (
              <tr>
                <th style={{ width: "52px" }}>ID</th>
                <th style={{ width: "200px" }}>Name</th>
                <th style={{ width: "150px" }}>Initial</th>
                <th style={{ width: "100px" }}>Branches</th>
                <th style={{ width: "100px" }}>Officers</th>
                <th>Orders</th>
                <th style={{ width: "150px" }}>Created By</th>
                <th style={{ width: "150px" }}>Updated By</th>
                <th style={{ textAlign: "center", width: "150px" }}>Action</th>
              </tr>
            ),
            rows: banks.map((bank, index) => (
              <tr key={bank.id}>
                <td className="sequential-number">{index + 1}</td>
                <td>
                  {hasPermission(allowedPermissions, "view_bank_branch") ? (
                    <Link
                      className="get-me-inside"
                      to={`/banks/${bank.id}/branches`}
                    >
                      {bank.name}
                    </Link>
                  ) : (
                    bank.name
                  )}
                </td>
                <td>{bank.initial}</td>
                <td>{bankCounts[bank.id]?.branches || 0}</td>
                <td>{bankCounts[bank.id]?.officers || 0}</td>
                <td>{bankCounts[bank.id]?.orders || 0}</td>
                <td>{bank.created_by}</td>
                <td>{bank.updated_by || "-"}</td>
                <td style={{ textAlign: "center" }}>
                  {hasPermission(allowedPermissions, "edit_bank") && (
                    <button
                      className="action-icons"
                      onClick={() => openEditModal(bank)}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {hasPermission(allowedPermissions, "delete_bank") && (
                    <button
                      className="action-icons"
                      onClick={() => confirmDelete(bank.id, bank.name)}
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

      {/* 🧾 Add/Edit Modal */}
      {showFormModal && (
        <FormModel>
          {{
            title: isEdit ? "Edit Bank" : "Add Bank",
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
                    <label htmlFor="bankName">Bank Name</label>
                    <input
                      className="form-field"
                      id="bankName"
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
                    <label htmlFor="bankInitial">Bank Initial</label>
                    <input
                      className="form-field"
                      id="bankInitial"
                      value={formData.initial}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          initial: e.target.value.toUpperCase(),
                        })
                      }
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
              setFormData({ name: "", initial: "" });
              setIsEdit(false);
              setEditBankId(null);
            },
          }}
        </FormModel>
      )}

      {/* ⚠️ Confirm Delete Modal */}
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

export default Banks;
