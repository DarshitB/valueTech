export const selectPermissions = (state) => state.auth.user?.permissions || [];

export const selectUser = (state) => state.auth.user || [];
