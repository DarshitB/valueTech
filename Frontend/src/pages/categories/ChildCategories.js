import React, { useEffect, useLayoutEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchChildCategories,
  addChildCategory,
  editChildCategory,
  removeChildCategory,
} from "../../redux/reducers/childCategoryReducer";
import { fetchSubCategoryById } from "../../redux/reducers/subcategoryReducer";
import { fetchOrders } from "../../redux/reducers/orderReducer";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { toast } from "react-toastify";

import CustomDataTable from "../../components/CustomDataTable";
import FormModel from "../../components/FormModel";
import ConfirmationModal from "../../components/ConfirmationModal";
import { DeleteIcon, EditIcon } from "../../components/icons";
import { usePageTitle } from "../../context/PageTitleContext";
import "./ChildCategories.scss";
import axios from "../../api/axios";

function ChildCategories() {
  const { subCategoryId, categoryId } = useParams(); // Get both IDs from URL
  const dispatch = useDispatch();
  const { setTitle } = usePageTitle();

  const allowedPermissions = useSelector(selectPermissions);
  const { list: allChildCategories, loading } = useSelector(
    (state) => state.childCategories || {}
  );

  // Get orders from Redux store
  const { list: orders } = useSelector((state) => state.orders);

  // Filter child categories by subcategory ID
  const childCategories = allChildCategories.filter(
    (child) => child.sub_category_id === parseInt(subCategoryId)
  );
  /* console.log("childCategories", childCategories); */

  // Load all child categories
  useEffect(() => {
    dispatch(fetchChildCategories());
    dispatch(fetchOrders());
  }, [dispatch]);

  // Calculate order count per child category
  const childCategoryOrderCounts = useMemo(() => {
    const counts = {};
    if (!orders) return {};

    orders.forEach((order) => {
      if (order.child_category_id) {
        counts[order.child_category_id] = (counts[order.child_category_id] || 0) + 1;
      }
    });
    return counts;
  }, [orders]);

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
  const [formData, setFormData] = useState({ name: "", images: [], existingImages: [] });
  const [isEdit, setIsEdit] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  const openAddModal = () => {
    setIsEdit(false);
    setFormData({ name: "", images: [] });
    setShowFormModal(true);
  };

  const openEditModal = (child) => {
    setIsEdit(true);
    setEditId(child.id);
    setFormData({ 
      name: child.name,
      images: [],
      existingImages: child.images || []
    });
    setShowFormModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Child category name is required.");
      return;
    }

    const formDataToSend = new FormData();
    formDataToSend.append('name', formData.name.trim());
    formDataToSend.append('sub_category_id', subCategoryId);
    
    // Append each image file to formData
    formData.images.forEach((image) => {
      formDataToSend.append('images', image);
    });

    try {
      const action = isEdit
        ? await dispatch(editChildCategory({ id: editId, data: formDataToSend }))
        : await dispatch(addChildCategory(formDataToSend));

      if (action.type.endsWith("fulfilled")) {
        setShowFormModal(false);
        setFormData({ name: "", images: [] });
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
              <button className="btn" onClick={openAddModal}>
                Add Subcategory
              </button>
            ),
            header: (
              <tr>
                <th style={{ width: "55px" }}>ID</th>
                <th style={{ width: "150px" }}>Name</th>
                <th style={{ width: "150px" }}>No. of Orders</th>
                <th style={{ width: "150px" }}>Created By</th>
                <th>Updated By</th>
                <th style={{ width: "200px", textAlign: "center" }}>Action</th>
              </tr>
            ),
            rows: childCategories.map((child, index) => (
              <tr key={child.id}>
                <td className="sequential-number">{index + 1}</td>
                <td>{child.name}</td>
                <td>{childCategoryOrderCounts[child.id] || 0}</td>
                <td>{child.created_by}</td>
                <td>{child.updated_by || "-"}</td>
                <td style={{ textAlign: "center" }}>
                  {hasPermission(allowedPermissions, "edit_child_category") && (
                    <button
                      className="action-icons"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(child);
                      }}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(child.id, child.name);
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
                {isEdit && formData.existingImages.length > 0 && (
                  <div className="form-group">
                    <label>Existing Images</label>
                    <div className="existing-images-container">
                      {formData.existingImages.map((img, index) => (
                        <img
                          key={img.id || index}
                          src={`${axios.defaults.baseURL}${img.image_url}`}
                          alt={`Child category ${index + 1}`}
                          className="existing-image"
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="childCategoryImages">Upload Images</label>
                  <input
                    type="file"
                    className="form-field"
                    id="childCategoryImages"
                    multiple
                    accept="image/*"
                    onChange={(e) =>
                      setFormData({ ...formData, images: Array.from(e.target.files) })
                    }
                  />
                 {/*  <small className="text-gray-500">You can select multiple images</small> */}
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
              setFormData({ name: "", images: [] });
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
