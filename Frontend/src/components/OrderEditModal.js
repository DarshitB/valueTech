import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toast } from "react-toastify";
import FormModel from "./FormModel";
import SingleSearchSelect from "./SingleSearchSelect";
import { editOrder } from "../redux/reducers/orderReducer";
import { fetchUsers } from "../redux/reducers/userReducer";
import { fetchOfficers } from "../redux/reducers/officerReducer";
import {
  fetchChildCategories,
  fetchChildCategoriesByCategoryName,
} from "../redux/reducers/childCategoryReducer";
import { fetchFieldVerifiers } from "../redux/reducers/fieldVerifierReducer";
import { selectPermissions } from "../redux/selectors/authSelectors";
import { hasPermission } from "../utils/permissionUtils";
import { searchOrdersByRegistration } from "../api/order.api";
import { useUppercaseField } from "../utils/useUppercaseField";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const emptyForm = () => ({
  customer_name: "",
  customer_name_2: "",
  contact: "",
  alternative_contact: "",
  supervisor_number: "",
  driver_number: "",
  child_category_id: "",
  registration_number: "",
  place_of_inspection: "",
  officer_id: null,
  manager_id: null,
  field_verifier_id: null,
  created_at: null,
});

function formatMatchDate(dateString) {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";
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
}

/**
 * Edit-order modal matching Orders list edit form/behavior.
 * Props: order, isOpen, onClose, onSuccess?
 */
export default function OrderEditModal({ order, isOpen, onClose, onSuccess }) {
  const dispatch = useDispatch();
  const allowedPermissions = useSelector(selectPermissions);
  const currentUser = useSelector((state) => state.auth.user);
  const { list: officers } = useSelector((state) => state.officers);
  const { list: allChildCategories } = useSelector(
    (state) => state.childCategories
  );
  const { list: fieldVerifiers } = useSelector((state) => state.fieldVerifier);
  const { list: users } = useSelector((state) => state.users);

  const [formData, setFormData] = useState(emptyForm);
  const [filteredChildCategories, setFilteredChildCategories] = useState([]);
  const [registrationMatches, setRegistrationMatches] = useState([]);
  const [showRegistrationMatchModal, setShowRegistrationMatchModal] =
    useState(false);
  const [submitting, setSubmitting] = useState(false);
  const registrationSearchSeq = useRef(0);
  const {
    inputRef: registrationInputRef,
    applyUppercaseChange: applyRegistrationUppercase,
  } = useUppercaseField(formData.registration_number);

  const isTelecaller = currentUser?.role?.name
    ?.toUpperCase()
    .includes("TELECALLER");
  const isBankOfficer = currentUser?.role?.name
    ?.toUpperCase()
    .includes("BANK OFFICER");
  const isManager = currentUser?.role?.name?.toUpperCase().includes("MANAGER");
  const isSuperAdmin = currentUser?.role?.name
    ?.toUpperCase()
    .includes("SUPER ADMIN");

  const bankOfficers = useMemo(
    () =>
      (officers || []).filter(
        (officer) =>
          officer.role_name?.toUpperCase().includes("BANK OFFICER") ||
          officer.role_name?.toUpperCase().includes("BANK AUTHORITY") ||
          officer.role_name?.toUpperCase().includes("CREDIT HEAD")
      ),
    [officers]
  );

  const managers = useMemo(
    () =>
      (users || []).filter((user) =>
        String(user.role_name || "")
          .toUpperCase()
          .includes("MANAGER")
      ),
    [users]
  );

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear - 10; y <= currentYear + 10; y += 1) {
      years.push(y);
    }
    return years;
  }, []);

  const renderDatePickerHeader = ({
    date,
    changeYear,
    changeMonth,
    decreaseMonth,
    increaseMonth,
  }) => (
    <div className="dp-header">
      <button
        type="button"
        className="dp-nav dp-prev"
        onClick={decreaseMonth}
        aria-label="Previous Month"
      >
        ‹
      </button>
      <div className="dp-month-year">
        <select
          value={date.getFullYear()}
          onChange={(e) => changeYear(Number(e.target.value))}
          aria-label="Select year"
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select
          value={date.getMonth()}
          onChange={(e) => changeMonth(Number(e.target.value))}
          aria-label="Select month"
        >
          {MONTH_NAMES.map((month, idx) => (
            <option key={month} value={idx}>
              {month}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="dp-nav dp-next"
        onClick={increaseMonth}
        aria-label="Next Month"
      >
        ›
      </button>
    </div>
  );

  useEffect(() => {
    if (!isOpen) return;
    if (!allChildCategories || allChildCategories.length === 0) {
      dispatch(fetchChildCategories());
    }
    if (!fieldVerifiers || fieldVerifiers.length === 0) {
      dispatch(fetchFieldVerifiers());
    }
    if (!users || users.length === 0) {
      dispatch(fetchUsers());
    }
    if (!officers || officers.length === 0) {
      dispatch(fetchOfficers());
    }
  }, [
    isOpen,
    dispatch,
    allChildCategories,
    fieldVerifiers,
    users,
    officers,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    if (isBankOfficer && officers.length > 0) {
      const currentOfficer = officers.find(
        (officer) =>
          officer.user_id === currentUser?.id ||
          officer.name === currentUser?.name ||
          officer.email === currentUser?.email
      );
      if (currentOfficer?.departments?.length > 0) {
        const categoryNames = currentOfficer.departments
          .map((dept) => dept.name)
          .join(",");
        dispatch(fetchChildCategoriesByCategoryName({ categoryNames }))
          .unwrap()
          .then((data) => setFilteredChildCategories(data))
          .catch(() => setFilteredChildCategories([]));
      } else {
        setFilteredChildCategories(allChildCategories || []);
      }
    } else {
      setFilteredChildCategories(allChildCategories || []);
    }
  }, [
    isOpen,
    isBankOfficer,
    currentUser,
    officers,
    allChildCategories,
    dispatch,
  ]);

  const resetRegistrationMatchState = useCallback(() => {
    registrationSearchSeq.current += 1;
    setRegistrationMatches([]);
    setShowRegistrationMatchModal(false);
  }, []);

  const searchRegistrationMatches = useCallback(
    async (rawValue, { excludeOrderId = null, openModal = false } = {}) => {
      const value = String(rawValue || "").trim();
      if (!value) {
        setRegistrationMatches([]);
        setShowRegistrationMatchModal(false);
        return;
      }
      const excludeId = excludeOrderId ?? order?.id;
      const seq = ++registrationSearchSeq.current;
      try {
        const response = await searchOrdersByRegistration(value);
        if (seq !== registrationSearchSeq.current) return;
        const list = (
          Array.isArray(response?.data?.data) ? response.data.data : []
        ).filter((row) => Number(row.id) !== Number(excludeId));
        setRegistrationMatches(list);
        setShowRegistrationMatchModal(openModal && list.length > 0);
      } catch {
        if (seq !== registrationSearchSeq.current) return;
        setRegistrationMatches([]);
        setShowRegistrationMatchModal(false);
      }
    },
    [order?.id]
  );

  useEffect(() => {
    if (!isOpen || !order) return;
    resetRegistrationMatchState();
    setFormData({
      customer_name: order.customer_name || "",
      customer_name_2: order.customer_name_2 || "",
      contact: order.contact || "",
      alternative_contact: order.alternative_contact || "",
      supervisor_number: order.supervisor_number || "",
      driver_number: order.driver_number || "",
      child_category_id: order.child_category_id || "",
      registration_number: order.registration_number || "",
      place_of_inspection: order.place_of_inspection || "",
      officer_id: order.officer_id || null,
      manager_id: order.manager_id || null,
      field_verifier_id: order.field_verifier_id || null,
      created_at: order.created_at ? new Date(order.created_at) : null,
    });
    searchRegistrationMatches(order.registration_number, {
      excludeOrderId: order.id,
      openModal: false,
    });
  }, [isOpen, order, resetRegistrationMatchState, searchRegistrationMatches]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    resetRegistrationMatchState();
    setFormData(emptyForm());
    onClose?.();
  }, [submitting, resetRegistrationMatchState, onClose]);

  const handleSubmit = async () => {
    if (!order?.id || submitting) return;

    if (!formData.customer_name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!formData.contact.trim()) {
      toast.error("Contact number is required.");
      return;
    }

    const payload = {
      customer_name: formData.customer_name.trim(),
      contact: formData.contact.trim(),
    };

    if (formData.customer_name_2 !== (order.customer_name_2 || "")) {
      payload.customer_name_2 = formData.customer_name_2.trim() || null;
    }
    if (formData.alternative_contact !== (order.alternative_contact || "")) {
      payload.alternative_contact =
        formData.alternative_contact.trim() || null;
    }
    if (formData.supervisor_number !== (order.supervisor_number || "")) {
      payload.supervisor_number = formData.supervisor_number.trim() || null;
    }
    if (formData.driver_number !== (order.driver_number || "")) {
      payload.driver_number = formData.driver_number.trim() || null;
    }
    if (formData.child_category_id !== (order.child_category_id || "")) {
      payload.child_category_id = formData.child_category_id;
    }
    if (formData.registration_number !== (order.registration_number || "")) {
      payload.registration_number =
        formData.registration_number.trim() || null;
    }
    if (formData.place_of_inspection !== (order.place_of_inspection || "")) {
      payload.place_of_inspection =
        formData.place_of_inspection.trim() || null;
    }

    if (
      hasPermission(allowedPermissions, "edit_order_created_at") &&
      formData.created_at
    ) {
      const currentCreatedAt = order.created_at
        ? new Date(order.created_at)
        : null;
      const newCreatedAt = formData.created_at;
      if (
        !currentCreatedAt ||
        currentCreatedAt.getTime() !== newCreatedAt.getTime()
      ) {
        payload.created_at = newCreatedAt.toISOString();
      }
    }

    let newOfficerId = null;
    let newManagerId = null;
    let newFieldVerifierId = null;

    if (isBankOfficer) {
      const currentOfficer = officers.find(
        (officer) => officer.user_id === currentUser?.id
      );
      if (currentOfficer) newOfficerId = currentOfficer.id;
    } else if (
      hasPermission(allowedPermissions, "view_order_add_edit_officer_filed")
    ) {
      newOfficerId = formData.officer_id;
    }

    if (isManager) {
      newManagerId = currentUser?.id;
      if (newManagerId) newFieldVerifierId = formData.field_verifier_id;
    } else if (
      hasPermission(allowedPermissions, "view_order_add_edit_manager_filed")
    ) {
      newManagerId = formData.manager_id;
      if (formData.manager_id) {
        newFieldVerifierId = formData.field_verifier_id;
      }
    }

    if (isSuperAdmin && formData.field_verifier_id) {
      newFieldVerifierId = formData.field_verifier_id;
    }

    if (newOfficerId !== (order.officer_id || null)) {
      payload.officer_id = newOfficerId;
    }
    if (newManagerId !== (order.manager_id || null)) {
      payload.manager_id = newManagerId;
    }
    if (newFieldVerifierId !== (order.field_verifier_id || null)) {
      payload.field_verifier_id = newFieldVerifierId;
    }

    setSubmitting(true);
    try {
      await dispatch(editOrder({ id: order.id, data: payload })).unwrap();
      resetRegistrationMatchState();
      onSuccess?.(payload);
      onClose?.();
    } catch (_) {
      /* toast handled in reducer */
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !order) return null;

  return (
    <>
      <FormModel>
        {{
          title: `Edit Order - ${order.order_number || "N/A"}`,
          body: (
            <form
              className="body-form-box"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <div className="body-form-box">
                <div className="form-group-row">
                  <div className="form-group">
                    <label htmlFor="detailsEditNameField">
                      Contact Person Name *
                    </label>
                    <input
                      className="form-field"
                      id="detailsEditNameField"
                      value={formData.customer_name}
                      onChange={(e) => {
                        if (!isTelecaller) {
                          setFormData({
                            ...formData,
                            customer_name: e.target.value.toUpperCase(),
                          });
                        }
                      }}
                      disabled={isTelecaller || submitting}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="detailsEditCustomerName2">
                      Customer Name
                    </label>
                    <input
                      className="form-field"
                      id="detailsEditCustomerName2"
                      value={formData.customer_name_2}
                      onChange={(e) => {
                        if (!isTelecaller) {
                          setFormData({
                            ...formData,
                            customer_name_2: e.target.value.toUpperCase(),
                          });
                        }
                      }}
                      disabled={isTelecaller || submitting}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="form-group-row">
                  <div className="form-group">
                    <label htmlFor="detailsEditContact">Contact Number *</label>
                    <input
                      className="form-field"
                      id="detailsEditContact"
                      value={formData.contact}
                      inputMode="numeric"
                      maxLength={10}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (/^\d*$/.test(value)) {
                          setFormData({ ...formData, contact: value });
                        }
                      }}
                      disabled={submitting}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="detailsEditAltContact">
                      Alternative Contact Number
                    </label>
                    <input
                      className="form-field"
                      id="detailsEditAltContact"
                      value={formData.alternative_contact}
                      inputMode="numeric"
                      maxLength={10}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (/^\d*$/.test(value)) {
                          setFormData({
                            ...formData,
                            alternative_contact: value,
                          });
                        }
                      }}
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="form-group-row">
                  <div className="form-group">
                    <label htmlFor="detailsEditSupervisor">
                      Supervisor Number
                    </label>
                    <input
                      className="form-field"
                      id="detailsEditSupervisor"
                      value={formData.supervisor_number}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          supervisor_number: e.target.value,
                        })
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="detailsEditDriver">Driver Number</label>
                    <input
                      className="form-field"
                      id="detailsEditDriver"
                      value={formData.driver_number}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          driver_number: e.target.value,
                        })
                      }
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="detailsEditRegistration">
                    Registration Number
                  </label>
                  <div className="registration-number-row">
                    <input
                      className="form-field"
                      id="detailsEditRegistration"
                      ref={registrationInputRef}
                      value={formData.registration_number}
                      onChange={(e) => {
                        if (isTelecaller) return;
                        applyRegistrationUppercase(e, (registration_number) => {
                          setFormData((prev) => ({
                            ...prev,
                            registration_number,
                          }));
                          if (registrationMatches.length > 0) {
                            setRegistrationMatches([]);
                            setShowRegistrationMatchModal(false);
                          }
                        });
                      }}
                      onBlur={(e) => {
                        searchRegistrationMatches(e.target.value, {
                          openModal: true,
                        });
                      }}
                      disabled={isTelecaller || submitting}
                    />
                    {registrationMatches.length > 0 && (
                      <button
                        type="button"
                        className="registration-match-btn"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowRegistrationMatchModal(true)}
                      >
                        Previous orders ({registrationMatches.length})
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="detailsEditPlace">Place of Inspection</label>
                  <input
                    className="form-field"
                    id="detailsEditPlace"
                    value={formData.place_of_inspection}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        place_of_inspection: e.target.value.toUpperCase(),
                      })
                    }
                    disabled={submitting}
                  />
                </div>

                {hasPermission(allowedPermissions, "edit_order_created_at") && (
                  <div className="form-group">
                    <label htmlFor="detailsEditCreatedAt">Created At</label>
                    <DatePicker
                      id="detailsEditCreatedAt"
                      selected={formData.created_at}
                      onChange={(date) =>
                        setFormData({ ...formData, created_at: date })
                      }
                      showTimeSelect
                      timeFormat="HH:mm"
                      timeIntervals={15}
                      dateFormat="d MMM yyyy h:mm aa"
                      placeholderText="Select date and time (optional)"
                      className="form-field"
                      renderCustomHeader={renderDatePickerHeader}
                      isClearable
                      disabled={submitting}
                    />
                  </div>
                )}

                {hasPermission(
                  allowedPermissions,
                  "view_order_add_edit_subcategory_filed"
                ) && (
                  <div className="form-group">
                    <label htmlFor="detailsEditSubcategory">Subcategory</label>
                    <SingleSearchSelect
                      id="detailsEditSubcategory"
                      className="search-selector"
                      options={filteredChildCategories.map((childCategory) => ({
                        value: childCategory.id,
                        label: `${childCategory.name}`,
                      }))}
                      value={formData.child_category_id}
                      onChange={(val) => {
                        if (!isTelecaller) {
                          setFormData({
                            ...formData,
                            child_category_id: val,
                          });
                        }
                      }}
                      placeholder="Select Subcategory"
                      disabled={isTelecaller || submitting}
                    />
                  </div>
                )}

                {hasPermission(
                  allowedPermissions,
                  "view_order_add_edit_officer_filed"
                ) &&
                  !isBankOfficer && (
                    <div className="form-group">
                      <label htmlFor="detailsEditOfficer">Officer</label>
                      <SingleSearchSelect
                        id="detailsEditOfficer"
                        className="search-selector"
                        options={bankOfficers.map((user) => ({
                          value: user.id,
                          label: `${user.name} (${user.role_name})`,
                        }))}
                        value={formData.officer_id}
                        onChange={(val) => {
                          if (!isTelecaller) {
                            setFormData({ ...formData, officer_id: val });
                          }
                        }}
                        placeholder="Select officer"
                        disabled={isTelecaller || submitting}
                      />
                    </div>
                  )}

                {hasPermission(
                  allowedPermissions,
                  "view_order_add_edit_manager_filed"
                ) &&
                  !isManager && (
                    <div className="form-group">
                      <label htmlFor="detailsEditManager">Manager</label>
                      <SingleSearchSelect
                        id="detailsEditManager"
                        className="search-selector"
                        options={managers.map((user) => ({
                          value: user.id,
                          label: user.name,
                        }))}
                        value={formData.manager_id}
                        onChange={(val) => {
                          if (!isTelecaller) {
                            setFormData({
                              ...formData,
                              manager_id: val,
                              field_verifier_id: val
                                ? formData.field_verifier_id
                                : null,
                            });
                          }
                        }}
                        placeholder="Select manager"
                        disabled={isTelecaller || submitting}
                      />
                    </div>
                  )}

                {(formData.manager_id || isManager || isSuperAdmin) &&
                  !isBankOfficer &&
                  (isManager ||
                    hasPermission(
                      allowedPermissions,
                      "view_order_add_edit_manager_filed"
                    )) && (
                    <div className="form-group">
                      <label htmlFor="detailsEditFieldVerifier">
                        Field Verifier
                      </label>
                      <SingleSearchSelect
                        id="detailsEditFieldVerifier"
                        className="search-selector"
                        options={(fieldVerifiers || []).map((verifier) => ({
                          value: verifier.id,
                          label: verifier.name,
                        }))}
                        value={formData.field_verifier_id}
                        onChange={(val) => {
                          if (!isTelecaller) {
                            setFormData({
                              ...formData,
                              field_verifier_id: val,
                            });
                          }
                        }}
                        placeholder="Select field verifier"
                        disabled={isTelecaller || submitting}
                      />
                    </div>
                  )}

                <div className="form-buttons">
                  <button
                    className="submit-button"
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting ? "Updating..." : "Update"}
                  </button>
                </div>
              </div>
            </form>
          ),
          onClose: handleClose,
        }}
      </FormModel>

      {showRegistrationMatchModal && (
        <FormModel className="stacked-modal" size="xl">
          {{
            title: "Previous orders with this registration number",
            body: (
              <div className="registration-match-modal-body">
                {registrationMatches.length === 0 ? (
                  <p>No matching orders found.</p>
                ) : (
                  <div className="registration-match-table-wrap">
                    <table className="registration-match-table">
                      <thead>
                        <tr>
                          <th>Order Number</th>
                          <th>Date of Creation</th>
                          <th>Registration Number</th>
                          <th>Customer Name</th>
                          <th>Bank</th>
                          <th>Officer</th>
                          <th>Order Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registrationMatches.map((row) => (
                          <tr key={row.id}>
                            <td>
                              {hasPermission(
                                allowedPermissions,
                                "view_order_details"
                              ) ? (
                                <Link
                                  className="get-me-inside"
                                  to={`/orders/${row.id}/details`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {row.order_number || "-"}
                                </Link>
                              ) : (
                                row.order_number || "-"
                              )}
                            </td>
                            <td>{formatMatchDate(row.created_at)}</td>
                            <td>{row.registration_number || "-"}</td>
                            <td>{row.customer_name_2 || "-"}</td>
                            <td>{row.bank_name || "-"}</td>
                            <td>{row.officer_name || "-"}</td>
                            <td>{row.current_status_name || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ),
            onClose: () => setShowRegistrationMatchModal(false),
          }}
        </FormModel>
      )}
    </>
  );
}
