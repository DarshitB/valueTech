import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { fetchAttendanceByUserId } from "../../redux/reducers/attendanceReducer";
import CustomDataTable from "../../components/CustomDataTable";
import { selectUser } from "../../redux/selectors/authSelectors";
import "../../pages/dashboard/dashboard.scss";

function Attendance() {
  const dispatch = useDispatch();
  const { userId } = useParams(); // Get userId from URL params if viewing someone else's attendance

  /* get logged user */
  const currentUser = useSelector(selectUser);

  // Redux data
  const { list: attendanceList, loading } = useSelector(
    (state) => state.attendance
  );

  // State for real-time clock updates
  const [currentTime, setCurrentTime] = useState(new Date());

  // Determine which user's attendance to show
  const targetUserId = userId || currentUser?.id;

  // Fetch attendance on mount and when userId changes
  useEffect(() => {
    if (targetUserId) {
      dispatch(fetchAttendanceByUserId(targetUserId));
    }
  }, [dispatch, targetUserId]);

  // Update current time every second for real-time clock
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Calculate today's working hours
  const calculateTodayWorkingHours = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecords = attendanceList.filter((record) => {
      const recordDate = new Date(record.working_date);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === today.getTime();
    });

    let totalSeconds = 0;
    todayRecords.forEach((record) => {
      if (record.checkin_time && record.checkout_time) {
        const checkin = new Date(record.checkin_time);
        const checkout = new Date(record.checkout_time);
        const diffSeconds = (checkout - checkin) / 1000;
        totalSeconds += diffSeconds;
      } else if (record.checkin_time && !record.checkout_time) {
        // Active session - use current time
        const checkin = new Date(record.checkin_time);
        const diffSeconds = (currentTime - checkin) / 1000;
        totalSeconds += diffSeconds;
      }
    });

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.round(totalSeconds % 60);

    // Check if there's an active session (checkin without checkout) - then show seconds
    const hasActiveSession = todayRecords.some(
      (record) => record.checkin_time && !record.checkout_time
    );

    if (hasActiveSession && seconds >= 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${hours}h ${minutes}m`;
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

    let totalSeconds = 0;
    monthRecords.forEach((record) => {
      if (record.checkin_time && record.checkout_time) {
        const checkin = new Date(record.checkin_time);
        const checkout = new Date(record.checkout_time);
        const diffSeconds = (checkout - checkin) / 1000;
        totalSeconds += diffSeconds;
      } else if (record.checkin_time && !record.checkout_time) {
        // Active session - use current time
        const checkin = new Date(record.checkin_time);
        const diffSeconds = (currentTime - checkin) / 1000;
        totalSeconds += diffSeconds;
      }
    });

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.round(totalSeconds % 60);

    // Check if there's an active session - then show seconds
    const hasActiveSession = monthRecords.some(
      (record) => record.checkin_time && !record.checkout_time
    );

    if (hasActiveSession && seconds >= 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${hours}h ${minutes}m`;
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
        const checkin = new Date(record.checkin_time);
        const checkout = new Date(record.checkout_time);
        const diffMinutes = (checkout - checkin) / (1000 * 60);
        const workingHours = diffMinutes / 60;

        // If working hours > 8, calculate overtime (anything beyond 8 hours)
        if (workingHours > 8) {
          const overtimeHours = workingHours - 8;
          totalOvertimeMinutes += overtimeHours * 60;
        }
      } else if (record.checkin_time && !record.checkout_time) {
        // Active session - use current time
        const checkin = new Date(record.checkin_time);
        const diffMinutes = (currentTime - checkin) / (1000 * 60);
        const workingHours = diffMinutes / 60;

        // If working hours > 8, calculate overtime (anything beyond 8 hours)
        if (workingHours > 8) {
          const overtimeHours = workingHours - 8;
          totalOvertimeMinutes += overtimeHours * 60;
        }
      }
    });

    const hours = Math.floor(totalOvertimeMinutes / 60);
    const minutes = Math.round(totalOvertimeMinutes % 60);
    return `${hours}h ${minutes}m`;
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
        const checkin = new Date(record.checkin_time);
        const checkout = new Date(record.checkout_time);
        const diffMinutes = (checkout - checkin) / (1000 * 60);
        const workingHours = diffMinutes / 60;

        // If working hours > 8, calculate overtime (anything beyond 8 hours)
        if (workingHours > 8) {
          const overtimeHours = workingHours - 8;
          totalOvertimeMinutes += overtimeHours * 60;
        }
      } else if (record.checkin_time && !record.checkout_time) {
        // Active session - use current time
        const checkin = new Date(record.checkin_time);
        const diffMinutes = (currentTime - checkin) / (1000 * 60);
        const workingHours = diffMinutes / 60;

        // If working hours > 8, calculate overtime (anything beyond 8 hours)
        if (workingHours > 8) {
          const overtimeHours = workingHours - 8;
          totalOvertimeMinutes += overtimeHours * 60;
        }
      }
    });

    const hours = Math.floor(totalOvertimeMinutes / 60);
    const minutes = Math.round(totalOvertimeMinutes % 60);
    return `${hours}h ${minutes}m`;
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
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

  // Calculate hours worked for a record
  const calculateHoursWorked = (checkinTime, checkoutTime) => {
    if (!checkinTime || !checkoutTime) return "-";
    const checkin = new Date(checkinTime);
    const checkout = new Date(checkoutTime);
    const diffMinutes = (checkout - checkin) / (1000 * 60);
    const hours = Math.floor(diffMinutes / 60);
    const minutes = Math.round(diffMinutes % 60);
    return `${hours}h ${minutes}m`;
  };

  // Sort attendance list by working date descending (newest first)
  const sortedAttendanceList = [...attendanceList].sort((a, b) => {
    const dateA = new Date(a.working_date);
    const dateB = new Date(b.working_date);
    return dateB - dateA;
  });

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
            <div className="col-xl-3 col-lg-6 col-md-6 col-sm-12 col-xs-12">
              <div className="padding-top-bottom">
                <div className="sneak-peek-card today-orders light">
                  <h3>Today's Overtime Hours</h3>
                  <p>{calculateTodayOvertimeHours()}</p>
                </div>
              </div>
            </div>
            <div className="col-xl-3 col-lg-6 col-md-6 col-sm-12 col-xs-12">
              <div className="padding-top-bottom">
                <div className="sneak-peek-card today-orders light">
                  <h3>This Month Total Overtime Hours</h3>
                  <p>{calculateMonthOvertimeHours()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Data Table */}
      <div className="attendance-data-table">
        {loading ? (
          <p>Loading...</p>
        ) : (
          <CustomDataTable showEntriesSelector={true} showFooter={true}>
            {{
              header: (
                <tr>
                  <th style={{ width: "52px" }}>ID</th>
                  <th style={{ width: "200px" }}>Working Date</th>
                  <th style={{ width: "150px" }}>Checkin Time</th>
                  <th style={{ width: "150px" }}>Checkout Time</th>
                  <th>Checkout Remarks</th>
                  <th style={{ width: "150px" }}>Hours Worked</th>
                </tr>
              ),
              rows: sortedAttendanceList.map((record, index) => (
                <tr key={record.id}>
                  <td className="sequential-number">{index + 1}</td>
                  <td>{formatDate(record.working_date)}</td>
                  <td>{formatTime(record.checkin_time)}</td>
                  <td>{formatTime(record.checkout_time)}</td>
                  <td>{record.checkout_remarks || "-"}</td>
                  <td>
                    {calculateHoursWorked(
                      record.checkin_time,
                      record.checkout_time
                    )}
                  </td>
                </tr>
              )),
            }}
          </CustomDataTable>
        )}
      </div>
    </div>
  );
}

export default Attendance;
