import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./reducers/authReducer";
import stateReducer from "./reducers/stateReducer";
import cityReducer from "./reducers/cityReducer";
import roleReducer from "./reducers/roleReducer";
import userReducer from "./reducers/userReducer";
import permissionReducer from "./reducers/permissionReducer";
import bankReducer from "./reducers/bankReducer";
import bankBranchReducer from "./reducers/bankBranchReducer";
import categoryReducer from "./reducers/categoryReducer";
import subcategoryReducer from "./reducers/subcategoryReducer";
import childCategoryReducer from "./reducers/childCategoryReducer";
import officerReducer from "./reducers/officerReducer";
import fieldVerifierReducer from "./reducers/fieldVerifierReducer";
import orderReducer from "./reducers/orderReducer";
import orderReportReducer from "./reducers/orderReportReducer";
import orderMediaDocumentsReducer from "./reducers/orderMediaDocumentsReducer";
import collageReducer from "./reducers/collageReducer";
import assetMakesReducer from "./reducers/assetMakesReducer";

const store = configureStore({
  reducer: {
    auth: authReducer,
    states: stateReducer,
    cities: cityReducer,
    roles: roleReducer,
    users: userReducer,
    permission: permissionReducer,
    banks: bankReducer,
    branches: bankBranchReducer,
    categories: categoryReducer,
    subcategories: subcategoryReducer,
    childCategories: childCategoryReducer,
    officers: officerReducer,
    fieldVerifier: fieldVerifierReducer,
    orders: orderReducer,
    orderReports: orderReportReducer,
    orderMediaDocuments: orderMediaDocumentsReducer,
    collage: collageReducer,
    assetMakes: assetMakesReducer,
  },
});

export default store;
