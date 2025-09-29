import "./Login.scss";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { login } from "../../redux/reducers/authReducer";
import { Link, Navigate } from "react-router-dom";

import { Eye, EyeOff } from "lucide-react";
import { PasswordIcon, UserIcon } from "../../components/icons";
export default function Login() {
  /* ==== hooks ==== */
  const dispatch = useDispatch(); // Dispatch function to trigger actions
  const { loading, token } = useSelector((state) => state.auth); // Access auth state from Redux store

  /* ==== useSTates ==== */
  const [form, setForm] = useState({ username: "", password: "" }); // Initial form state
  const [showPassword, setShowPassword] = useState(false); // Toggle password visibility

  /* ==== handlers ==== */
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  }; // Handle input changes

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(login(form));
  }; // Handle form submission

  if (token) return <Navigate to="/" />;

  return (
    <>
      <section className="login-page-wrapper">
        <div className="container">
          <div className="row">
            <div className="col-12 col-sm-8 offset-sm-2 col-md-6 offset-md-3 col-lg-6 offset-lg-3 col-xl-5 offset-xl-5 remove-grid-margin">
              <h2 className="login-brand">Valuetech Solutions</h2>
              <div className="card card-primary">
                <div className="card-header">
                  <h4>Login to your account</h4>
                </div>
                <div className="card-body">
                  <form
                    method="POST"
                    className="needs-validation"
                    onSubmit={handleSubmit}
                  >
                    <div className="form-group">
                      <div className="have-field-with-icon">
                        <div className="input-icon">
                          <UserIcon />
                        </div>
                        <input
                          id="username"
                          type="text"
                          className="form-control"
                          name="username"
                          tabIndex="1"
                          placeholder="Username"
                          onChange={handleChange}
                          required
                          autoFocus
                        />
                        <div className="invalid-feedback">
                          Please fill in your username
                        </div>
                      </div>
                    </div>
                    <div className="form-group">
                      <div className="password-container have-field-with-icon">
                        <div className="input-icon">
                          <PasswordIcon />
                        </div>
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          className="form-control"
                          name="password"
                          tabIndex="2"
                          placeholder="Password"
                          onChange={handleChange}
                          required
                        />
                        <div
                          className="password-eye"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff size={20} />
                          ) : (
                            <Eye size={20} />
                          )}
                        </div>
                      </div>
                      <div className="invalid-feedback">
                        please fill in your password
                      </div>
                    </div>
                    <div className="forgot-password">
                      <div className="float-right">
                        <Link to="/auth/forgot-password" className="text-small">
                          Forgot Password?
                        </Link>
                      </div>
                    </div>
                    <div className="form-group">
                      <button
                        type="submit"
                        className="btn btn-primary btn-lg btn-block"
                        tabIndex="4"
                        disabled={loading}
                      >
                        Login
                      </button>
                    </div>
                  </form>
                </div>
              </div>
              {/*  <div className="mt-5 text-muted text-center">
                Don't have an account?{" "}
                <a href="auth-register.html">Create One</a>
              </div> */}
            </div>
          </div>
        </div>
      </section>
      {/*  <form onSubmit={handleSubmit}>
      <input name="username" onChange={handleChange} required placeholder="Username" />
      <input name="password" type="password" onChange={handleChange} required placeholder="Password" />
      <button type="submit" disabled={loading}>Login</button>
    </form> */}
    </>
  );
}
