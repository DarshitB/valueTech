import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchSpreadsheets,
  addSpreadsheet,
} from "../../redux/reducers/spreadsheetReducer";
import CustomDataTable from "../../components/CustomDataTable";
import FormModel from "../../components/FormModel";
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

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "" });

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

  const handleSpreadsheetRowClick = (spreadsheetId) => {
    navigate(`/spreadsheet/${spreadsheetId}`);
  };

  const handleCreateSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Spreadsheet name is required.");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
    };

    try {
      const action = await dispatch(addSpreadsheet(payload));

      if (action.type.endsWith("fulfilled")) {
        closeCreateModal();
        dispatch(fetchSpreadsheets());
      }
    } catch (error) {
      toast.error("Failed to create spreadsheet");
    }
  };

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
              </tr>
            ),
            rows:
              spreadsheets.length === 0
                ? [
                    <tr key="empty">
                      <td colSpan={5} className="text-center">
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
                  </tr>
                )),
          }}
        </CustomDataTable>
      )}

      {showCreateModal && (
        <FormModel>
          {{
            title: "New Spreadsheet",
            body: (
              <form
                className="body-form-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateSubmit();
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
                    <button
                      className="submit-button"
                      type="submit"
                      disabled={saving}
                    >
                      {saving ? "Creating..." : "Create"}
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: closeCreateModal,
          }}
        </FormModel>
      )}
    </div>
  );
}

export default Spreadsheets;
