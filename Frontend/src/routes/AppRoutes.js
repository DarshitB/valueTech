import React from "react";
import { Route, Routes } from "react-router-dom";

import ProtectedRoute from "./ProtectedRoute";

import Login from "../pages/auth/Login";
import Dashboard from "../pages/dashboard/dashboard";
import Layout from "../layout/Layout";
import Orders from "../pages/orders/Orders";
import OrderHistory from "../pages/orders/order-history/OrderHistory";
import FieldVerifier from "../pages/field-verifier/FieldVerifier";
import Users from "../pages/users/Users";
import Permissions from "../pages/permissions/Permissions";
import Banks from "../pages/banks/Banks";
import Categories from "../pages/categories/Categories";
import NotFound from "../pages/NotFound";
import States from "../pages/locations/States";
import Cities from "../pages/locations/Cities";
import BankBranches from "../pages/banks/BankBranchs";
import SubCategories from "../pages/categories/SubCategories";
import ChildCategories from "../pages/categories/ChildCategories";
import Officers from "../pages/banks/Officers";
import OrderDetails from "../pages/orders/OrderDetails";
import OrderImages from "../pages/orders/OrderImages";
import OrderDocuments from "../pages/orders/OrderDocuments";
import CVReport from "../pages/orders/reports/CVReport";
import AVRReport from "../pages/orders/reports/AVRReport";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route
          index
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="orders"
          element={
            <ProtectedRoute permission="view_order">
              <Orders />
            </ProtectedRoute>
          }
        />
        <Route
          path="orders/:id/details"
          element={
            <ProtectedRoute permission="view_order_details">
              <OrderDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="orders/:id/details/images"
          element={
            <ProtectedRoute permission="view_order_media_files">
              <OrderImages />
            </ProtectedRoute>
          }
        />
        <Route
          path="orders/:id/details/documents"
          element={
            <ProtectedRoute permission="view_order_media_documents">
              <OrderDocuments />
            </ProtectedRoute>
          }
        />
        <Route
          path="orders/:id/details/cv-report"
          element={
            <ProtectedRoute permission="view_order_details">
              <CVReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="orders/:id/details/avr-report"
          element={
            <ProtectedRoute permission="view_order_details">
              <AVRReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="order-history"
          element={
            <ProtectedRoute permission="view_order_history">
              <OrderHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="field-verifier"
          element={
            <ProtectedRoute permission="view_field_verifier">
              <FieldVerifier />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute permission="view_user">
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="permissions"
          element={
            <ProtectedRoute permission="view_permission">
              <Permissions />
            </ProtectedRoute>
          }
        />
        <Route
          path="banks"
          element={
            <ProtectedRoute permission="view_bank">
              <Banks />
            </ProtectedRoute>
          }
        />
        <Route
          path="banks/:id/branches"
          element={
            <ProtectedRoute permission="view_bank_branch">
              <BankBranches />
            </ProtectedRoute>
          }
        />
        <Route
          path="officers"
          element={
            <ProtectedRoute permission="view_branch_officer">
              <Officers />
            </ProtectedRoute>
          }
        />
        <Route
          path="categories"
          element={
            <ProtectedRoute permission="view_category">
              <Categories />
            </ProtectedRoute>
          }
        />
        <Route
          path="categories/:id/subcategories"
          element={
            <ProtectedRoute permission="view_sub_category">
              <SubCategories />
            </ProtectedRoute>
          }
        />
        <Route
          path="categories/:categoryId/subcategories/:subCategoryId/childcategories"
          element={
            <ProtectedRoute permission="view_child_category">
              <ChildCategories />
            </ProtectedRoute>
          }
        />
        <Route
          path="states"
          element={
            <ProtectedRoute permission="view_state">
              <States />
            </ProtectedRoute>
          }
        />
        <Route
          path="states/:id/cities"
          element={
            <ProtectedRoute permission="view_cities">
              <Cities />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* 404 outside layout (e.g., /something-random) */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
