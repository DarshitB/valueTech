import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  fetchAttendanceDetail,
  updateAttendanceWorkTimes,
  updateBreakWorkTimes,
  updateAttendanceCheckoutRemarks,
} from "../../redux/reducers/attendanceReducer";
import { fetchUsers } from "../../redux/reducers/userReducer";
import FormModel from "../../components/FormModel";
import { EditIcon } from "../../components/icons";
import {
  selectPermissions,
  selectUser,
} from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { usePageTitle } from "../../context/PageTitleContext";
import { toast } from "react-toastify";
import "../../pages/dashboard/dashboard.scss";

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

const parseToLocalDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Keep working calendar day; replace time-of-day from picker
const combineWorkingDateAndTime = (workingDateKey, timeValue) => {
  if (!timeValue) return null;
  const day = dateOnlyToLocalDate(workingDateKey);
  const time = parseToLocalDate(timeValue);
  if (!day || !time) return null;
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    time.getHours(),
    time.getMinutes(),
    0,
    0
  );
};

function AttendanceDetail() {
  const dispatch = useDispatch();
  const { userId, workingDate } = useParams();
  const { setTitle } = usePageTitle();
  const currentUser = useSelector(selectUser);
  const allowedPermissions = useSelector(selectPermissions);
  const { list: users } = useSelector((state) => state.users);
  const { detail, detailBreaks, detailActivities, detailLoading } = useSelector(
    (state) => state.attendance
  );

  const canEditWorkAttendance = hasPermission(
    allowedPermissions,
    "edit_users_time_stamp_attendance"
  );
  const canUpdateOthersDayOutRemark = hasPermission(
    allowedPermissions,
    "attendance_user_day_out_remark_update"
  );

  const workingDateKey = toDateOnlyString(workingDate);
  // URL may be /attendance/:date (own) or /users/:userId/attendance/:date
  const targetUserId = userId || currentUser?.id;
  const isViewingOtherUser = Boolean(userId);
  const isOwnAttendance =
    currentUser?.id != null &&
    String(currentUser.id) === String(targetUserId);

  const targetUser = useMemo(() => {
    const fromList = users.find((u) => String(u.id) === String(targetUserId));
    if (fromList) return fromList;
    if (currentUser && String(currentUser.id) === String(targetUserId)) {
      return currentUser;
    }
    if (detail?.user_name) {
      return { id: targetUserId, name: detail.user_name };
    }
    return null;
  }, [users, currentUser, targetUserId, detail?.user_name]);

  const targetUserName =
    targetUser?.name || detail?.user_name || `User #${targetUserId}`;

  const [formTimes, setFormTimes] = useState({
    checkin_time: null,
    checkout_time: null,
    lunch_in: null,
    lunch_out: null,
  });
  const [saving, setSaving] = useState(false);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [breakForm, setBreakForm] = useState({
    id: null,
    break_out: null, // UI Break In
    break_in: null, // UI Break Out
    original_break_out: null,
    original_break_in: null,
  });
  const [breakSaving, setBreakSaving] = useState(false);
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [remarkText, setRemarkText] = useState("");
  const [remarkSaving, setRemarkSaving] = useState(false);

  // Button only when Day Out is set AND (own attendance OR remark permission)
  const canEditDayOutRemark =
    Boolean(detail?.checkout_time) &&
    (isOwnAttendance || canUpdateOthersDayOutRemark);

  useEffect(() => {
    if (!users || users.length === 0) {
      dispatch(fetchUsers());
    }
  }, [dispatch, users]);

  useEffect(() => {
    if (targetUserId && workingDateKey) {
      dispatch(
        fetchAttendanceDetail({
          userId: targetUserId,
          workingDate: workingDateKey,
        })
      );
    }
  }, [dispatch, targetUserId, workingDateKey]);

  useEffect(() => {
    if (!detail) return;
    setFormTimes({
      checkin_time: parseToLocalDate(detail.checkin_time),
      checkout_time: parseToLocalDate(detail.checkout_time),
      lunch_in: parseToLocalDate(detail.lunch_in),
      lunch_out: parseToLocalDate(detail.lunch_out),
    });
  }, [detail]);

  const formatDisplayDate = (value) => {
    const date = dateOnlyToLocalDate(value);
    if (!date) return workingDateKey || "-";
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  useLayoutEffect(() => {
    if (isViewingOtherUser) {
      setTitle(
        <>
          <Link to="/users" className="text-blue-600 hover:underline">
            Users
          </Link>{" "}
          &gt;{" "}
          <Link
            to={`/users/${targetUserId}/attendance`}
            className="text-blue-600 hover:underline"
          >
            {targetUserName}
          </Link>{" "}
          &gt; Attendance &gt; {formatDisplayDate(workingDateKey)}
        </>
      );
    } else {
      setTitle(
        <>
          <Link to="/attendance" className="text-blue-600 hover:underline">
            Attendance
          </Link>{" "}
          &gt; {formatDisplayDate(workingDateKey)}
        </>
      );
    }
  }, [
    setTitle,
    isViewingOtherUser,
    targetUserId,
    targetUserName,
    workingDateKey,
  ]);

  const formatTime = (value) => {
    if (!value) return "-";
    const date = parseToLocalDate(value);
    if (!date) return "-";
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Order activity: time only. Attendance edits: date + time (edit may be on another day)
  const formatActivityClock = (dateString, withDate = false) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    if (!withDate) return timeStr;
    const dateStr = date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `${dateStr}, ${timeStr}`;
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const parseActivityJson = (value) => {
    if (!value) return null;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(value);
    } catch (err) {
      return null;
    }
  };

  // Same title pattern as Order Details recent activity
  const getActivityTitle = (item) => {
    if (item.source === "attendance") {
      const by = item.changed_by_name || "Someone";
      const newData = parseActivityJson(item.new_data);
      if (item.action === "update_work_times") {
        const keys =
          newData && typeof newData === "object"
            ? Object.keys(newData).filter((k) =>
                [
                  "checkin_time",
                  "checkout_time",
                  "lunch_in",
                  "lunch_out",
                ].includes(k)
              )
            : [];
        const label =
          keys.length > 0
            ? keys
                .map(
                  (k) =>
                    ({
                      checkin_time: "Day In",
                      checkout_time: "Day Out",
                      lunch_in: "Lunch In",
                      lunch_out: "Lunch Out",
                    })[k]
                )
                .join(", ")
            : "work times";
        return `Updated ${label} by ${by}`;
      }
      if (item.action === "update_break_times") {
        return `Updated break times by ${by}`;
      }
      if (item.action === "update_checkout_remarks") {
        return `Updated day out remark by ${by}`;
      }
      return `Attendance updated by ${by}`;
    }

    const by = item.changed_by_name || "Someone";
    const status = item.status_name;
    const extra = item.activity_extra;
    if (status && extra) return `${status} by ${by} [ ${extra} ]`;
    if (status) return `${status} by ${by}`;
    if (extra) return `${extra} by ${by}`;
    return `Activity by ${by}`;
  };

  const getActivityOrderMeta = (item) => {
    if (item.source === "attendance") return null;
    const parts = [
      item.order_number || null,
      item.customer_name_2 || null,
      item.bank_name || null,
      item.category_name || null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  };

  const refreshDetail = () => {
    if (targetUserId && workingDateKey) {
      dispatch(
        fetchAttendanceDetail({
          userId: targetUserId,
          workingDate: workingDateKey,
        })
      );
    }
  };

  const breakRows = useMemo(() => {
    return (detailBreaks || []).map((br, index) => ({
      ...br,
      rowNo: index + 1,
    }));
  }, [detailBreaks]);

  const toMinuteKey = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return [
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
    ].join("-");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canEditWorkAttendance || !workingDateKey) return;

    const checkin = combineWorkingDateAndTime(
      workingDateKey,
      formTimes.checkin_time
    );
    const checkout = combineWorkingDateAndTime(
      workingDateKey,
      formTimes.checkout_time
    );
    const lunchIn = combineWorkingDateAndTime(
      workingDateKey,
      formTimes.lunch_in
    );
    const lunchOut = combineWorkingDateAndTime(
      workingDateKey,
      formTimes.lunch_out
    );

    if (checkin && checkout && checkout < checkin) {
      toast.error("Day Out cannot be before Day In");
      return;
    }
    if (lunchIn && lunchOut && lunchOut < lunchIn) {
      toast.error("Lunch Out cannot be before Lunch In");
      return;
    }
    if (lunchOut && !lunchIn) {
      toast.error("Lunch In is required before Lunch Out");
      return;
    }

    // Only send fields that actually changed vs loaded detail
    const original = {
      checkin_time: combineWorkingDateAndTime(
        workingDateKey,
        parseToLocalDate(detail?.checkin_time)
      ),
      checkout_time: combineWorkingDateAndTime(
        workingDateKey,
        parseToLocalDate(detail?.checkout_time)
      ),
      lunch_in: combineWorkingDateAndTime(
        workingDateKey,
        parseToLocalDate(detail?.lunch_in)
      ),
      lunch_out: combineWorkingDateAndTime(
        workingDateKey,
        parseToLocalDate(detail?.lunch_out)
      ),
    };
    const next = {
      checkin_time: checkin,
      checkout_time: checkout,
      lunch_in: lunchIn,
      lunch_out: lunchOut,
    };

    const payload = {
      user_id: targetUserId,
      working_date: workingDateKey,
    };
    Object.keys(next).forEach((key) => {
      if (toMinuteKey(original[key]) !== toMinuteKey(next[key])) {
        payload[key] = next[key] ? next[key].toISOString() : null;
      }
    });

    if (Object.keys(payload).length <= 2) {
      toast.info("No changes to save");
      return;
    }

    setSaving(true);
    try {
      await dispatch(updateAttendanceWorkTimes(payload)).unwrap();
      refreshDetail();
    } catch (err) {
      // toast in reducer
    } finally {
      setSaving(false);
    }
  };

  const timePickerProps = {
    showTimeSelect: true,
    showTimeSelectOnly: true,
    timeIntervals: 1,
    timeCaption: "Time",
    dateFormat: "h:mm aa",
    className: "form-field",
    isClearable: true,
    portalId: "datepicker-portal",
    popperPlacement: "bottom-start",
    popperClassName: "user-day-time-picker-popper",
    popperProps: { strategy: "fixed" },
  };

  const openBreakModal = (br) => {
    if (!canEditWorkAttendance || !br?.id) return;
    const breakOut = parseToLocalDate(br.break_out);
    const breakIn = parseToLocalDate(br.break_in);
    setBreakForm({
      id: br.id,
      break_out: breakOut,
      break_in: breakIn,
      original_break_out: breakOut,
      original_break_in: breakIn,
    });
    setShowBreakModal(true);
  };

  const handleBreakSave = async (e) => {
    e.preventDefault();
    if (!canEditWorkAttendance || !breakForm.id || !workingDateKey) return;

    const nextOut = combineWorkingDateAndTime(
      workingDateKey,
      breakForm.break_out
    );
    const nextIn = combineWorkingDateAndTime(
      workingDateKey,
      breakForm.break_in
    );
    const originalOut = combineWorkingDateAndTime(
      workingDateKey,
      breakForm.original_break_out
    );
    const originalIn = combineWorkingDateAndTime(
      workingDateKey,
      breakForm.original_break_in
    );

    if (nextOut && nextIn && nextIn < nextOut) {
      toast.error("Break Out cannot be before Break In");
      return;
    }

    const data = {};
    if (toMinuteKey(originalOut) !== toMinuteKey(nextOut)) {
      data.break_out = nextOut ? nextOut.toISOString() : null;
    }
    if (toMinuteKey(originalIn) !== toMinuteKey(nextIn)) {
      data.break_in = nextIn ? nextIn.toISOString() : null;
    }

    if (Object.keys(data).length === 0) {
      toast.info("No changes to save");
      return;
    }

    setBreakSaving(true);
    try {
      await dispatch(
        updateBreakWorkTimes({ id: breakForm.id, data })
      ).unwrap();
      setShowBreakModal(false);
      refreshDetail();
    } catch (err) {
      // toast in reducer
    } finally {
      setBreakSaving(false);
    }
  };

  const openRemarkModal = () => {
    if (!canEditDayOutRemark) return;
    setRemarkText(detail?.checkout_remarks || "");
    setShowRemarkModal(true);
  };

  const handleRemarkSave = async (e) => {
    e.preventDefault();
    if (!canEditDayOutRemark || !targetUserId || !workingDateKey) return;

    setRemarkSaving(true);
    try {
      await dispatch(
        updateAttendanceCheckoutRemarks({
          user_id: targetUserId,
          working_date: workingDateKey,
          checkout_remarks: remarkText,
        })
      ).unwrap();
      setShowRemarkModal(false);
      refreshDetail();
    } catch (err) {
      // toast in reducer
    } finally {
      setRemarkSaving(false);
    }
  };

  if (!workingDateKey) {
    return (
      <div className="height-full-occupied attendance-container">
        <p>Invalid date</p>
      </div>
    );
  }

  return (
    <div className="height-full-occupied attendance-container">
      <div className="attendance-detail-page">
        {detailLoading ? (
          <p>Loading...</p>
        ) : (
          <>
          <div
            className={`attendance-detail-row${
              canEditWorkAttendance ? "" : " attendance-detail-row--breaks-only"
            }`}
          >
            <div className="attendance-detail-breaks">
              <h3 className="attendance-detail-section-title">
                Breaks — {formatDisplayDate(workingDateKey)}
              </h3>
              <div className="attendance-detail-breaks-card">
                <table className="attendance-detail-breaks-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Break In</th>
                      <th>Break Out</th>
                      {canEditWorkAttendance && (
                        <th style={{ width: "90px", textAlign: "center" }}>
                          Action
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {breakRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={canEditWorkAttendance ? 4 : 3}
                          className="attendance-detail-empty"
                        >
                          No breaks for this day
                        </td>
                      </tr>
                    ) : (
                      breakRows.map((br) => (
                        <tr key={br.id || `break-${br.rowNo}`}>
                          <td>{br.rowNo}</td>
                          <td>{formatTime(br.break_out)}</td>
                          <td>{formatTime(br.break_in)}</td>
                          {canEditWorkAttendance && (
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className="action-icons"
                                title="Edit break"
                                onClick={() => openBreakModal(br)}
                                disabled={!br.id}
                              >
                                <EditIcon />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {canEditWorkAttendance && (
              <div className="attendance-detail-edit">
                <h3 className="attendance-detail-section-title">
                  Work times
                </h3>
                <form className="body-form-box" onSubmit={handleSave}>
                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="detail_day_in">Day In</label>
                      <DatePicker
                        id="detail_day_in"
                        selected={formTimes.checkin_time}
                        onChange={(date) =>
                          setFormTimes((prev) => ({
                            ...prev,
                            checkin_time: date,
                          }))
                        }
                        placeholderText="Select Day In"
                        {...timePickerProps}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="detail_day_out">Day Out</label>
                      <DatePicker
                        id="detail_day_out"
                        selected={formTimes.checkout_time}
                        onChange={(date) =>
                          setFormTimes((prev) => ({
                            ...prev,
                            checkout_time: date,
                          }))
                        }
                        placeholderText="Select Day Out"
                        {...timePickerProps}
                      />
                    </div>
                  </div>
                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="detail_lunch_in">Lunch In</label>
                      <DatePicker
                        id="detail_lunch_in"
                        selected={formTimes.lunch_in}
                        onChange={(date) =>
                          setFormTimes((prev) => ({
                            ...prev,
                            lunch_in: date,
                          }))
                        }
                        placeholderText="Select Lunch In"
                        {...timePickerProps}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="detail_lunch_out">Lunch Out</label>
                      <DatePicker
                        id="detail_lunch_out"
                        selected={formTimes.lunch_out}
                        onChange={(date) =>
                          setFormTimes((prev) => ({
                            ...prev,
                            lunch_out: date,
                          }))
                        }
                        placeholderText="Select Lunch Out"
                        {...timePickerProps}
                      />
                    </div>
                  </div>
                  <div className="form-buttons">
                    <button
                      className="submit-button"
                      type="submit"
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save Times"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <div className="attendance-detail-meta-row">
            <div className="attendance-detail-activity">
              <h3 className="attendance-detail-section-title">
                Activity by the user on the date
              </h3>
              <div className="activities-wrapper">
                <div className="activities">
                  {detailActivities && detailActivities.length > 0 ? (
                    detailActivities.map((item) => {
                      const orderMeta = getActivityOrderMeta(item);
                      const isAttendanceEdit = item.source === "attendance";
                      return (
                        <div
                          className="activity"
                          key={`${item.source || "order"}-${item.id}`}
                        >
                          <div className="activity-icon bg-primary text-white">
                            {getInitials(item.changed_by_name)}
                          </div>
                          <div className="activity-detail">
                            <div className="activity-title-row">
                              <p className="activity-description">
                                {getActivityTitle(item)}
                              </p>
                              <p className="activity-time">
                                {formatActivityClock(
                                  item.activity_at ||
                                    item.changed_at ||
                                    item.created_at,
                                  isAttendanceEdit
                                )}
                              </p>
                            </div>
                            {orderMeta && (
                              <p className="activity-order-meta">
                                {orderMeta}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="attendance-detail-empty-inline">
                      No recent activity for this day
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="attendance-detail-remarks">
              <div className="attendance-detail-remarks-header">
                <h3 className="attendance-detail-section-title">
                  Day Out Remarks
                </h3>
                {canEditDayOutRemark && (
                  <button
                    type="button"
                    className="btn attendance-detail-remark-btn"
                    onClick={openRemarkModal}
                  >
                    Add or Update Remark
                  </button>
                )}
              </div>
              <div className="attendance-detail-remarks-card">
                {detail?.checkout_remarks ? (
                  <p className="attendance-detail-remarks-text">
                    {detail.checkout_remarks}
                  </p>
                ) : (
                  <p className="attendance-detail-empty-inline">
                    No remarks added on day out
                  </p>
                )}
              </div>
            </div>
          </div>
          </>
        )}
      </div>

      {showBreakModal && canEditWorkAttendance && (
        <FormModel>
          {{
            title: "Edit Break Times",
            body: (
              <form className="body-form-box" onSubmit={handleBreakSave}>
                <div className="body-form-box">
                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="break_edit_in">Break In</label>
                      <DatePicker
                        id="break_edit_in"
                        selected={breakForm.break_out}
                        onChange={(date) =>
                          setBreakForm((prev) => ({
                            ...prev,
                            break_out: date,
                          }))
                        }
                        placeholderText="Select Break In"
                        {...timePickerProps}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="break_edit_out">Break Out</label>
                      <DatePicker
                        id="break_edit_out"
                        selected={breakForm.break_in}
                        onChange={(date) =>
                          setBreakForm((prev) => ({
                            ...prev,
                            break_in: date,
                          }))
                        }
                        placeholderText="Select Break Out"
                        {...timePickerProps}
                      />
                    </div>
                  </div>
                  <div className="form-buttons">
                    <button
                      className="submit-button"
                      type="submit"
                      disabled={breakSaving}
                    >
                      {breakSaving ? "Saving..." : "Save Break Times"}
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => setShowBreakModal(false),
          }}
        </FormModel>
      )}

      {showRemarkModal && canEditDayOutRemark && (
        <FormModel>
          {{
            title: "Add or Update Remark",
            body: (
              <form className="body-form-box" onSubmit={handleRemarkSave}>
                <div className="body-form-box">
                  <div className="form-group">
                    <label htmlFor="day_out_remark">Day Out Remark</label>
                    <textarea
                      className="form-field"
                      id="day_out_remark"
                      name="day_out_remark"
                      rows="4"
                      value={remarkText}
                      onChange={(e) => setRemarkText(e.target.value)}
                      placeholder="Enter remarks"
                    />
                  </div>
                  <div className="form-buttons">
                    <button
                      className="submit-button"
                      type="submit"
                      disabled={remarkSaving}
                    >
                      {remarkSaving ? "Saving..." : "Save Remark"}
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => {
              setShowRemarkModal(false);
              setRemarkText("");
            },
          }}
        </FormModel>
      )}
    </div>
  );
}

export default AttendanceDetail;
