import "./Login.scss";
import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { verifyOtp, generateOtp } from "../../redux/reducers/authReducer";
import { Navigate, useNavigate } from "react-router-dom";

export default function OTPPage() {
  /* ==== hooks ==== */
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { token, user, otpLoading, otpVerified, tempPassword } = useSelector(
    (state) => state.auth
  );

  /* ==== useSTates ==== */
  const [form, setForm] = useState({ username: "", otp: "" });
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [isResendDisabled, setIsResendDisabled] = useState(true);
  const [timerKey, setTimerKey] = useState(0); // Key to reset timer
  const otpInputRefs = useRef([]);

  /* ==== handlers ==== */
  const handleOtpChange = (index, value) => {
    // Only allow single digit
    if (value.length > 1) {
      return;
    }
    // Only allow numbers
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newOtpDigits = [...otpDigits];
    newOtpDigits[index] = value;
    setOtpDigits(newOtpDigits);

    // Update form.otp
    const otpValue = newOtpDigits.join("");
    setForm({ ...form, otp: otpValue });

    // Auto-focus next input if value entered
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();
    
    // Only allow 6 digits
    if (!/^\d{6}$/.test(pastedData)) {
      return;
    }

    const digits = pastedData.split("");
    setOtpDigits(digits);
    setForm({ ...form, otp: pastedData });
    
    // Focus last input
    otpInputRefs.current[5]?.focus();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const otpValue = otpDigits.join("");
    if (!otpValue || otpValue.length !== 6) {
      return;
    }
    // Ensure username is included in payload (auto-filled from logged-in user)
    const username = form.username || user?.email || user?.username || "";
    if (!username) {
      alert("Unable to verify Login Code. Please login again.");
      return;
    }
    // Submit with username in payload (even though it's not shown in UI)
    dispatch(verifyOtp({ username, otp: otpValue }));
  };

  const handleResendOtp = async (e) => {
    e.preventDefault();
    if (isResendDisabled) {
      return;
    }

    const username = form.username || user?.email || user?.username || "";
    if (!username) {
      alert("Unable to resend OTP. Please login again.");
      return;
    }

    // If we have temp password from login, use it
    if (tempPassword) {
      try {
        await dispatch(generateOtp({ username, password: tempPassword })).unwrap();
        // Reset timer after successful resend
        setTimerKey((prev) => prev + 1);
        // Clear OTP input fields
        setOtpDigits(["", "", "", "", "", ""]);
        setForm((prev) => ({ ...prev, otp: "" }));
        // Focus first input
        otpInputRefs.current[0]?.focus();
      } catch (err) {
        // Error is already handled by generateOtp thunk (toast shown)
        console.error("Failed to resend OTP:", err);
      }
    } else {
      // If no temp password, user needs to login again
      alert("Unable to resend OTP. Please login again.");
    }
  };

  // Auto-fill username from logged-in user if available
  useEffect(() => {
    if (user?.email) {
      setForm((prev) => ({ ...prev, username: user.email }));
    } else if (user?.username) {
      setForm((prev) => ({ ...prev, username: user.username }));
    }
  }, [user]);

  // Start countdown timer when component mounts or when timer resets
  useEffect(() => {
    // Start timer immediately when OTP page loads or when reset
    setTimeLeft(300); // 5 minutes
    setIsResendDisabled(true);

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsResendDisabled(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timerKey]); // Reset when timerKey changes

  // Redirect after successful OTP verification
  useEffect(() => {
    if (otpVerified && token) {
      navigate("/dashboard");
    }
  }, [otpVerified, token, navigate]);

  // Redirect to login if not authenticated
  if (!token) {
    return <Navigate to="/login" />;
  }

  // Check if user actually needs OTP
  const userRole = user?.role?.name || "";
  const needsOtp =
    user?.permissions?.includes("need_otp_access") &&
    userRole.toLowerCase() !== "developer_admin";

  // If user doesn't need OTP or is already verified, redirect to dashboard
  if (!needsOtp || otpVerified) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <>
      <section className="login-page-wrapper">
        <div className="container">
          <div className="row">
            <div className="col-12 col-sm-8 offset-sm-2 col-md-6 offset-md-3 col-lg-6 offset-lg-3 col-xl-5 offset-xl-5 remove-grid-margin">
              <h2 className="login-brand">Valuetech Solutions</h2>
              <div className="card card-primary">
                <div className="card-header">
                  <h4>Verify Login Code</h4>
                </div>
                <div className="card-body">
                  <form
                    method="POST"
                    className="needs-validation"
                    onSubmit={handleSubmit}
                  >
                    <div className="form-group">
                      <div className="otp-container">
                        {otpDigits.map((digit, index) => (
                          <input
                            key={index}
                            ref={(el) => (otpInputRefs.current[index] = el)}
                            type="text"
                            className="otp-input"
                            value={digit}
                            onChange={(e) => handleOtpChange(index, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(index, e)}
                            onPaste={index === 0 ? handleOtpPaste : undefined}
                            maxLength="1"
                            inputMode="numeric"
                            autoFocus={index === 0}
                            tabIndex={index + 1}
                          />
                        ))}
                      </div>
                      <div className="invalid-feedback">
                        Please enter the 6-digit OTP
                      </div>
                    </div>
                    <div className="forgot-password">
                      <div className="float-right" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {timeLeft > 0 && (
                          <span className="text-small" style={{ fontSize: "12px", color: "#666" }}>
                            Resend OTP in {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
                          </span>
                        )}
                        <button
                          type="button"
                          className="text-small"
                          onClick={handleResendOtp}
                          disabled={isResendDisabled}
                          style={{
                            background: "none",
                            border: "none",
                            color: isResendDisabled ? "#999" : "inherit",
                            cursor: isResendDisabled ? "not-allowed" : "pointer",
                            textDecoration: "underline",
                            opacity: isResendDisabled ? 0.5 : 1,
                          }}
                        >
                          Resend OTP?
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <button
                        type="submit"
                        className="btn btn-primary btn-lg btn-block"
                        tabIndex="7"
                        disabled={otpLoading}
                      >
                        {otpLoading ? "Verifying..." : "Verify Login Code"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
