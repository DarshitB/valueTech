import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchAllPermissions,
  fetchRoleWisePermissions,
  updateRolePermissions,
} from "../../redux/reducers/permissionReducer";
import { addRole, fetchRoles } from "../../redux/reducers/roleReducer";
import CustomDataTable from "../../components/CustomDataTable";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";

function Permissions() {
  const dispatch = useDispatch();

  /* get logged user permission */
  const allowedPermissions = useSelector(selectPermissions);

  // Redux states
  const { all: rawPermissions = [] } = useSelector(
    (state) => state.permission || {}
  );
  // Filter out "view_dashboard"
  const permissions = rawPermissions.filter(
    (permission) => permission.name !== "view_dashboard"
  );

  const { roleWise = [] } = useSelector((state) => state.permission || {});
  const { list: roles = [] } = useSelector((state) => state.roles || {});

  // Local role-permission state
  const [matrix, setMatrix] = useState({});
  const [newRoleName, setNewRoleName] = useState("");

  // Fetch on mount
  useEffect(() => {
    dispatch(fetchAllPermissions());
    dispatch(fetchRoleWisePermissions());
    dispatch(fetchRoles());
  }, [dispatch]);

  // Initialize matrix from roleWise once fetched
  useEffect(() => {
    const newMatrix = {};
    roleWise.forEach((role) => {
      newMatrix[role.id] = new Set(role.permissions);
    });
    setMatrix(newMatrix);
  }, [roleWise]);

  // Handle checkbox toggle
  const togglePermission = (roleId, permissionName) => {
    setMatrix((prev) => {
      const updated = new Set(prev[roleId]);
      if (updated.has(permissionName)) {
        updated.delete(permissionName);
      } else {
        updated.add(permissionName);
      }
      return { ...prev, [roleId]: updated };
    });
  };

  // Handle role add
  const handleAddRole = () => {
    if (!newRoleName.trim()) return;
    dispatch(addRole({ name: newRoleName })).then((res) => {
      const newRole = res.payload;
      if (newRole?.id) {
        setMatrix((prev) => ({ ...prev, [newRole.id]: new Set() }));
        setNewRoleName("");
      }
    });
  };

  // Handle save all
  const handleSave = () => {
    const payload = Object.entries(matrix).map(([roleId, permissions]) => ({
      roleId: parseInt(roleId),
      permissions: Array.from(permissions),
    }));
    dispatch(updateRolePermissions(payload));
  };

  return (
    <div className="height-full-occupied role-permission-matrix">
      <CustomDataTable>
        {{
          buttons: (
            <div className="add-action-buttons">
              {hasPermission(allowedPermissions, "add_role") && (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault(); // prevent page reload
                      handleAddRole();
                    }}
                    className="add-action-buttons"
                  >
                    <input
                      type="text"
                      className="input-filed"
                      placeholder="Add role"
                      value={newRoleName}
                      onChange={(e) =>
                        setNewRoleName(e.target.value.toUpperCase())
                      }
                    />
                    <button className="btn" type="submit">
                      Add Role
                    </button>
                  </form>
                </>
              )}
              {hasPermission(allowedPermissions, "edit_permission") && (
                <button className="btn" onClick={handleSave}>
                  Update Permissions
                </button>
              )}
            </div>
          ),

          header: (
            <tr>
              <th style={{ width: "150px" }}>Permission</th>
              {roles.map((role) => (
                <th
                  key={role.id}
                  style={{ width: "100px", textAlign: "center" }}
                >
                  {role.name}
                </th>
              ))}
            </tr>
          ),

          rows: permissions.map((permission) => (
            <tr key={permission.id}>
              <td>{permission.name}</td>
              {roles.map((role) => (
                <td key={role.id} style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    className="permission-check-box"
                    checked={matrix[role.id]?.has(permission.name) || false}
                    onChange={() => togglePermission(role.id, permission.name)}
                    disabled={
                      !hasPermission(allowedPermissions, "edit_permission")
                    }
                  />
                </td>
              ))}
            </tr>
          )),
        }}
      </CustomDataTable>
    </div>
  );
}

export default Permissions;
