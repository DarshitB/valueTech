import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { fetchAttendanceByWorkingDate } from "../../redux/reducers/attendanceReducer";
import { addHoliday, fetchHolidays } from "../../redux/reducers/holidayReducer";
import { addUserLeave } from "../../redux/reducers/userLeaveReducer";
import CustomDataTable from "../../components/CustomDataTable";
import FormModel from "../../components/FormModel";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import { EditIcon } from "../../components/icons";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { usePageTitle } from "../../context/PageTitleContext";
import { toast } from "react-toastify";
import "../../pages/dashboard/dashboard.scss";

const DEFAULT_SCHEDULED_MINUTES = 9 * 60;
const LATE_DAY_IN_BUFFER_MINUTES = 20;

const LEAVE_TYPE_OPTIONS = [
  { value: "half_day", label: "Half Day" },
  { value: "paid_leave", label: "Paid Leave" },
  { value: "leave", label: "Leave" },
];

const STATUS_LABELS = {
  holiday: "Holiday",
  paid_leave: "Paid Leave",
  leave: "Leave",
  half_day: "Half Day",
};

const toDateOnlyString = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    const plain = value.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
    if (plain) return plain[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const dateOnlyToLocalDate = (value) => {
  const key = toDateOnlyString(value);
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function AttendanceDate() {
  const dispatch = useDispatch();
  const { setTitle } = usePageTitle();
  const allowedPermissions = useSelector(selectPermissions);

  const {
    byDateList,
    byDateBreaks,
    byDateLeaves,
    byDateLoading,
  } = useSelector((state) => state.attendance);
  const { list: holidays } = useSelector((state) => state.holidays);

  const [selectedDate, setSelectedDate] = useState(startOfToday);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    id: null,
    title: "",
    start_date: null,
    end_date: null,
  });
  const [holidaySubmitting, setHolidaySubmitting] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    id: null,
    user_id: null,
    user_name: "",
    working_date: null,
    leave_type: "",
    remarks: "",
  });
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);

  useLayoutEffect(() => {
    setTitle("Attendance Date");
  }, [setTitle]);

  useEffect(() => {
    dispatch(fetchHolidays());
  }, [dispatch]);

  useEffect(() => {
    const dateKey = toDateOnlyString(selectedDate);
    if (dateKey) {
      dispatch(fetchAttendanceByWorkingDate(dateKey));
    }
  }, [dispatch, selectedDate]);

  const parseTimeToMinutes = (timeValue) => {
    if (timeValue == null || timeValue === "") return null;
    if (timeValue instanceof Date && !Number.isNaN(timeValue.getTime())) {
      return timeValue.getHours() * 60 + timeValue.getMinutes();
    }
    const match = String(timeValue).match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  };

  const getScheduledDayMinutes = (record) => {
    const start = parseTimeToMinutes(record?.day_start);
    const end = parseTimeToMinutes(record?.day_end);
    if (start == null || end == null) return DEFAULT_SCHEDULED_MINUTES;
    let diff = end - start;
    if (diff <= 0) diff += 24 * 60;
    return diff;
  };

  const getLunchMinutes = (record) => {
    if (!record?.lunch_in || !record?.lunch_out) return 0;
    const lunchIn = new Date(record.lunch_in);
    const lunchOut = new Date(record.lunch_out);
    return Math.max(0, (lunchOut - lunchIn) / (1000 * 60));
  };

  const getBreakMinutes = (record) => {
    if (!record?.id || typeof record.id !== "number") return 0;
    const dayBreaks = (byDateBreaks || []).filter(
      (b) => b.attendance_id === record.id
    );
    if (!dayBreaks.length) return 0;

    const fallbackEnd = record.checkout_time
      ? new Date(record.checkout_time)
      : null;

    return dayBreaks.reduce((sum, br) => {
      if (!br.break_out) return sum;
      const start = new Date(br.break_out);
      const endAt = br.break_in ? new Date(br.break_in) : fallbackEnd;
      if (!endAt) return sum;
      return sum + Math.max(0, (endAt - start) / (1000 * 60));
    }, 0);
  };

  const getWorkedMinutes = (record) => {
    if (!record?.checkin_time || !record?.checkout_time) return 0;
    const checkin = new Date(record.checkin_time);
    const endTime = new Date(record.checkout_time);
    const spanMinutes = Math.max(0, (endTime - checkin) / (1000 * 60));
    return Math.max(0, spanMinutes - getLunchMinutes(record) - getBreakMinutes(record));
  };

  const isHolidayDate = (workingDate) => {
    const dateKey = toDateOnlyString(workingDate);
    if (!dateKey) return false;
    const localDate = dateOnlyToLocalDate(dateKey);
    if (localDate && localDate.getDay() === 0) return true;
    return (holidays || []).some((item) => {
      const start = toDateOnlyString(item.start_date);
      const end = toDateOnlyString(item.end_date) || start;
      if (!start) return false;
      return dateKey >= start && dateKey <= end;
    });
  };

  const getExpectedNetMinutes = (record) => {
    if (isHolidayDate(record?.working_date)) return 0;
    return Math.max(0, getScheduledDayMinutes(record) - getLunchMinutes(record));
  };

  const getOvertimeMinutes = (record) => {
    const worked = getWorkedMinutes(record);
    if (isHolidayDate(record?.working_date)) return worked;
    return Math.max(0, worked - getExpectedNetMinutes(record));
  };

  const getRegularWorkingMinutes = (record) => {
    const worked = getWorkedMinutes(record);
    return Math.max(0, worked - getOvertimeMinutes(record));
  };

  const formatDurationFromMinutes = (totalMinutes) => {
    const safeMinutes = Math.max(0, totalMinutes || 0);
    const hours = Math.floor(safeMinutes / 60);
    const minutes = Math.floor(safeMinutes % 60);
    return `${hours}h ${minutes}m`;
  };

  const formatDate = (dateString) => {
    const date = dateOnlyToLocalDate(dateString);
    if (!date) return "-";
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return "-";
    return new Date(timeString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isDayInLate = (record) => {
    if (!record?.checkin_time) return false;
    const scheduledStartMinutes = parseTimeToMinutes(record.day_start);
    if (scheduledStartMinutes == null) return false;
    const checkin = new Date(record.checkin_time);
    const checkinMinutes = checkin.getHours() * 60 + checkin.getMinutes();
    return checkinMinutes - scheduledStartMinutes > LATE_DAY_IN_BUFFER_MINUTES;
  };

  const isDayOutEarly = (record) => {
    if (!record?.checkout_time) return false;
    const scheduledEndMinutes = parseTimeToMinutes(record.day_end);
    if (scheduledEndMinutes == null) return false;
    const checkout = new Date(record.checkout_time);
    const checkoutMinutes = checkout.getHours() * 60 + checkout.getMinutes();
    return checkoutMinutes < scheduledEndMinutes;
  };

  const calculateTotalHours = (record) => {
    if (!record?.checkin_time || !record?.checkout_time) return "-";
    return formatDurationFromMinutes(getWorkedMinutes(record));
  };

  const calculateTotalLunchTime = (record) => {
    if (!record?.lunch_in || !record?.lunch_out) return "-";
    return formatDurationFromMinutes(getLunchMinutes(record));
  };

  const calculateTotalBreakTime = (record) => {
    if (!record?.checkin_time) return "-";
    const breakMinutes = getBreakMinutes(record);
    if (breakMinutes <= 0) {
      const hasAny = (byDateBreaks || []).some(
        (b) => b.attendance_id === record.id
      );
      return hasAny ? "0h 0m" : "-";
    }
    return formatDurationFromMinutes(breakMinutes);
  };

  const calculateWorkingHours = (record) => {
    if (!record?.checkin_time || !record?.checkout_time) return "-";
    return formatDurationFromMinutes(getRegularWorkingMinutes(record));
  };

  const calculateOvertimeWorked = (record) => {
    if (!record?.checkin_time || !record?.checkout_time) return "-";
    const overtimeMinutes = getOvertimeMinutes(record);
    if (overtimeMinutes <= 0) return "0h 0m";
    return formatDurationFromMinutes(overtimeMinutes);
  };

  const dateInRange = (dateKey, startDate, endDate) => {
    const start = toDateOnlyString(startDate);
    const end = toDateOnlyString(endDate) || start;
    if (!dateKey || !start) return false;
    return dateKey >= start && dateKey <= end;
  };

  const getDayStatus = (workingDate, userId) => {
    const dateKey = toDateOnlyString(workingDate);
    if (!dateKey) return null;

    const localDate = dateOnlyToLocalDate(dateKey);
    if (localDate && localDate.getDay() === 0) {
      return { key: "holiday", label: STATUS_LABELS.holiday };
    }

    const holidayMatch = (holidays || []).find((item) =>
      dateInRange(dateKey, item.start_date, item.end_date)
    );
    if (holidayMatch) {
      return { key: "holiday", label: STATUS_LABELS.holiday };
    }

    const leaveMatch = (byDateLeaves || []).find(
      (item) =>
        String(item.user_id) === String(userId) &&
        dateInRange(dateKey, item.start_date, item.end_date)
    );
    if (leaveMatch) {
      return {
        key: leaveMatch.leave_type,
        label: STATUS_LABELS[leaveMatch.leave_type] || leaveMatch.leave_type,
      };
    }

    return null;
  };

  const displayList = useMemo(() => {
    if (!byDateList?.length) return [];
    // One row per user (prefer record with check-in / higher id)
    const byUser = new Map();
    byDateList.forEach((record) => {
      const key = String(record.user_id);
      const existing = byUser.get(key);
      if (
        !existing ||
        (record.checkin_time && !existing.checkin_time) ||
        (record.id && existing.id && record.id > existing.id)
      ) {
        byUser.set(key, record);
      }
    });
    return Array.from(byUser.values()).sort((a, b) =>
      String(a.user_name || "").localeCompare(String(b.user_name || ""))
    );
  }, [byDateList]);

  const monthNames = [
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
          {monthNames.map((month, idx) => (
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

  const openHolidayModal = () => {
    setHolidayForm({
      id: null,
      title: "",
      start_date: null,
      end_date: null,
    });
    setShowHolidayModal(true);
  };

  // Prefill holiday form when selected dates match an existing holiday
  useEffect(() => {
    if (!showHolidayModal || !holidayForm.start_date) return;

    const start = toDateOnlyString(holidayForm.start_date);
    const end = toDateOnlyString(holidayForm.end_date) || start;
    if (!start) return;

    const existing = (holidays || []).find(
      (item) =>
        toDateOnlyString(item.start_date) === start &&
        toDateOnlyString(item.end_date) === end
    );

    if (existing) {
      setHolidayForm((prev) => {
        if (prev.id === existing.id && prev.title === existing.title) {
          return prev;
        }
        return {
          ...prev,
          id: existing.id,
          title: existing.title || prev.title,
        };
      });
    } else {
      setHolidayForm((prev) => (prev.id ? { ...prev, id: null } : prev));
    }
  }, [
    showHolidayModal,
    holidayForm.start_date,
    holidayForm.end_date,
    holidays,
  ]);

  const handleHolidaySubmit = async (e) => {
    e.preventDefault();
    if (!holidayForm.title?.trim()) {
      toast.error("Holiday title is required");
      return;
    }
    if (!holidayForm.start_date) {
      toast.error("Start date is required");
      return;
    }

    const start = toDateOnlyString(holidayForm.start_date);
    const end = toDateOnlyString(holidayForm.end_date) || start;

    if (end < start) {
      toast.error("End date cannot be before start date");
      return;
    }

    setHolidaySubmitting(true);
    try {
      await dispatch(
        addHoliday({
          title: holidayForm.title.trim(),
          start_date: start,
          end_date: end,
          type: "holiday",
        })
      ).unwrap();
      setShowHolidayModal(false);
      setHolidayForm({
        id: null,
        title: "",
        start_date: null,
        end_date: null,
      });
      dispatch(fetchHolidays());
      const dateKey = toDateOnlyString(selectedDate);
      if (dateKey) {
        dispatch(fetchAttendanceByWorkingDate(dateKey));
      }
    } catch (err) {
      // toast handled in reducer
    } finally {
      setHolidaySubmitting(false);
    }
  };

  const openLeaveModal = (record) => {
    const day = toDateOnlyString(record.working_date);
    const existing = (byDateLeaves || []).find(
      (item) =>
        String(item.user_id) === String(record.user_id) &&
        dateInRange(day, item.start_date, item.end_date)
    );

    setLeaveForm({
      id: existing?.id || null,
      user_id: record.user_id,
      user_name: record.user_name || `User #${record.user_id}`,
      working_date: dateOnlyToLocalDate(record.working_date),
      leave_type: existing?.leave_type || "",
      remarks: existing?.remarks || "",
    });
    setShowLeaveModal(true);
  };

  const handleLeaveSubmit = async (e) => {
    e.preventDefault();
    if (!leaveForm.leave_type) {
      toast.error("Please select leave type");
      return;
    }
    if (!leaveForm.working_date || !leaveForm.user_id) {
      toast.error("Date and user are required");
      return;
    }

    const day = toDateOnlyString(leaveForm.working_date);
    setLeaveSubmitting(true);
    try {
      await dispatch(
        addUserLeave({
          user_id: leaveForm.user_id,
          start_date: day,
          end_date: day,
          leave_type: leaveForm.leave_type,
          half_day_session: null,
          remarks: leaveForm.remarks?.trim() || null,
        })
      ).unwrap();
      setShowLeaveModal(false);
      dispatch(fetchAttendanceByWorkingDate(day));
    } catch (err) {
      // toast handled in reducer
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const canAddLeave = hasPermission(allowedPermissions, "add_user_leave");
  const canAddHoliday = hasPermission(
    allowedPermissions,
    "add_company_holiday"
  );
  const canViewOvertimeWorked = hasPermission(
    allowedPermissions,
    "view_attendance_overtime_worked"
  );
  // Same permission / destination as Users table eye → attendance
  const canViewUserAttendance = hasPermission(
    allowedPermissions,
    "show_attendance_of_all_users"
  );

  return (
    <div className="height-full-occupied attendance-container">
      <div className="attendance-data-table">
        {byDateLoading ? (
          <p>Loading...</p>
        ) : (
          <CustomDataTable
            showEntriesSelector={true}
            showFooter={false}
            sortableColumns={[0]}
          >
            {{
              buttons: (
                <div className="add-action-buttons attendance-date-filter">
                  <label htmlFor="attendance_date_picker" className="me-2">
                    Date
                  </label>
                  <DatePicker
                    id="attendance_date_picker"
                    selected={selectedDate}
                    onChange={(date) => {
                      if (!date) return;
                      const next = new Date(date);
                      next.setHours(0, 0, 0, 0);
                      setSelectedDate(next);
                    }}
                    placeholderText="Select date"
                    className="form-field"
                    dateFormat="d MMM yyyy"
                    renderCustomHeader={renderDatePickerHeader}
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                    portalId="datepicker-portal"
                    popperPlacement="bottom-end"
                    popperClassName="attendance-date-picker-popper"
                    calendarClassName="attendance-date-calendar"
                    popperProps={{ strategy: "fixed" }}
                  />
                  {canAddHoliday && (
                    <button
                      className="btn"
                      type="button"
                      onClick={openHolidayModal}
                    >
                      Add Holiday for All
                    </button>
                  )}
                </div>
              ),
              header: (
                <tr>
                  <th style={{ width: "160px" }}>User Name</th>
                  <th style={{ width: "160px" }}>Date</th>
                  <th style={{ width: "120px" }}>Status</th>
                  <th style={{ width: "120px" }}>Day In</th>
                  <th style={{ width: "120px" }}>Lunch In</th>
                  <th style={{ width: "120px" }}>Lunch Out</th>
                  <th style={{ width: "120px" }}>Day Out</th>
                  <th style={{ width: "140px" }}>Total Lunch Time</th>
                  <th style={{ width: "140px" }}>Total Break Time</th>
                  <th style={{ width: "130px" }}>Working Hours</th>
                  {canViewOvertimeWorked && (
                    <th style={{ width: "140px" }}>Overtime Worked</th>
                  )}
                  <th style={{ width: "120px" }}>Total Hours</th>
                  {canAddLeave && (
                    <th style={{ width: "90px", textAlign: "center" }}>
                      Action
                    </th>
                  )}
                </tr>
              ),
              rows:
                displayList.length === 0
                  ? [
                      <tr key="empty-attendance-date">
                        <td
                          colSpan={
                            11 +
                            (canViewOvertimeWorked ? 1 : 0) +
                            (canAddLeave ? 1 : 0)
                          }
                          style={{ textAlign: "center" }}
                        >
                          No attendance records for this date
                        </td>
                      </tr>,
                    ]
                  : displayList.map((record) => {
                      const dayStatus = getDayStatus(
                        record.working_date,
                        record.user_id
                      );
                      const lateIn = isDayInLate(record);
                      const earlyOut = isDayOutEarly(record);
                      const isLongLunch =
                        record?.lunch_in &&
                        record?.lunch_out &&
                        getLunchMinutes(record) > 60;

                      return (
                        <tr key={record.id}>
                          <td data-sort={record.user_name || ""}>
                            {canViewUserAttendance && record.user_id ? (
                              <Link
                                to={`/users/${record.user_id}/attendance`}
                                className="attendance-date-user-link"
                                title="View attendance"
                              >
                                {record.user_name || "-"}
                              </Link>
                            ) : (
                              record.user_name || "-"
                            )}
                          </td>
                          <td>{formatDate(record.working_date)}</td>
                          <td>
                            {dayStatus ? (
                              <span
                                className={`attendance-status-tag status-${dayStatus.key}`}
                              >
                                {dayStatus.label}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td
                            className={lateIn ? "tooltip-link" : undefined}
                            title={lateIn ? "Late Day In" : undefined}
                            style={
                              lateIn
                                ? { color: "#dc3545", fontWeight: 600 }
                                : undefined
                            }
                          >
                            {formatTime(record.checkin_time)}
                          </td>
                          <td>{formatTime(record.lunch_in)}</td>
                          <td>{formatTime(record.lunch_out)}</td>
                          <td
                            className={earlyOut ? "tooltip-link" : undefined}
                            title={earlyOut ? "Early Day Out" : undefined}
                            style={
                              earlyOut
                                ? { color: "#dc3545", fontWeight: 600 }
                                : undefined
                            }
                          >
                            {formatTime(record.checkout_time)}
                          </td>
                          <td
                            className={isLongLunch ? "tooltip-link" : undefined}
                            title={
                              isLongLunch
                                ? "Long Lunch (more than 1 hour)"
                                : undefined
                            }
                            style={
                              isLongLunch
                                ? { color: "#dc3545", fontWeight: 600 }
                                : undefined
                            }
                          >
                            {calculateTotalLunchTime(record)}
                          </td>
                          <td>{calculateTotalBreakTime(record)}</td>
                          <td>{calculateWorkingHours(record)}</td>
                          {canViewOvertimeWorked && (
                            <td>{calculateOvertimeWorked(record)}</td>
                          )}
                          <td>{calculateTotalHours(record)}</td>
                          {canAddLeave && (
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className="action-icons"
                                title="Add leave"
                                onClick={() => openLeaveModal(record)}
                              >
                                <EditIcon />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    }),
            }}
          </CustomDataTable>
        )}
      </div>

      {showHolidayModal && (
        <FormModel>
          {{
            title: holidayForm.id
              ? "Update Holiday for All"
              : "Add Holiday for All",
            body: (
              <form className="body-form-box" onSubmit={handleHolidaySubmit}>
                <div className="body-form-box">
                  <div className="form-group">
                    <label htmlFor="holiday_title_date">Title</label>
                    <input
                      id="holiday_title_date"
                      type="text"
                      className="form-field"
                      value={holidayForm.title}
                      onChange={(e) =>
                        setHolidayForm((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                      placeholder="e.g. Diwali"
                      required
                    />
                  </div>
                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="holiday_start_date">Start Date</label>
                      <DatePicker
                        id="holiday_start_date"
                        selected={holidayForm.start_date}
                        onChange={(date) =>
                          setHolidayForm((prev) => ({
                            ...prev,
                            start_date: date,
                            end_date:
                              prev.end_date && date && prev.end_date < date
                                ? date
                                : prev.end_date,
                          }))
                        }
                        selectsStart
                        startDate={holidayForm.start_date}
                        endDate={holidayForm.end_date}
                        placeholderText="Start date"
                        className="form-field"
                        dateFormat="d MMM yyyy"
                        renderCustomHeader={renderDatePickerHeader}
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                        portalId="datepicker-portal"
                        popperPlacement="bottom-start"
                        popperClassName="attendance-date-picker-popper"
                        calendarClassName="attendance-date-calendar"
                        popperProps={{ strategy: "fixed" }}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="holiday_end_date">End Date</label>
                      <DatePicker
                        id="holiday_end_date"
                        selected={holidayForm.end_date}
                        onChange={(date) =>
                          setHolidayForm((prev) => ({
                            ...prev,
                            end_date: date,
                          }))
                        }
                        selectsEnd
                        startDate={holidayForm.start_date}
                        endDate={holidayForm.end_date}
                        minDate={holidayForm.start_date}
                        placeholderText="End date (optional)"
                        className="form-field"
                        dateFormat="d MMM yyyy"
                        renderCustomHeader={renderDatePickerHeader}
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                        portalId="datepicker-portal"
                        popperPlacement="bottom-start"
                        popperClassName="attendance-date-picker-popper"
                        calendarClassName="attendance-date-calendar"
                        popperProps={{ strategy: "fixed" }}
                        isClearable
                      />
                    </div>
                  </div>
                  <p className="attendance-holiday-note">
                    If you select only the start date (leave end date empty), it
                    counts as a one-day holiday.
                  </p>
                  <div className="form-buttons">
                    <button
                      className="submit-button"
                      type="submit"
                      disabled={holidaySubmitting}
                    >
                      {holidaySubmitting
                        ? "Saving..."
                        : holidayForm.id
                          ? "Update Holiday"
                          : "Add Holiday"}
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => {
              setShowHolidayModal(false);
              setHolidayForm({
                id: null,
                title: "",
                start_date: null,
                end_date: null,
              });
            },
          }}
        </FormModel>
      )}

      {showLeaveModal && (
        <FormModel>
          {{
            title: leaveForm.id ? "Update Leave" : "Add Leave",
            body: (
              <form className="body-form-box" onSubmit={handleLeaveSubmit}>
                <div className="body-form-box">
                  <div className="form-group">
                    <label>User</label>
                    <input
                      type="text"
                      className="form-field"
                      value={leaveForm.user_name || ""}
                      disabled
                    />
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <input
                      type="text"
                      className="form-field"
                      value={
                        leaveForm.working_date
                          ? formatDate(leaveForm.working_date)
                          : ""
                      }
                      disabled
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="leave_type_date">Leave Type</label>
                    <SingleSearchSelect
                      id="leave_type_date"
                      className="search-selector"
                      options={LEAVE_TYPE_OPTIONS}
                      value={leaveForm.leave_type || null}
                      onChange={(val) =>
                        setLeaveForm((prev) => ({
                          ...prev,
                          leave_type: val || "",
                        }))
                      }
                      placeholder="Select leave type"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="leave_remarks_date">Remarks</label>
                    <input
                      id="leave_remarks_date"
                      type="text"
                      className="form-field"
                      value={leaveForm.remarks}
                      onChange={(e) =>
                        setLeaveForm((prev) => ({
                          ...prev,
                          remarks: e.target.value,
                        }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="form-buttons">
                    <button
                      className="submit-button"
                      type="submit"
                      disabled={leaveSubmitting}
                    >
                      {leaveSubmitting
                        ? "Saving..."
                        : leaveForm.id
                          ? "Update Leave"
                          : "Add Leave"}
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => setShowLeaveModal(false),
          }}
        </FormModel>
      )}
    </div>
  );
}

export default AttendanceDate;
