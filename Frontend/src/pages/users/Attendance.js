import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate, useParams } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { fetchAttendanceByUserId, fetchBreaksByUserId } from "../../redux/reducers/attendanceReducer";
import { fetchUsers } from "../../redux/reducers/userReducer";
import { addHoliday, fetchHolidays } from "../../redux/reducers/holidayReducer";
import {
  addUserLeave,
  fetchUserLeavesByUserId,
} from "../../redux/reducers/userLeaveReducer";
import CustomDataTable from "../../components/CustomDataTable";
import FormModel from "../../components/FormModel";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import { EditIcon } from "../../components/icons";
import {
  selectPermissions,
  selectUser,
} from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { usePageTitle } from "../../context/PageTitleContext";
import { toast } from "react-toastify";
import "../../pages/dashboard/dashboard.scss";

const DEFAULT_SCHEDULED_MINUTES = 9 * 60; // 9h including lunch when day_start/day_end missing

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

  // Already a calendar date with no time — keep as-is (no timezone shift)
  if (typeof value === "string") {
    const plain = value.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
    if (plain) return plain[1];
  }

  // Date object or ISO datetime from API — use LOCAL calendar day
  // (PG DATE often arrives as UTC midnight, e.g. 2026-07-29 → 2026-07-28T18:30:00.000Z in IST)
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

const getCurrentMonthRange = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  from.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);
  return { from, to };
};

function Attendance() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { userId } = useParams(); // Get userId from URL params if viewing someone else's attendance
  const { setTitle } = usePageTitle();

  /* get logged user */
  const currentUser = useSelector(selectUser);
  const allowedPermissions = useSelector(selectPermissions);
  const canViewOvertimeWorked = hasPermission(
    allowedPermissions,
    "view_attendance_overtime_worked"
  );

  // Redux data
  const { list: attendanceList, breaks: attendanceBreaks, loading } = useSelector(
    (state) => state.attendance
  );
  const { list: users } = useSelector((state) => state.users);
  const { list: holidays } = useSelector((state) => state.holidays);
  const { list: userLeaves } = useSelector((state) => state.userLeaves);

  // State for real-time clock updates
  const [currentTime, setCurrentTime] = useState(new Date());

  // From / To date filter (defaults: current month first → last day)
  const [dateRange, setDateRange] = useState(getCurrentMonthRange);

  // Company holiday modal
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    id: null,
    title: "",
    start_date: null,
    end_date: null,
  });
  const [holidaySubmitting, setHolidaySubmitting] = useState(false);

  // Individual leave modal
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    id: null,
    working_date: null,
    leave_type: "",
    remarks: "",
  });
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);

  // Determine which user's attendance to show
  const targetUserId = userId || currentUser?.id;
  const isViewingOtherUser = Boolean(userId);
  const targetUser = useMemo(() => {
    const fromList = users.find(
      (user) => String(user.id) === String(targetUserId)
    );
    if (fromList) return fromList;
    // Own profile may only exist on auth user until users list loads
    if (currentUser && String(currentUser.id) === String(targetUserId)) {
      return currentUser;
    }
    return null;
  }, [users, currentUser, targetUserId]);
  const targetUserName = targetUser?.name || `User #${targetUserId}`;

  // Fetch attendance for selected From/To range (DB filter only)
  useEffect(() => {
    if (!targetUserId) return;

    const from = toDateOnlyString(dateRange.from);
    const to = toDateOnlyString(dateRange.to);
    if (!from || !to) return;

    const params = { userId: targetUserId, from, to };
    dispatch(fetchAttendanceByUserId(params));
    dispatch(fetchBreaksByUserId(params));
    dispatch(
      fetchUserLeavesByUserId({
        userId: targetUserId,
        params: { from, to },
      })
    );
  }, [dispatch, targetUserId, dateRange.from, dateRange.to]);

  // Company holidays for status column
  useEffect(() => {
    dispatch(fetchHolidays());
  }, [dispatch]);

  // Need users list for day_start / day_end schedule (and breadcrumb name)
  useEffect(() => {
    if (!users || users.length === 0) {
      dispatch(fetchUsers());
    }
  }, [dispatch, users]);

  // Set page title / breadcrumb
  useLayoutEffect(() => {
    if (isViewingOtherUser) {
      setTitle(
        <>
          <Link to="/users" className="text-blue-600 hover:underline">
            Users
          </Link>{" "}
          &gt; {targetUserName} &gt; Attendance
        </>
      );
    } else {
      setTitle("Attendance");
    }
  }, [isViewingOtherUser, targetUserName, setTitle]);

  // Update current time every second for real-time clock
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Parse TIME / Date-like values to minutes from midnight
  const parseTimeToMinutes = (timeValue) => {
    if (timeValue == null || timeValue === "") return null;
    if (timeValue instanceof Date && !Number.isNaN(timeValue.getTime())) {
      return timeValue.getHours() * 60 + timeValue.getMinutes();
    }
    const match = String(timeValue).match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  };

  // Scheduled day length including lunch (day_end - day_start), else 9h
  const getScheduledDayMinutes = () => {
    const start = parseTimeToMinutes(targetUser?.day_start);
    const end = parseTimeToMinutes(targetUser?.day_end);
    if (start == null || end == null) return DEFAULT_SCHEDULED_MINUTES;

    let diff = end - start;
    if (diff <= 0) diff += 24 * 60;
    return diff;
  };

  const getLunchMinutes = (record, endTimeOverride = null) => {
    if (!record) return 0;

    if (record.lunch_in && record.lunch_out) {
      const lunchIn = new Date(record.lunch_in);
      const lunchOut = new Date(record.lunch_out);
      return Math.max(0, (lunchOut - lunchIn) / (1000 * 60));
    }

    if (
      record.lunch_in &&
      !record.lunch_out &&
      endTimeOverride &&
      !record.checkout_time
    ) {
      const lunchIn = new Date(record.lunch_in);
      const endTime = new Date(endTimeOverride);
      return Math.max(0, (endTime - lunchIn) / (1000 * 60));
    }

    return 0;
  };

  // Sum personal breaks for an attendance day (duration = break_in − break_out)
  const getBreakMinutes = (record, endTimeOverride = null) => {
    if (!record?.id || typeof record.id !== "number") return 0;

    const dayBreaks = (attendanceBreaks || []).filter(
      (b) => b.attendance_id === record.id
    );
    if (!dayBreaks.length) return 0;

    const fallbackEnd = endTimeOverride
      ? new Date(endTimeOverride)
      : record.checkout_time
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

  // Worked minutes = (day out/end - day in) minus lunch minus breaks
  const getWorkedMinutes = (record, endTimeOverride = null) => {
    if (!record?.checkin_time) return 0;

    const checkin = new Date(record.checkin_time);
    const endTime = endTimeOverride
      ? new Date(endTimeOverride)
      : record.checkout_time
        ? new Date(record.checkout_time)
        : null;

    if (!endTime) return 0;

    const spanMinutes = Math.max(0, (endTime - checkin) / (1000 * 60));
    const lunch = getLunchMinutes(record, endTimeOverride);
    const breaks = getBreakMinutes(record, endTimeOverride);
    return Math.max(0, spanMinutes - lunch - breaks);
  };

  // Sunday or company holiday → all worked time counts as OT (no regular working hours)
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

  // Expected net work = scheduled day (incl. lunch) minus that day's lunch
  // Holiday days: expected = 0 (all worked time is overtime)
  const getExpectedNetMinutes = (record, endTimeOverride = null) => {
    if (isHolidayDate(record?.working_date)) return 0;

    const scheduled = getScheduledDayMinutes();
    const lunch = getLunchMinutes(record, endTimeOverride);
    return Math.max(0, scheduled - lunch);
  };

  const getOvertimeMinutes = (record, endTimeOverride = null) => {
    const worked = getWorkedMinutes(record, endTimeOverride);
    if (isHolidayDate(record?.working_date)) return worked;

    const expected = getExpectedNetMinutes(record, endTimeOverride);
    return Math.max(0, worked - expected);
  };

  const getRegularWorkingMinutes = (record, endTimeOverride = null) => {
    const worked = getWorkedMinutes(record, endTimeOverride);
    return Math.max(0, worked - getOvertimeMinutes(record, endTimeOverride));
  };

  const formatDurationFromMinutes = (totalMinutes, includeSeconds = false) => {
    const safeMinutes = Math.max(0, totalMinutes || 0);
    const hours = Math.floor(safeMinutes / 60);
    const minutes = Math.floor(safeMinutes % 60);

    if (includeSeconds) {
      const seconds = Math.round((safeMinutes - Math.floor(safeMinutes)) * 60);
      return `${hours}h ${minutes}m ${seconds}s`;
    }

    return `${hours}h ${minutes}m`;
  };

  // Footer: hours + day-units (1 day = user's scheduled day_end - day_start, else 9h)
  // Days rounded to nearest 0.5 (1, 1.5, 2, …) — days shown on next line
  const formatDurationWithDays = (totalMinutes) => {
    const hoursLabel = formatDurationFromMinutes(totalMinutes);
    const scheduled = getScheduledDayMinutes();
    if (!scheduled) return hoursLabel;
    const rawDays = Math.max(0, totalMinutes || 0) / scheduled;
    const halfDays = Math.round(rawDays * 2) / 2;
    const daysLabel = Number.isInteger(halfDays)
      ? String(halfDays)
      : halfDays.toFixed(1);
    return (
      <>
        {hoursLabel}
        <br />
        {`(${daysLabel} days)`}
      </>
    );
  };

  // Calculate today's working hours
  const calculateTodayWorkingHours = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecords = attendanceList.filter((record) => {
      const recordDate = new Date(record.working_date);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === today.getTime();
    });

    let totalMinutes = 0;
    todayRecords.forEach((record) => {
      if (record.checkin_time && record.checkout_time) {
        totalMinutes += getRegularWorkingMinutes(record);
      } else if (record.checkin_time && !record.checkout_time) {
        totalMinutes += getRegularWorkingMinutes(record, currentTime);
      }
    });

    const hasActiveSession = todayRecords.some(
      (record) => record.checkin_time && !record.checkout_time
    );

    return formatDurationFromMinutes(totalMinutes, hasActiveSession);
  };

  // Calculate this month's working hours
  const calculateMonthWorkingHours = () => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const monthRecords = attendanceList.filter((record) => {
      const recordDate = new Date(record.working_date);
      return (
        recordDate.getMonth() === currentMonth &&
        recordDate.getFullYear() === currentYear
      );
    });

    let totalMinutes = 0;
    monthRecords.forEach((record) => {
      if (record.checkin_time && record.checkout_time) {
        totalMinutes += getRegularWorkingMinutes(record);
      } else if (record.checkin_time && !record.checkout_time) {
        totalMinutes += getRegularWorkingMinutes(record, currentTime);
      }
    });

    const hasActiveSession = monthRecords.some(
      (record) => record.checkin_time && !record.checkout_time
    );

    return formatDurationFromMinutes(totalMinutes, hasActiveSession);
  };

  // Calculate today's overtime hours
  const calculateTodayOvertimeHours = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecords = attendanceList.filter((record) => {
      const recordDate = new Date(record.working_date);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === today.getTime();
    });

    let totalOvertimeMinutes = 0;
    todayRecords.forEach((record) => {
      if (record.checkin_time && record.checkout_time) {
        totalOvertimeMinutes += getOvertimeMinutes(record);
      } else if (record.checkin_time && !record.checkout_time) {
        totalOvertimeMinutes += getOvertimeMinutes(record, currentTime);
      }
    });

    return formatDurationFromMinutes(totalOvertimeMinutes);
  };

  // Calculate this month's overtime hours
  const calculateMonthOvertimeHours = () => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const monthRecords = attendanceList.filter((record) => {
      const recordDate = new Date(record.working_date);
      return (
        recordDate.getMonth() === currentMonth &&
        recordDate.getFullYear() === currentYear
      );
    });

    let totalOvertimeMinutes = 0;
    monthRecords.forEach((record) => {
      if (record.checkin_time && record.checkout_time) {
        totalOvertimeMinutes += getOvertimeMinutes(record);
      } else if (record.checkin_time && !record.checkout_time) {
        totalOvertimeMinutes += getOvertimeMinutes(record, currentTime);
      }
    });

    return formatDurationFromMinutes(totalOvertimeMinutes);
  };

  // Format date for display (local calendar day — avoids UTC off-by-one)
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

  // Format time for display
  const formatTime = (timeString) => {
    if (!timeString) return "-";
    const date = new Date(timeString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Late day-in: more than 20 min after scheduled day_start → red
  const LATE_DAY_IN_BUFFER_MINUTES = 20;

  const isDayInLate = (checkinTime) => {
    if (!checkinTime) return false;

    const scheduledStartMinutes = parseTimeToMinutes(targetUser?.day_start);
    if (scheduledStartMinutes == null) return false;

    const checkin = new Date(checkinTime);
    const checkinMinutes = checkin.getHours() * 60 + checkin.getMinutes();
    const lateBy = checkinMinutes - scheduledStartMinutes;

    return lateBy > LATE_DAY_IN_BUFFER_MINUTES;
  };

  // Day out early: checkout time earlier than scheduled day_end
  const isDayOutEarly = (checkoutTime) => {
    if (!checkoutTime) return false;

    const scheduledEndMinutes = parseTimeToMinutes(targetUser?.day_end);
    if (scheduledEndMinutes == null) return false;

    const checkout = new Date(checkoutTime);
    const checkoutMinutes = checkout.getHours() * 60 + checkout.getMinutes();

    return checkoutMinutes < scheduledEndMinutes;
  };

  // Total hours = desk time (day span − lunch − breaks), includes overtime
  const calculateTotalHours = (record) => {
    if (!record?.checkin_time || !record?.checkout_time) return "-";
    return formatDurationFromMinutes(getWorkedMinutes(record));
  };

  // Lunch duration (Lunch Out − Lunch In)
  const calculateTotalLunchTime = (record) => {
    if (!record?.lunch_in || !record?.lunch_out) return "-";
    const lunchMinutes = getLunchMinutes(record);
    if (lunchMinutes <= 0) return "0h 0m";
    return formatDurationFromMinutes(lunchMinutes);
  };

  // Total break duration for the day (sum of closed breaks; open capped at day out)
  const calculateTotalBreakTime = (record) => {
    if (!record?.checkin_time) return "-";
    const breakMinutes = getBreakMinutes(record);
    if (breakMinutes <= 0) {
      const hasAny = (attendanceBreaks || []).some(
        (b) => b.attendance_id === record.id
      );
      return hasAny ? "0h 0m" : "-";
    }
    return formatDurationFromMinutes(breakMinutes);
  };

  // Working hours = total hours minus overtime (0 on holiday days)
  const calculateWorkingHours = (record) => {
    if (!record?.checkin_time || !record?.checkout_time) return "-";
    return formatDurationFromMinutes(getRegularWorkingMinutes(record));
  };

  // Overtime = above expected net; on holiday = all total hours
  const calculateOvertimeWorked = (record) => {
    if (!record?.checkin_time || !record?.checkout_time) return "-";
    const overtimeMinutes = getOvertimeMinutes(record);
    if (overtimeMinutes <= 0) return "0h 0m";
    return formatDurationFromMinutes(overtimeMinutes);
  };

  const toDateKey = (dateValue) => {
    return toDateOnlyString(dateValue);
  };

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

  const dateInRange = (dateKey, startDate, endDate) => {
    const start = toDateOnlyString(startDate);
    const end = toDateOnlyString(endDate) || start;
    if (!dateKey || !start) return false;
    return dateKey >= start && dateKey <= end;
  };

  // Sunday always holiday; then company holiday; then user leave
  const getDayStatus = (workingDate) => {
    const dateKey = toDateKey(workingDate);
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

    const leaveMatch = (userLeaves || []).find((item) =>
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
    } catch (err) {
      // toast handled in reducer
    } finally {
      setHolidaySubmitting(false);
    }
  };

  const openLeaveModal = (workingDate) => {
    const day = toDateOnlyString(workingDate);
    const existing = (userLeaves || []).find((item) =>
      dateInRange(day, item.start_date, item.end_date)
    );

    setLeaveForm({
      id: existing?.id || null,
      working_date: dateOnlyToLocalDate(workingDate),
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
    if (!leaveForm.working_date) {
      toast.error("Date is required");
      return;
    }

    const day = toDateOnlyString(leaveForm.working_date);
    setLeaveSubmitting(true);
    try {
      await dispatch(
        addUserLeave({
          user_id: targetUserId,
          start_date: day,
          end_date: day,
          leave_type: leaveForm.leave_type,
          half_day_session: null,
          remarks: leaveForm.remarks?.trim() || null,
        })
      ).unwrap();
      setShowLeaveModal(false);
      dispatch(
        fetchUserLeavesByUserId({
          userId: targetUserId,
          params: {
            from: toDateOnlyString(dateRange.from),
            to: toDateOnlyString(dateRange.to),
          },
        })
      );
    } catch (err) {
      // toast handled in reducer
    } finally {
      setLeaveSubmitting(false);
    }
  };

  // Same continuous day list as before: From → min(today, To); empty days filled.
  // From/To only change which records were fetched from the DB.
  const displayAttendanceList = useMemo(() => {
    const fromKey = toDateKey(dateRange.from);
    const toKey = toDateKey(dateRange.to);
    if (!fromKey || !toKey || fromKey > toKey) return [];

    const todayKey = toDateKey(new Date());
    const endKey = todayKey && todayKey < toKey ? todayKey : toKey;
    if (fromKey > endKey) return [];

    const recordsByDate = new Map();
    (attendanceList || []).forEach((record) => {
      const key = toDateKey(record.working_date);
      if (!key) return;

      const existing = recordsByDate.get(key);
      if (
        !existing ||
        (record.checkin_time && !existing.checkin_time) ||
        (record.id && existing.id && record.id > existing.id)
      ) {
        recordsByDate.set(key, record);
      }
    });

    const rows = [];
    const cursor = dateOnlyToLocalDate(endKey);
    const start = dateOnlyToLocalDate(fromKey);
    if (!cursor || !start) return [];

    while (cursor >= start) {
      const key = toDateKey(cursor);
      const existing = recordsByDate.get(key);

      if (existing) {
        rows.push(existing);
      } else {
        rows.push({
          id: `empty-${key}`,
          working_date: key,
          checkin_time: null,
          lunch_in: null,
          lunch_out: null,
          checkout_time: null,
          isEmptyDay: true,
        });
      }

      cursor.setDate(cursor.getDate() - 1);
    }

    return rows;
  }, [attendanceList, dateRange.from, dateRange.to]);

  // Sum lunch / break / working / OT / total across closed attendance days
  const attendanceColumnTotals = useMemo(() => {
    let lunchMinutes = 0;
    let breakMinutes = 0;
    let workingMinutes = 0;
    let overtimeMinutes = 0;
    let totalMinutes = 0;

    displayAttendanceList.forEach((record) => {
      if (record?.lunch_in && record?.lunch_out) {
        lunchMinutes += getLunchMinutes(record);
      }
      if (record?.checkin_time && record?.checkout_time) {
        breakMinutes += getBreakMinutes(record);
        const worked = getWorkedMinutes(record);
        const overtime = getOvertimeMinutes(record);
        totalMinutes += worked;
        overtimeMinutes += overtime;
        workingMinutes += Math.max(0, worked - overtime);
      }
    });

    return {
      lunchMinutes,
      breakMinutes,
      workingMinutes,
      overtimeMinutes,
      totalMinutes,
    };
  }, [
    displayAttendanceList,
    attendanceBreaks,
    targetUser?.day_start,
    targetUser?.day_end,
    holidays,
  ]);

  return (
    <div className="height-full-occupied attendance-container">
      {/* Statistics Cards */}
      <div className="dashboard-container-sneak-peek">
        <div className="left-part-of-sneak-peek">
          <div className="row">
            <div className="col-xl-3 col-lg-6 col-md-6 col-sm-12 col-xs-12">
              <div className="padding-top-bottom">
                <div className="sneak-peek-card today-orders">
                  <h3>Today's Working Hours</h3>
                  <p>{calculateTodayWorkingHours()}</p>
                </div>
              </div>
            </div>
            <div className="col-xl-3 col-lg-6 col-md-6 col-sm-12 col-xs-12">
              <div className="padding-top-bottom">
                <div className="sneak-peek-card today-orders">
                  <h3>This Month Total Working Hours</h3>
                  <p>{calculateMonthWorkingHours()}</p>
                </div>
              </div>
            </div>
            {canViewOvertimeWorked && (
              <div className="col-xl-3 col-lg-6 col-md-6 col-sm-12 col-xs-12">
                <div className="padding-top-bottom">
                  <div className="sneak-peek-card today-orders light">
                    <h3>Today's Overtime Hours</h3>
                    <p>{calculateTodayOvertimeHours()}</p>
                  </div>
                </div>
              </div>
            )}
            {canViewOvertimeWorked && (
              <div className="col-xl-3 col-lg-6 col-md-6 col-sm-12 col-xs-12">
                <div className="padding-top-bottom">
                  <div className="sneak-peek-card today-orders light">
                    <h3>This Month Total Overtime Hours</h3>
                    <p>{calculateMonthOvertimeHours()}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Attendance Data Table */}
      <div className="attendance-data-table">
        {loading ? (
          <p>Loading...</p>
        ) : (
          <CustomDataTable
            showEntriesSelector={true}
            showFooter={true}
            sortableColumns={[0]}
          >
            {{
              buttons: (
                <div className="add-action-buttons attendance-range-filter">
                  <label htmlFor="attendance_from_date">From</label>
                  <DatePicker
                    id="attendance_from_date"
                    selected={dateRange.from}
                    onChange={(date) => {
                      if (!date) return;
                      const next = new Date(date);
                      next.setHours(0, 0, 0, 0);
                      setDateRange((prev) => ({
                        from: next,
                        to: prev.to && prev.to < next ? next : prev.to,
                      }));
                    }}
                    placeholderText="From date"
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
                  />
                  <label htmlFor="attendance_to_date">To</label>
                  <DatePicker
                    id="attendance_to_date"
                    selected={dateRange.to}
                    onChange={(date) => {
                      if (!date) return;
                      const next = new Date(date);
                      next.setHours(0, 0, 0, 0);
                      setDateRange((prev) => ({
                        from:
                          prev.from && next < prev.from ? next : prev.from,
                        to: next,
                      }));
                    }}
                    minDate={dateRange.from}
                    placeholderText="To date"
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
                  />
                  {hasPermission(
                    allowedPermissions,
                    "add_company_holiday"
                  ) && (
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
                  {hasPermission(allowedPermissions, "add_user_leave") && (
                    <th style={{ width: "90px", textAlign: "center" }}>
                      Action
                    </th>
                  )}
                </tr>
              ),
              rows: displayAttendanceList.map((record, index) => {
                const dayStatus = getDayStatus(record.working_date);
                const isLongLunch =
                  record?.lunch_in &&
                  record?.lunch_out &&
                  getLunchMinutes(record) > 60;
                const dateKey = toDateKey(record.working_date);
                // Own page → /attendance/:date; Users → eye → /users/:id/attendance/:date
                const openDetail = dateKey
                  ? () =>
                      navigate(
                        isViewingOtherUser
                          ? `/users/${targetUserId}/attendance/${dateKey}`
                          : `/attendance/${dateKey}`
                      )
                  : undefined;
                return (
                  <tr
                    key={record.id || `day-${index}`}
                    onClick={openDetail}
                    className={
                      openDetail ? "attendance-row-clickable" : undefined
                    }
                    style={openDetail ? { cursor: "pointer" } : undefined}
                  >
                    <td data-sort={dateKey || ""}>
                      {formatDate(record.working_date)}
                    </td>
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
                      className={
                        isDayInLate(record.checkin_time)
                          ? "tooltip-link"
                          : undefined
                      }
                      title={
                        isDayInLate(record.checkin_time)
                          ? "Late Day In"
                          : undefined
                      }
                      style={
                        isDayInLate(record.checkin_time)
                          ? { color: "#dc3545", fontWeight: 600 }
                          : undefined
                      }
                    >
                      {formatTime(record.checkin_time)}
                    </td>
                    <td>{formatTime(record.lunch_in)}</td>
                    <td>{formatTime(record.lunch_out)}</td>
                    <td
                      className={
                        isDayOutEarly(record.checkout_time)
                          ? "tooltip-link"
                          : undefined
                      }
                      title={
                        isDayOutEarly(record.checkout_time)
                          ? "Early Day Out"
                          : undefined
                      }
                      style={
                        isDayOutEarly(record.checkout_time)
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
                    {hasPermission(allowedPermissions, "add_user_leave") && (
                      <td
                        style={{ textAlign: "center" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="action-icons"
                          title="Add leave"
                          onClick={() => openLeaveModal(record.working_date)}
                        >
                          <EditIcon />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              }),
              footer: (
                <tr className="attendance-totals-row">
                  <td colSpan={6}>
                    <strong>Total</strong>
                  </td>
                  <td>
                    <strong>
                      {formatDurationFromMinutes(
                        attendanceColumnTotals.lunchMinutes
                      )}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {formatDurationFromMinutes(
                        attendanceColumnTotals.breakMinutes
                      )}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {formatDurationWithDays(
                        attendanceColumnTotals.workingMinutes
                      )}
                    </strong>
                  </td>
                  {canViewOvertimeWorked && (
                    <td>
                      <strong>
                        {formatDurationWithDays(
                          attendanceColumnTotals.overtimeMinutes
                        )}
                      </strong>
                    </td>
                  )}
                  <td>
                    <strong>
                      {formatDurationWithDays(
                        attendanceColumnTotals.totalMinutes
                      )}
                    </strong>
                  </td>
                  {hasPermission(allowedPermissions, "add_user_leave") && (
                    <td />
                  )}
                </tr>
              ),
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
                    <label htmlFor="holiday_title">Title</label>
                    <input
                      id="holiday_title"
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
                      <label htmlFor="holiday_start">Start Date</label>
                      <DatePicker
                        id="holiday_start"
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
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="holiday_end">End Date</label>
                      <DatePicker
                        id="holiday_end"
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
                    <label htmlFor="leave_type">Leave Type</label>
                    <SingleSearchSelect
                      id="leave_type"
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
                    <label htmlFor="leave_remarks">Remarks</label>
                    <input
                      id="leave_remarks"
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
            onClose: () => {
              setShowLeaveModal(false);
            },
          }}
        </FormModel>
      )}
    </div>
  );
}

export default Attendance;
