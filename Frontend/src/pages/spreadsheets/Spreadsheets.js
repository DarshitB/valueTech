import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchSpreadsheets,
  addSpreadsheet,
  editSpreadsheet,
  removeSpreadsheet,
  pinSpreadsheetById,
  unpinSpreadsheetById,
  archiveSpreadsheetById,
  unarchiveSpreadsheetById,
} from "../../redux/reducers/spreadsheetReducer";
import CustomDataTable from "../../components/CustomDataTable";
import FormModel from "../../components/FormModel";
import ConfirmationModal from "../../components/ConfirmationModal";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import {
  ArchiveIcon,
  DeleteIcon,
  EditIcon,
  PinIcon,
} from "../../components/icons";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { usePageTitle } from "../../context/PageTitleContext";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { getUsers } from "../../api/user.api";

const PINNED_ICON_COLOR = "#f59e0b";

function Spreadsheets({ archived = false }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { setTitle } = usePageTitle();
  const showArchived = Boolean(archived);

  const { list: spreadsheets, loading, saving } = useSelector(
    (state) => state.spreadsheets
  );
  const allowedPermissions = useSelector(selectPermissions);
  const currentUser = useSelector((state) => state.auth.user);
  const canAddSpreadsheet = hasPermission(allowedPermissions, "add_spreadsheet");
  const canArchiveSpreadsheet = hasPermission(
    allowedPermissions,
    "create_archive_spreadsheet"
  );
  const canViewArchivedSpreadsheets = hasPermission(
    allowedPermissions,
    "view_archive_spreadsheet"
  );
  const roleName = currentUser?.role?.name || "";
  const isDeveloperAdmin = roleName.toLowerCase() === "developer_admin";

  const isSpreadsheetCreator = (spreadsheet) =>
    Number(spreadsheet?.created_by) === Number(currentUser?.id);

  const canEditSpreadsheet = (spreadsheet) =>
    hasPermission(allowedPermissions, "edit_spreadsheet") ||
    isSpreadsheetCreator(spreadsheet);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    assigned_user_ids: [],
  });
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [editSpreadsheetId, setEditSpreadsheetId] = useState(null);
  const [canEditAssignments, setCanEditAssignments] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");
  const [confirmArchiveId, setConfirmArchiveId] = useState(null);
  const [confirmArchiveName, setConfirmArchiveName] = useState("");
  const [confirmUnarchiveId, setConfirmUnarchiveId] = useState(null);
  const [confirmUnarchiveName, setConfirmUnarchiveName] = useState("");

  useEffect(() => {
    setTitle(showArchived ? "Archived Spreadsheets" : "Spreadsheets");
  }, [setTitle, showArchived]);

  useEffect(() => {
    if (showArchived && !canViewArchivedSpreadsheets) {
      navigate("/spreadsheet", { replace: true });
    }
  }, [showArchived, canViewArchivedSpreadsheets, navigate]);

  useEffect(() => {
    if (showArchived && !canViewArchivedSpreadsheets) {
      return;
    }
    dispatch(fetchSpreadsheets(showArchived));
  }, [dispatch, showArchived, canViewArchivedSpreadsheets]);

  useEffect(() => {
    let mounted = true;
    const loadUsers = async () => {
      try {
        const res = await getUsers();
        if (!mounted) return;
        const users = Array.isArray(res.data) ? res.data : [];
        setAssignableUsers(users);
      } catch {
        if (mounted) {
          setAssignableUsers([]);
        }
      }
    };
    loadUsers();
    return () => {
      mounted = false;
    };
  }, []);

  const assignableUserOptions = useMemo(
    () =>
      assignableUsers.map((user) => ({
        value: user.id,
        label: `${user.name} (${user.email || user.mobile || user.role_name || "No contact"})`,
      })),
    [assignableUsers]
  );

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
    setFormData({ name: "", description: "", assigned_user_ids: [] });
  };

  const openCreateModal = () => {
    if (!canAddSpreadsheet) {
      return;
    }
    resetForm();
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    resetForm();
  };

  const openEditModal = (spreadsheet) => {
    if (!canEditSpreadsheet(spreadsheet)) {
      return;
    }

    setEditSpreadsheetId(spreadsheet.id);
    setFormData({
      name: spreadsheet.name || "",
      description: spreadsheet.description || "",
      assigned_user_ids: Array.isArray(spreadsheet.assigned_user_ids)
        ? spreadsheet.assigned_user_ids
        : [],
    });
    const isCreator = Number(spreadsheet.created_by) === Number(currentUser?.id);
    setCanEditAssignments(isDeveloperAdmin || isCreator);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditSpreadsheetId(null);
    setCanEditAssignments(false);
    resetForm();
  };

  const handleSpreadsheetRowClick = (spreadsheetId) => {
    navigate(`/spreadsheet/${spreadsheetId}`);
  };

  const buildPayload = () => {
    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
    };

    if (showCreateModal || canEditAssignments) {
      payload.assigned_user_ids = formData.assigned_user_ids;
    }

    return payload;
  };

  const handleCreateSubmit = async () => {
    if (!canAddSpreadsheet) {
      toast.error("You don't have permission to create spreadsheets.");
      return;
    }

    if (!formData.name.trim()) {
      toast.error("Spreadsheet name is required.");
      return;
    }

    try {
      const action = await dispatch(addSpreadsheet(buildPayload()));

      if (action.type.endsWith("fulfilled")) {
        closeCreateModal();
        dispatch(fetchSpreadsheets(showArchived));
      }
    } catch (error) {
      toast.error("Failed to create spreadsheet");
    }
  };

  const handleEditSubmit = async () => {
    const spreadsheet = spreadsheets.find((item) => item.id === editSpreadsheetId);

    if (!spreadsheet || !canEditSpreadsheet(spreadsheet)) {
      toast.error("You don't have permission to edit this spreadsheet.");
      return;
    }

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

  const handleTogglePin = async (event, spreadsheet) => {
    event.stopPropagation();
    const action = spreadsheet.is_pinned
      ? unpinSpreadsheetById(spreadsheet.id)
      : pinSpreadsheetById(spreadsheet.id);
    await dispatch(action);
  };

  const handleConfirmArchive = async () => {
    if (!canArchiveSpreadsheet) {
      toast.error("You don't have permission to archive spreadsheets.");
      return;
    }
    const result = await dispatch(archiveSpreadsheetById(confirmArchiveId));
    if (archiveSpreadsheetById.fulfilled.match(result)) {
      setConfirmArchiveId(null);
      setConfirmArchiveName("");
    }
  };

  const handleConfirmUnarchive = async () => {
    if (!canArchiveSpreadsheet) {
      toast.error("You don't have permission to restore spreadsheets.");
      return;
    }
    const result = await dispatch(unarchiveSpreadsheetById(confirmUnarchiveId));
    if (unarchiveSpreadsheetById.fulfilled.match(result)) {
      setConfirmUnarchiveId(null);
      setConfirmUnarchiveName("");
    }
  };

  const columnCount = showArchived ? 9 : 7;

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
        {(showCreateModal || canEditAssignments) && (
          <div className="form-group">
            <label>Assign Users</label>
            <SingleSearchSelect
              className="search-selector"
              options={assignableUserOptions}
              value={formData.assigned_user_ids}
              onChange={(values) =>
                setFormData({
                  ...formData,
                  assigned_user_ids: (values || []).filter(
                    (id) => Number.isInteger(id) && id > 0
                  ),
                })
              }
              placeholder="Select users..."
              isMulti
              disabled={saving}
            />
          </div>
        )}
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
              <div className="add-action-buttons">
                {canAddSpreadsheet && !showArchived && (
                  <button className="btn" type="button" onClick={openCreateModal}>
                    New Spreadsheet
                  </button>
                )}
                {(canViewArchivedSpreadsheets || showArchived) && (
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      navigate(
                        showArchived ? "/spreadsheet" : "/spreadsheet/archived"
                      )
                    }
                  >
                    {showArchived ? "Active Sheets" : "Archived Sheets"}
                  </button>
                )}
              </div>
            ),
            header: (
              <tr>
                <th style={{ width: "52px" }}>ID</th>
                <th style={{ width: "250px" }}>Name</th>
                <th>Description</th>
                <th style={{ width: "160px" }}>Created By</th>
                <th style={{ width: "180px" }}>Created At</th>
                <th style={{ width: "180px" }}>Updated At</th>
                {showArchived && (
                  <th style={{ width: "160px" }}>Archived By</th>
                )}
                {showArchived && (
                  <th style={{ width: "180px" }}>Archived At</th>
                )}
                <th style={{ width: "240px", textAlign: "center" }}>Action</th>
              </tr>
            ),
            rows:
              spreadsheets.length === 0
                ? [
                    <tr key="empty">
                      <td colSpan={columnCount} className="text-center">
                        {showArchived
                          ? "No archived spreadsheets"
                          : "No spreadsheets found"}
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
                      <td>{spreadsheet.created_by_name || "-"}</td>
                      <td>{formatDate(spreadsheet.created_at)}</td>
                      <td>{formatDate(spreadsheet.updated_at)}</td>
                      {showArchived && (
                        <td>{spreadsheet.archived_by_name || "-"}</td>
                      )}
                      {showArchived && (
                        <td>{formatDate(spreadsheet.archived_at)}</td>
                      )}
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <button
                          className="action-icons line-action-icon tooltip-link"
                          type="button"
                          title={
                            spreadsheet.is_pinned
                              ? "Unpin this sheet"
                              : "Pin this sheet"
                          }
                          onClick={(event) => handleTogglePin(event, spreadsheet)}
                        >
                          <PinIcon
                            color={
                              spreadsheet.is_pinned
                                ? PINNED_ICON_COLOR
                                : "currentColor"
                            }
                            filled={Boolean(spreadsheet.is_pinned)}
                          />
                        </button>
                        {canArchiveSpreadsheet &&
                          (showArchived ? (
                            <button
                              className="action-icons line-action-icon tooltip-link"
                              type="button"
                              title="Restore this sheet"
                              onClick={(event) => {
                                event.stopPropagation();
                                setConfirmUnarchiveId(spreadsheet.id);
                                setConfirmUnarchiveName(spreadsheet.name);
                              }}
                            >
                              <ArchiveIcon color={PINNED_ICON_COLOR} />
                            </button>
                          ) : (
                            <button
                              className="action-icons line-action-icon tooltip-link"
                              type="button"
                              title="Archive this sheet"
                              onClick={(event) => {
                                event.stopPropagation();
                                setConfirmArchiveId(spreadsheet.id);
                                setConfirmArchiveName(spreadsheet.name);
                              }}
                            >
                              <ArchiveIcon />
                            </button>
                          ))}
                        {canEditSpreadsheet(spreadsheet) && (
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

      {canArchiveSpreadsheet && confirmArchiveId && (
        <ConfirmationModal
          title="Archive Spreadsheet"
          message={`Archive <span class="danger">${confirmArchiveName}</span> for everyone?`}
          onConfirm={handleConfirmArchive}
          onCancel={() => {
            setConfirmArchiveId(null);
            setConfirmArchiveName("");
          }}
        />
      )}

      {canArchiveSpreadsheet && confirmUnarchiveId && (
        <ConfirmationModal
          title="Restore Spreadsheet"
          message={`Restore <span class="danger">${confirmUnarchiveName}</span> to the active list?`}
          onConfirm={handleConfirmUnarchive}
          onCancel={() => {
            setConfirmUnarchiveId(null);
            setConfirmUnarchiveName("");
          }}
        />
      )}
    </div>
  );
}

export default Spreadsheets;
