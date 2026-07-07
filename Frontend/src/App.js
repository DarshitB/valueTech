import { useDispatch, useSelector } from "react-redux";
import AppRoutes from "./routes/AppRoutes";
import { fetchCurrentUser } from "./redux/reducers/authReducer"; // path based on your structure
import { useEffect } from "react";
import { PageTitleProvider } from "./context/PageTitleContext";

function App() {
  const dispatch = useDispatch();
  const { token, user, loading } = useSelector((state) => state.auth);
  /* console.log(user); */
  useEffect(() => {
    // Fetch user only if token exists
    if (token) {
      dispatch(fetchCurrentUser());
    }
  }, [dispatch, token]);

  // ⬇️ Show loading spinner/splash until user data is fetched
  if (token && !user && loading) {
    return <div className="app-standalone-page p-4 text-center text-lg">Loading user...</div>;
  }

  return (
    <>
      <PageTitleProvider>
        <AppRoutes />
      </PageTitleProvider>
    </>
  );
}

export default App;
