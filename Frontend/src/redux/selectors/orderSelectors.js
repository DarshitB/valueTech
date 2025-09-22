// Order selectors
export const selectOrders = (state) => state.orders.list || [];
export const selectSelectedOrder = (state) => state.orders.selected || null;
export const selectOrdersLoading = (state) => state.orders.loading || false;
export const selectOrdersError = (state) => state.orders.error || null;

// Custom report selectors
export const selectCustomReportGenerating = (state) => state.orderReports.customReportGenerating || false;
export const selectCustomReportError = (state) => state.orderReports.customReportError || null;
export const selectCustomReportData = (state) => state.orderReports.customReportData || null;
