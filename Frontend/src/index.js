import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./assets/styles/globle.scss";
import reportWebVitals from "./reportWebVitals";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";

import "react-toastify/dist/ReactToastify.css";
import { toast, ToastContainer } from "react-toastify";

import store from "./redux/store";

import { isTokenExpired } from "./utils/authUtils";

// --- Token Expiry Check ---
const token = localStorage.getItem("token");
if (token && isTokenExpired(token)) {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  toast.info("Session expired. Please login again.");
  window.location.href = "/login"; // redirect to login
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
        <ToastContainer position="top-right" autoClose={3000} />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
