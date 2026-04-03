import React, { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchCategories,
  addCategory,
  editCategory,
  removeCategory,
} from "../../redux/reducers/categoryReducer";
import { fetchOrders } from "../../redux/reducers/orderReducer";
import { fetchChildCategories } from "../../redux/reducers/childCategoryReducer";
import { fetchSubCategories } from "../../redux/reducers/subcategoryReducer";
import CustomDataTable from "../../components/CustomDataTable";
import { DeleteIcon, EditIcon } from "../../components/icons";
import ConfirmationModal from "../../components/ConfirmationModal";
import FormModel from "../../components/FormModel";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { usePageTitle } from "../../context/PageTitleContext";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

const REPORT_TYPE_OPTIONS = [
  "report_cv",
  "report_ce",
  "report_avr",
  "report_marine",
  "report_machinery",
];

const reportTypeSelectOptions = REPORT_TYPE_OPTIONS.map((opt) => ({
  value: opt,
  label: opt,
}));

function Categories() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { setTitle } = usePageTitle();

  // Set page title
  useEffect(() => {
    setTitle("Categories");
  }, []);

  // Get categories from Redux store
  const { list: categories, loading } = useSelector(
    (state) => state.categories
  );

  // Get orders, child categories, and sub-categories from Redux store
  const { list: orders } = useSelector((state) => state.orders);
  const { list: childCategories } = useSelector(
    (state) => state.childCategories
  );
  const { list: subCategories } = useSelector(
    (state) => state.subcategories
  );

  // Get logged-in user's permissions
  const allowedPermissions = useSelector(selectPermissions);

  // State for adding a category (modal)
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryReportType, setNewCategoryReportType] = useState("");

  // State for editing
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCategoryId, setEditCategoryId] = useState(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryReportType, setEditCategoryReportType] = useState("");

  // State for delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState(null);

  // Fetch all required data on component mount
  useEffect(() => {
    dispatch(fetchCategories());
    dispatch(fetchOrders());
    dispatch(fetchChildCategories());
    dispatch(fetchSubCategories());
  }, [dispatch]);

  // Calculate order count per category
  const categoryOrderCounts = useMemo(() => {
    const counts = {};

    // Create mapping: child_category_id -> sub_category_id
    const childToSubMap = {};
    childCategories.forEach((child) => {
      childToSubMap[child.id] = child.sub_category_id;
    });

    // Create mapping: sub_category_id -> category_id
    const subToCategoryMap = {};
    subCategories.forEach((sub) => {
      subToCategoryMap[sub.id] = sub.category_id;
    });

    // Count orders per category
    orders.forEach((order) => {
      if (order.child_category_id) {
        const subCategoryId = childToSubMap[order.child_category_id];
        if (subCategoryId) {
          const categoryId = subToCategoryMap[subCategoryId];
          if (categoryId) {
            counts[categoryId] = (counts[categoryId] || 0) + 1;
          }
        }
      }
    });

    return counts;
  }, [orders, childCategories, subCategories]);

  // ➕ Handle Add (submit from Add modal)
  const handleAddSubmit = () => {
    if (!newCategoryName.trim()) {
      toast.error("Category name is required");
      return;
    }
    if (!newCategoryReportType.trim()) {
      toast.error("Report type is required");
      return;
    }
    dispatch(addCategory({ name: newCategoryName, report_type: newCategoryReportType }));
    setShowAddModal(false);
    setNewCategoryName("");
    setNewCategoryReportType("");
  };

  // 🛠️ Open Edit Modal
  const openEditModal = (id, name, reportType) => {
    setEditCategoryId(id);
    setEditCategoryName(name);
    setEditCategoryReportType(reportType || "");
    setShowEditModal(true);
  };

  // ✅ Submit Edit
  const handleEditSubmit = async () => {
    if (!editCategoryName.trim()) {
      toast.error("Category name is required");
      return;
    }
    if (!editCategoryReportType.trim()) {
      toast.error("Report type is required");
      return;
    }
    try {
      const data = { name: editCategoryName, report_type: editCategoryReportType };
      const result = await dispatch(
        editCategory({
          id: editCategoryId,
          data,
        })
      );

      // Check if the editCategory thunk was successful
      if (editCategory.fulfilled.match(result)) {
        // Success: close modal and reset states
        setShowEditModal(false);
        setEditCategoryId(null);
        setEditCategoryName("");
        setEditCategoryReportType("");
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
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setShowAddModal(true)}
                  >
                    Add Category
                  </button>
                )}
              </div>
            ),

            // 🧾 Table Header
            header: (
              <tr>
                <th style={{ width: "55px" }}>ID</th>
                <th style={{ width: "225px" }}>Name</th>
                <th style={{ width: "150px" }}>Report Type</th>
                <th style={{ width: "150px" }}>No. of Orders</th>
                <th style={{ width: "150px" }}>Created By</th>
                <th>Updated By</th>
                <th style={{ width: "200px", textAlign: "center" }}>Action</th>
              </tr>
            ),

            // 📄 Table Rows
            rows: categories.map((item, index) => (
              <tr
                key={item.id}
                onClick={() => {
                  if (hasPermission(allowedPermissions, "view_sub_category")) {
                    navigate(`/categories/${item.id}/subcategories`);
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
                <td>{item.report_type || "-"}</td>
                <td>{categoryOrderCounts[item.id] || 0}</td>
                <td>{item.created_by}</td>
                <td>{item.updated_by || "-"}</td>
                <td style={{ textAlign: "center" }}>
                  {hasPermission(allowedPermissions, "edit_category") && (
                    <button
                      className="action-icons"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(item.id, item.name, item.report_type);
                      }}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {hasPermission(allowedPermissions, "delete_category") && (
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

      {/* ➕ Add Category Modal */}
      {showAddModal && (
        <FormModel>
          {{
            title: "Add Category",
            body: (
              <form
                className="body-form-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddSubmit();
                }}
              >
                <div className="body-form-box">
                  <div className="form-group">
                    <label htmlFor="add_category_input">Category</label>
                    <input
                      type="text"
                      className="form-field"
                      id="add_category_input"
                      value={newCategoryName}
                      onChange={(e) =>
                        setNewCategoryName(e.target.value.toUpperCase())
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="add_report_type_select">Report Type</label>
                    <SingleSearchSelect
                      id="add_report_type_select"
                      className="search-selector"
                      options={reportTypeSelectOptions}
                      value={newCategoryReportType || null}
                      onChange={(val) =>
                        setNewCategoryReportType(val ?? "")
                      }
                      placeholder="Select report type"
                      required
                    />
                  </div>
                  <div className="form-buttons">
                    <button className="submit-button" type="submit">
                      Add Category
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => {
              setShowAddModal(false);
              setNewCategoryName("");
              setNewCategoryReportType("");
            },
          }}
        </FormModel>
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
                      onChange={(e) =>
                        setEditCategoryName(e.target.value.toUpperCase())
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="edit_report_type_select">Report Type</label>
                    <SingleSearchSelect
                      id="edit_report_type_select"
                      className="search-selector"
                      options={reportTypeSelectOptions}
                      value={editCategoryReportType || null}
                      onChange={(val) =>
                        setEditCategoryReportType(val ?? "")
                      }
                      placeholder="Select report type"
                      required
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
              setEditCategoryReportType("");
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
