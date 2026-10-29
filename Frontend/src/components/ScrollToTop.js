import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets window / layout scroll to the top on every route change.
 * Layout keeps the same shell across pages, so without this the previous
 * scroll position would carry over (e.g. report → order details).
 */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const mainContent = document.querySelector(".main-content");
    if (mainContent) {
      mainContent.scrollTop = 0;
    }
  }, [pathname]);

  return null;
}

export default ScrollToTop;
