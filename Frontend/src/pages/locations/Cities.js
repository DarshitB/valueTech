import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchCities,
  addCity,
  editCity,
  removeCity,
} from "../../redux/reducers/cityReducer";
import { Link, useParams } from "react-router-dom";
import CustomDataTable from "../../components/CustomDataTable";
import { DeleteIcon, EditIcon } from "../../components/icons";
import ConfirmationModal from "../../components/ConfirmationModal";
import FormModel from "../../components/FormModel";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { usePageTitle } from "../../context/PageTitleContext";
import { fetchStateById } from "../../redux/reducers/stateReducer";
import { toast } from "react-toastify";

function Cities() {
  const { id: stateId } = useParams(); // 📌 current state_id from URL

  // Inside component
  const { setTitle } = usePageTitle();

  const dispatch = useDispatch();

  /* get logged user permission */
  const allowedPermissions = useSelector(selectPermissions);

  const { list: allCities, loading } = useSelector((state) => state.cities);
  const { list: states } = useSelector((state) => state.states);

  //find current state
  const currentState = states.find((b) => b.id === parseInt(stateId));
  // Filter cities for current state
  const cities = useMemo(() => {
    return allCities.filter((city) => city.state_id === parseInt(stateId));
  }, [allCities, stateId]);

  // 🔡 Add
  const [newCityName, setNewCityName] = useState("");

  // 📝 Edit
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCityId, setEditCityId] = useState(null);
  const [editCityName, setEditCityName] = useState("");

  // ❌ Delete
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState(null);

  // Fetch all cities on mount
  useEffect(() => {
    dispatch(fetchCities());
  }, [dispatch]);

  /*   // set page title
  useEffect(() => {
    if (currentState?.name) {
      setTitle(
        <>
          <Link to="/states" className="text-blue-600 hover:underline">
            States
          </Link>{" "}
          &gt; {currentState.name}
        </>
      );
    }
    return () => setTitle(""); // Optional cleanup
  }, [currentState]);
 */
  // set page title
  useLayoutEffect(() => {
    dispatch(fetchStateById(stateId)).then((res) => {
      const state = res.payload;
      setTitle(
        <>
          <Link to="/states" className="text-blue-600 hover:underline">
            States
          </Link>{" "}
          &gt; {state.name}
        </>
      );
    });
  }, [stateId]);

  // ➕ Handle Add
  const handleAdd = () => {
    if (!newCityName.trim()) return;
    dispatch(addCity({ name: newCityName, state_id: parseInt(stateId) }));
    setNewCityName("");
  };

  // 🛠️ Open Edit
  const openEditModal = (id, name) => {
    setEditCityId(id);
    setEditCityName(name);
    setShowEditModal(true);
  };

  // ✅ Submit Edit
  /*  const handleEditSubmit = () => {
    if (!editCityName.trim()) return;
    dispatch(
      editCity({
        id: editCityId,
        data: { name: editCityName, state_id: parseInt(stateId) },
      })
    );
    setShowEditModal(false);
    setEditCityId(null);
    setEditCityName("");
  }; */
  const handleEditSubmit = async () => {
    if (!editCityName.trim()) return;

    try {
      const action = await dispatch(
        editCity({
          id: editCityId,
          data: { name: editCityName, state_id: parseInt(stateId) },
        })
      );

      if (action.type.endsWith("fulfilled")) {
        // ✅ Close modal on success only
        setShowEditModal(false);
        setEditCityId(null);
        setEditCityName("");
      }
    } catch (error) {
      toast.error("Failed to submit city");
    }
  };

  // ❓ Confirm Delete
  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  // 🗑️ Delete
  const handleConfirmDelete = () => {
    dispatch(removeCity(confirmDeleteId));
    setConfirmDeleteId(null);
  };

  return (
    <div className="height-full-occupied city-data-container">
      {loading ? (
        <p>Loading...</p>
      ) : (
        <CustomDataTable>
          {{
            buttons: (
              <div className="add-action-buttons">
                {hasPermission(allowedPermissions, "add_cities") && (
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
                        placeholder="Add city"
                        value={newCityName}
                        onChange={(e) => setNewCityName(e.target.value.toUpperCase())}
                      />
                      <button className="btn" type="submit">
                        Add City
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

            rows: cities.map((item, index) => (
              <tr key={item.id}>
                <td className="sequential-number">{index + 1}</td>
                <td>{item.name}</td>
                <td>{item.created_by}</td>
                <td>{item.updated_by || "-"}</td>
                <td style={{ textAlign: "center" }}>
                  {hasPermission(allowedPermissions, "edit_cities") && (
                    <button
                      className="action-icons"
                      onClick={() => openEditModal(item.id, item.name)}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {hasPermission(allowedPermissions, "delete_cities") && (
                    <button
                      className="action-icons"
                      onClick={() => confirmDelete(item.id, item.name)}
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

      {/* 📝 Edit Modal */}
      {showEditModal && (
        <FormModel>
          {{
            title: "Edit City",
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
                    <label htmlFor="city_input">City</label>
                    <input
                      type="text"
                      className="form-field"
                      id="city_input"
                      value={editCityName}
                      onChange={(e) => setEditCityName(e.target.value.toUpperCase())}
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
              setEditCityId(null);
              setEditCityName("");
            },
          }}
        </FormModel>
      )}

      {/* ❗ Delete Modal */}
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

export default Cities;
