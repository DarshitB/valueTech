import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchStates,
  addState,
  editState,
  removeState,
} from "../../redux/reducers/stateReducer";
import CustomDataTable from "../../components/CustomDataTable";
import { DeleteIcon, EditIcon } from "../../components/icons";
import ConfirmationModal from "../../components/ConfirmationModal";
import FormModel from "../../components/FormModel";
import { Link, useNavigate } from "react-router-dom";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { toast } from "react-toastify";

function States() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  /* get logged user permission */
  const allowedPermissions = useSelector(selectPermissions);

  const { list: data, loading } = useSelector((state) => state.states);

  /* ==== useState ==== */
  // for adding the states
  const [newStateName, setNewStateName] = useState("");
  // for edit the states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editStateId, setEditStateId] = useState(null);
  const [editStateName, setEditStateName] = useState("");
  // for deleting the states
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState(null);

  // Fetch states on mount
  useEffect(() => {
    dispatch(fetchStates());
  }, [dispatch]);

  // Handle Add
  const handleAdd = () => {
    if (!newStateName.trim()) return;
    dispatch(addState({ name: newStateName }));
    setNewStateName(""); // clear field
  };

  // Show confirmation before delete
  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  // Actually delete after confirmation
  const handleConfirmDelete = () => {
    dispatch(removeState(confirmDeleteId));
    setConfirmDeleteId(null);
  };

  // Prepare to edit a state
  const openEditModal = (id, name) => {
    setEditStateId(id);
    setEditStateName(name);
    setShowEditModal(true);
  };

  // Submit the edited state
  const handleEditSubmit = async () => {
    if (!editStateName.trim()) return;

    /* dispatch(editState({ id: editStateId, data: { name: editStateName } }));
    setShowEditModal(false);
    setEditStateId(null);
    setEditStateName(""); */

    try {
      const action = await dispatch(
        editState({ id: editStateId, data: { name: editStateName } })
      );

      if (action.type.endsWith("fulfilled")) {
        // ✅ Close modal on success only
        setShowEditModal(false);
        setEditStateId(null);
        setEditStateName("");
      }
    } catch (error) {
      toast.error("Failed to submit state");
    }
  };
  return (
    <div className="height-full-occupied state-data-container">
      {loading ? (
        <p>Loading...</p>
      ) : (
        <CustomDataTable>
          {{
            buttons: (
              <div className="add-action-buttons">
                {hasPermission(allowedPermissions, "add_state") && (
                  <>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault(); // prevent page reload
                        handleAdd();
                      }}
                      className="add-action-buttons"
                    >
                      <input
                        type="text"
                        className="input-filed"
                        name="state_name"
                        placeholder="Add state"
                        value={newStateName}
                        onChange={(e) =>
                          setNewStateName(e.target.value.toUpperCase())
                        }
                      />
                      <button className="btn" type="submit">
                        Add State
                      </button>
                    </form>
                  </>
                )}
              </div>
            ),

            header: (
              <tr>
                <th style={{ width: "55px" }}>ID</th>
                <th style={{ width: "150px" }}>Name</th>
                <th style={{ width: "150px" }}>Created By</th>
                <th>Updated By</th>
                <th style={{ width: "200px", textAlign: "center" }}>Action</th>
              </tr>
            ),

            rows: data.map((item, index) => (
              <tr
                key={item.id}
                onClick={() => {
                  if (
                    hasPermission(allowedPermissions, "view_child_category")
                  ) {
                    navigate(`/states/${item.id}/cities`);
                  }
                }}
                style={{
                  cursor: hasPermission(
                    allowedPermissions,
                    "view_order_details"
                  )
                    ? "pointer"
                    : "default",
                }}
              >
                <td className="sequential-number">{index + 1}</td>
                <td
                  className={
                    hasPermission(allowedPermissions, "view_order_details")
                      ? "get-me-inside"
                      : ""
                  }
                >
                  {item.name}
                </td>
                <td>{item.created_by}</td>
                <td>{item.updated_by || "-"}</td>
                <td style={{ textAlign: "center" }}>
                  {hasPermission(allowedPermissions, "edit_state") && (
                    <button
                      className="action-icons"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(item.id, item.name);
                      }}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {hasPermission(allowedPermissions, "delete_state") && (
                    <button
                      className="action-icons"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(item.id, item.name);
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

      {/* Edit Modal */}
      {showEditModal && (
        <FormModel>
          {{
            title: "Edit State",
            body: (
              <form
                className="body-form-box"
                onSubmit={(e) => {
                  e.preventDefault(); // prevent full page reload
                  handleEditSubmit();
                }}
              >
                <div className="body-form-box">
                  <div className="form-group">
                    <label htmlFor="state_input">State</label>
                    <input
                      type="text"
                      className="form-field"
                      name="stateName"
                      id="state_input"
                      value={editStateName}
                      onChange={(e) =>
                        setEditStateName(e.target.value.toUpperCase())
                      }
                    />
                  </div>
                  <div className="form-buttons">
                    <button className="submit-button" type="submit">
                      Save
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => {
              setShowEditModal(false);
              setEditStateId(null);
              setEditStateName("");
            },
          }}
        </FormModel>
      )}

      {/* Delete Confirmation */}
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

export default States;
