import React, { useEffect, useLayoutEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchSubCategories,
  addSubCategory,
  editSubCategory,
  removeSubCategory,
} from "../../redux/reducers/subcategoryReducer";
import { fetchCategoryById } from "../../redux/reducers/categoryReducer";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { toast } from "react-toastify";

import CustomDataTable from "../../components/CustomDataTable";
import FormModel from "../../components/FormModel";
import ConfirmationModal from "../../components/ConfirmationModal";
import { DeleteIcon, EditIcon } from "../../components/icons";
import { usePageTitle } from "../../context/PageTitleContext";

function SubCategories() {
  const { id } = useParams(); // category ID from URL
  const dispatch = useDispatch();
  const { setTitle } = usePageTitle();

  const allowedPermissions = useSelector(selectPermissions);
  const { list: allSubCategories, loading } = useSelector(
    (state) => state.subcategories
  );

  const subcategories = allSubCategories.filter(
    (sub) => sub.category_id === parseInt(id)
  );

  // Load all subcategories and current category
  useEffect(() => {
    dispatch(fetchSubCategories());
  }, [dispatch]);

  useLayoutEffect(() => {
    dispatch(fetchCategoryById(id)).then((res) => {
      const category = res.payload;
      setTitle(
        <>
          <Link to="/categories" className="text-blue-600 hover:underline">
            Categories
          </Link>{" "}
          &gt; {category.name}
        </>
      );
    });
  }, [id]);

  // Form/modal state
  const [formData, setFormData] = useState({ name: "" });
  const [isEdit, setIsEdit] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  /*   const openAddModal = () => {
    setIsEdit(false);
    setFormData({ name: "" });
    setShowFormModal(true);
  }; */

  const openEditModal = (sub) => {
    setIsEdit(true);
    setEditId(sub.id);
    setFormData({ name: sub.name });
    setShowFormModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Asset Category name is required.");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      category_id: parseInt(id),
    };

    try {
      const action = isEdit
        ? await dispatch(editSubCategory({ id: editId, data: payload }))
        : await dispatch(addSubCategory(payload));

      if (action.type.endsWith("fulfilled")) {
        setShowFormModal(false);
        setFormData({ name: "" });
      }
    } catch (error) {
      toast.error("Failed to submit subcategory");
    }
  };

  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  const handleConfirmDelete = () => {
    dispatch(removeSubCategory(confirmDeleteId));
    setConfirmDeleteId(null);
  };

  return (
    <div className="height-full-occupied">
      {loading ? (
        <p>Loading Asset Categories...</p>
      ) : (
        <CustomDataTable>
          {{
            buttons: hasPermission(allowedPermissions, "add_sub_category") && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit(); // same as before
                }}
                className="add-action-buttons"
              >
                <input
                  type="text"
                  className="input-filed"
                  placeholder="Add asset category"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value.toUpperCase() })
                  }
                />
                <button className="btn" type="submit">
                  Add Asset Category
                </button>
              </form>
            ),
            header: (
              <tr>
                <th style={{ width: "52px" }}>ID</th>
                <th style={{ width: "200px" }}>Name</th>
                <th style={{ width: "150px" }}>Created By</th>
                <th>Updated By</th>
                <th style={{ textAlign: "center", width: "150px" }}>Action</th>
              </tr>
            ),
            rows: subcategories.map((sub, index) => (
              <tr key={sub.id}>
                <td className="sequential-number">{index + 1}</td>
                <td>
                  {hasPermission(allowedPermissions, "view_child_category") ? (
                    <Link
                      className="get-me-inside"
                      to={`/categories/${id}/subcategories/${sub.id}/childcategories`}
                    >
                      {sub.name}
                    </Link>
                  ) : (
                    sub.name
                  )}
                </td>
                <td>{sub.created_by}</td>
                <td>{sub.updated_by || "-"}</td>
                <td style={{ textAlign: "center" }}>
                  {hasPermission(allowedPermissions, "edit_sub_category") && (
                    <button
                      className="action-icons"
                      onClick={() => openEditModal(sub)}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {hasPermission(allowedPermissions, "delete_sub_category") && (
                    <button
                      className="action-icons"
                      onClick={() => confirmDelete(sub.id, sub.name)}
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

      {/* Form Modal */}
      {showFormModal && (
        <FormModel>
          {{
            title: "Edit Asset Category",
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
                    <label htmlFor="subCategoryName">Asset Category Name</label>
                    <input
                      className="form-field"
                      id="subCategoryName"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value.toUpperCase() })
                      }
                    />
                  </div>
                  <div className="form-buttons">
                    <button className="submit-button" type="submit">
                      Update
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => {
              setShowFormModal(false);
              setFormData({ name: "" });
              setIsEdit(false);
              setEditId(null);
            },
          }}
        </FormModel>
      )}

      {/* Delete Confirm Modal */}
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

export default SubCategories;
