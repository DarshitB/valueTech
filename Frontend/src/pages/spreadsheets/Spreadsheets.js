import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchSpreadsheets,
  addSpreadsheet,
  editSpreadsheet,
  removeSpreadsheet,
} from "../../redux/reducers/spreadsheetReducer";
import CustomDataTable from "../../components/CustomDataTable";
import FormModel from "../../components/FormModel";
import ConfirmationModal from "../../components/ConfirmationModal";
import { DeleteIcon, EditIcon } from "../../components/icons";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { usePageTitle } from "../../context/PageTitleContext";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

function Spreadsheets() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { setTitle } = usePageTitle();

  const { list: spreadsheets, loading, saving } = useSelector(
    (state) => state.spreadsheets
  );
  const allowedPermissions = useSelector(selectPermissions);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [editSpreadsheetId, setEditSpreadsheetId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  useEffect(() => {
    setTitle("Spreadsheets");
  }, [setTitle]);

  useEffect(() => {
    dispatch(fetchSpreadsheets());
  }, [dispatch]);

  const formatDate = (dateString) => {
    if (!dateString) return "-";

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "-";

      return new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    } catch {
      return "-";
    }
  };

  const resetForm = () => {
    setFormData({ name: "", description: "" });
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    resetForm();
  };

  const openEditModal = (spreadsheet) => {
    setEditSpreadsheetId(spreadsheet.id);
    setFormData({
      name: spreadsheet.name || "",
      description: spreadsheet.description || "",
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditSpreadsheetId(null);
    resetForm();
  };

  const handleSpreadsheetRowClick = (spreadsheetId) => {
    navigate(`/spreadsheet/${spreadsheetId}`);
  };

  const buildPayload = () => ({
    name: formData.name.trim(),
    description: formData.description.trim() || null,
  });

  const handleCreateSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Spreadsheet name is required.");
      return;
    }

    try {
      const action = await dispatch(addSpreadsheet(buildPayload()));

      if (action.type.endsWith("fulfilled")) {
        closeCreateModal();
        dispatch(fetchSpreadsheets());
      }
    } catch (error) {
      toast.error("Failed to create spreadsheet");
    }
  };

  const handleEditSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Spreadsheet name is required.");
      return;
    }

    try {
      const result = await dispatch(
        editSpreadsheet({
          id: editSpreadsheetId,
          data: buildPayload(),
        })
      );

      if (editSpreadsheet.fulfilled.match(result)) {
        closeEditModal();
      }
    } catch (error) {
      toast.error("Failed to update spreadsheet");
    }
  };

  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  const handleConfirmDelete = async () => {
    try {
      const result = await dispatch(removeSpreadsheet(confirmDeleteId));

      if (removeSpreadsheet.fulfilled.match(result)) {
        setConfirmDeleteId(null);
        setConfirmDeleteName("");
      }
    } catch (error) {
      toast.error("Failed to delete spreadsheet");
    }
  };

  const renderSpreadsheetForm = (onSubmit, submitLabel, submittingLabel) => (
    <form
      className="body-form-box"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="body-form-box">
        <div className="form-group">
          <label htmlFor="spreadsheetName">Name</label>
          <input
            className="form-field"
            id="spreadsheetName"
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            disabled={saving}
          />
        </div>
        <div className="form-group">
          <label htmlFor="spreadsheetDescription">Description</label>
          <input
            className="form-field"
            id="spreadsheetDescription"
            value={formData.description}
            onChange={(e) =>
              setFormData({
                ...formData,
                description: e.target.value,
              })
            }
            disabled={saving}
          />
        </div>
        <div className="form-buttons">
          <button className="submit-button" type="submit" disabled={saving}>
            {saving ? submittingLabel : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );

  return (
    <div className="height-full-occupied spreadsheet-data-container">
      {loading ? (
        <p>Loading...</p>
      ) : (
        <CustomDataTable>
          {{
            buttons: (
              <button className="btn" type="button" onClick={openCreateModal}>
                New Spreadsheet
              </button>
            ),
            header: (
              <tr>
                <th style={{ width: "52px" }}>ID</th>
                <th style={{ width: "250px" }}>Name</th>
                <th>Description</th>
                <th style={{ width: "180px" }}>Created At</th>
                <th style={{ width: "180px" }}>Updated At</th>
                <th style={{ width: "120px", textAlign: "center" }}>Action</th>
              </tr>
            ),
            rows:
              spreadsheets.length === 0
                ? [
                    <tr key="empty">
                      <td colSpan={6} className="text-center">
                        No spreadsheets found
                      </td>
                    </tr>,
                  ]
                : spreadsheets.map((spreadsheet, index) => (
                    <tr
                      key={spreadsheet.id}
                      onClick={() => handleSpreadsheetRowClick(spreadsheet.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="sequential-number">{index + 1}</td>
                      <td>{spreadsheet.name}</td>
                      <td>{spreadsheet.description || "-"}</td>
                      <td>{formatDate(spreadsheet.created_at)}</td>
                      <td>{formatDate(spreadsheet.updated_at)}</td>
                      <td style={{ textAlign: "center" }}>
                        {hasPermission(
                          allowedPermissions,
                          "edit_spreadsheet"
                        ) && (
                          <button
                            className="action-icons"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(spreadsheet);
                            }}
                          >
                            <EditIcon />
                          </button>
                        )}
                        {hasPermission(
                          allowedPermissions,
                          "delete_spreadsheet"
                        ) && (
                          <button
                            className="action-icons"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDelete(
                                spreadsheet.id,
                                spreadsheet.name
                              );
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

      {showCreateModal && (
        <FormModel>
          {{
            title: "New Spreadsheet",
            body: renderSpreadsheetForm(
              handleCreateSubmit,
              "Create",
              "Creating..."
            ),
            onClose: closeCreateModal,
          }}
        </FormModel>
      )}

      {showEditModal && (
        <FormModel>
          {{
            title: "Edit Spreadsheet",
            body: renderSpreadsheetForm(
              handleEditSubmit,
              "Update",
              "Updating..."
            ),
            onClose: closeEditModal,
          }}
        </FormModel>
      )}

      {confirmDeleteId && (
        <ConfirmationModal
          title="Confirm Deletion"
          message={`Are you sure you want to delete <span class="danger">${confirmDeleteName}</span>?`}
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setConfirmDeleteId(null);
            setConfirmDeleteName("");
          }}
        />
      )}
    </div>
  );
}

export default Spreadsheets;
