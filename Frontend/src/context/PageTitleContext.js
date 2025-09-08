import React, { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const PageTitleContext = createContext();

export const PageTitleProvider = ({ children }) => {
  const [title, setTitle] = useState("");
  const location = useLocation();

  // Reset title on route change unless explicitly set
  useEffect(() => {
    setTitle(""); // reset on every path change
  }, [location.pathname]);

  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
};

// Hook to use title in components
export const usePageTitle = () => useContext(PageTitleContext);
