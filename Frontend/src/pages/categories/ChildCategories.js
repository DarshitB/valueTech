import React, { useEffect, useLayoutEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchChildCategories,
  addChildCategory,
  editChildCategory,
  removeChildCategory,
} from "../../redux/reducers/childCategoryReducer";
import { fetchSubCategoryById } from "../../redux/reducers/subcategoryReducer";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { toast } from "react-toastify";

import CustomDataTable from "../../components/CustomDataTable";
import FormModel from "../../components/FormModel";
import ConfirmationModal from "../../components/ConfirmationModal";
import { DeleteIcon, EditIcon } from "../../components/icons";
import { usePageTitle } from "../../context/PageTitleContext";

function ChildCategories() {
  const { subCategoryId, categoryId } = useParams(); // Get both IDs from URL
  const dispatch = useDispatch();
  const { setTitle } = usePageTitle();

  const allowedPermissions = useSelector(selectPermissions);
  const { list: allChildCategories, loading } = useSelector(
    (state) => state.childCategories || {}
  );

  // Filter child categories by subcategory ID
  const childCategories = allChildCategories.filter(
    (child) => child.sub_category_id === parseInt(subCategoryId)
  );
  /* console.log("childCategories", childCategories); */

  // Load all child categories
  useEffect(() => {
    dispatch(fetchChildCategories());
  }, [dispatch]);

  // Set dynamic breadcrumb title
  useLayoutEffect(() => {
    dispatch(fetchSubCategoryById(subCategoryId)).then((res) => {
      const sub = res.payload;
      setTitle(
        <>
          <Link to="/categories" className="text-blue-600 hover:underline">
            Categories
          </Link>{" "}
          &gt;{" "}
          <Link
            to={`/categories/${categoryId}/subcategories`}
            className="text-blue-600 hover:underline"
          >
            {sub?.category_name || "Category"}
          </Link>{" "}
          &gt; {sub.name}
        </>
      );
    });
  }, [subCategoryId, categoryId]);

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

  const openEditModal = (child) => {
    setIsEdit(true);
    setEditId(child.id);
    setFormData({ name: child.name });
    setShowFormModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Child category name is required.");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      sub_category_id: parseInt(subCategoryId),
    };

    try {
      const action = isEdit
        ? await dispatch(editChildCategory({ id: editId, data: payload }))
        : await dispatch(addChildCategory(payload));

      if (action.type.endsWith("fulfilled")) {
        setShowFormModal(false);
        setFormData({ name: "" });
        setIsEdit(false);
        setEditId(null);
      }
    } catch (error) {
      toast.error("Failed to submit child category");
    }
  };

  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  const handleConfirmDelete = () => {
    dispatch(removeChildCategory(confirmDeleteId));
    setConfirmDeleteId(null);
  };

  return (
    <div className="height-full-occupied">
      {loading ? (
        <p>Loading Subcategories...</p>
      ) : (
        <CustomDataTable>
          {{
            buttons: hasPermission(
              allowedPermissions,
              "add_child_category"
            ) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
                className="add-action-buttons"
              >
                <input
                  type="text"
                  className="input-filed"
                  placeholder="Add Subcategory"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value.toUpperCase() })
                  }
                />
                <button className="btn" type="submit">
                  Add Subcategory
                </button>
              </form>
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
            rows: childCategories.map((child) => (
              <tr key={child.id}>
                <td>{child.id}</td>
                <td>{child.name}</td>
                <td>{child.created_by}</td>
                <td>{child.updated_by || "-"}</td>
                <td style={{ textAlign: "center" }}>
                  {hasPermission(allowedPermissions, "edit_child_category") && (
                    <button
                      className="action-icons"
                      onClick={() => openEditModal(child)}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {hasPermission(
                    allowedPermissions,
                    "delete_child_category"
                  ) && (
                    <button
                      className="action-icons"
                      onClick={() => confirmDelete(child.id, child.name)}
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
            title: isEdit ? "Edit Subcategory" : "Add Subcategory",
            body: (
              <form
                className="body-form-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
              >
                <div className="form-group">
                  <label htmlFor="childCategoryName">Subcategory Name</label>
                  <input
                    className="form-field"
                    id="childCategoryName"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value.toUpperCase() })
                    }
                  />
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

export default ChildCategories;
