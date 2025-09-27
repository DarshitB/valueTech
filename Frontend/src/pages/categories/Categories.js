import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchCategories,
  addCategory,
  editCategory,
  removeCategory,
} from "../../redux/reducers/categoryReducer";
import CustomDataTable from "../../components/CustomDataTable";
import { DeleteIcon, EditIcon } from "../../components/icons";
import ConfirmationModal from "../../components/ConfirmationModal";
import FormModel from "../../components/FormModel";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { usePageTitle } from "../../context/PageTitleContext";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";

function Categories() {
  const dispatch = useDispatch();
  const { setTitle } = usePageTitle();

  // Set page title
  useEffect(() => {
    setTitle("Categories");
  }, []);

  // Get categories from Redux store
  const { list: categories, loading } = useSelector(
    (state) => state.categories
  );

  // Get logged-in user's permissions
  const allowedPermissions = useSelector(selectPermissions);

  // State for adding a category
  const [newCategoryName, setNewCategoryName] = useState("");

  // State for editing
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCategoryId, setEditCategoryId] = useState(null);
  const [editCategoryName, setEditCategoryName] = useState("");

  // State for delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState(null);

  // Fetch all categories on component mount
  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  // ➕ Handle Add
  const handleAdd = () => {
    if (!newCategoryName.trim()) return;
    dispatch(addCategory({ name: newCategoryName }));
    setNewCategoryName("");
  };

  // 🛠️ Open Edit Modal
  const openEditModal = (id, name) => {
    setEditCategoryId(id);
    setEditCategoryName(name);
    setShowEditModal(true);
  };

  // ✅ Submit Edit
  const handleEditSubmit = async () => {
    if (!editCategoryName.trim()) return;
    try {
      const result = await dispatch(
        editCategory({
          id: editCategoryId,
          data: { name: editCategoryName },
        })
      );

      // Check if the editCategory thunk was successful
      if (editCategory.fulfilled.match(result)) {
        // Success: close modal and reset states
        setShowEditModal(false);
        setEditCategoryId(null);
        setEditCategoryName("");
      }
    } catch (error) {
      toast.error("Failed to submit category");
      /* console.error("Unexpected error:", error); */
    }
  };

  // ❓ Confirm Delete
  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  // 🗑️ Handle Delete
  const handleConfirmDelete = () => {
    dispatch(removeCategory(confirmDeleteId));
    setConfirmDeleteId(null);
  };

  return (
    <div className="height-full-occupied category-data-container">
      {/* ⏳ Loading fallback */}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <CustomDataTable>
          {{
            // ➕ Add Category UI (only if permission is granted)
            buttons: (
              <div className="add-action-buttons">
                {hasPermission(allowedPermissions, "add_category") && (
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
                        placeholder="Add category"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value.toUpperCase())}
                      />
                      <button className="btn" type="submit">
                        Add Category
                      </button>
                    </form>
                  </>
                )}
              </div>
            ),

            // 🧾 Table Header
            header: (
              <tr>
                <th style={{ width: "55px" }}>ID</th>
                <th style={{ width: "225px" }}>Name</th>
                <th style={{ width: "150px" }}>Created By</th>
                <th>Updated By</th>
                <th style={{ width: "200px", textAlign: "center" }}>Action</th>
              </tr>
            ),

            // 📄 Table Rows
            rows: categories.map((item, index) => (
              <tr key={item.id}>
                <td className="sequential-number">{index + 1}</td>
                <td>
                  {hasPermission(allowedPermissions, "view_sub_category") ? (
                    <Link
                      className="get-me-inside"
                      to={`/categories/${item.id}/subcategories`}
                    >
                      {item.name}
                    </Link>
                  ) : (
                    item.name
                  )}
                </td>
                <td>{item.created_by}</td>
                <td>{item.updated_by || "-"}</td>
                <td style={{ textAlign: "center" }}>
                  {hasPermission(allowedPermissions, "edit_category") && (
                    <button
                      className="action-icons"
                      onClick={() => openEditModal(item.id, item.name)}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {hasPermission(allowedPermissions, "delete_category") && (
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

      {/* 📝 Edit Category Modal */}
      {showEditModal && (
        <FormModel>
          {{
            title: "Edit Category",
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
                    <label htmlFor="category_input">Category</label>
                    <input
                      type="text"
                      className="form-field"
                      id="category_input"
                      value={editCategoryName}
                      onChange={(e) => setEditCategoryName(e.target.value.toUpperCase())}
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
              setEditCategoryId(null);
              setEditCategoryName("");
            },
          }}
        </FormModel>
      )}

      {/* ❗ Confirm Delete Modal */}
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

export default Categories;
