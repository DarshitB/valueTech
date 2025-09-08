const db = require("../../db");
const logActivity = require("../utils/logActivity");
const { getDeviceDetails } = require("../utils/deviceData");

const sanitize = (data) => {
  if (!data) return null;
  const clone = { ...data };
  if ("password" in clone) delete clone.password;
  return clone;
};

const activityLogger = (tableName, getRecordId, specificAction) => {
  return async (req, res, next) => {
    res.on("finish", async () => {
      try {
        const method = req.method.toLowerCase();
        const actionMap = {
          post: "create",
          put: "update",
          patch: "update",
          delete: "delete",
        }; 

        const action = actionMap[method];
        if (!action) return;

        const user_id = req.user?.id;
        let record_id = getRecordId(req, res);

        // For POST requests, try getting id from res.locals.createdId
        if (!record_id && method === "post" && res.locals?.createdId) {
          record_id = res.locals.createdId;
        }

        /* if (!user_id || !record_id) return; */
        if (!user_id) return;

        const deviceInfo = getDeviceDetails(req);
        let oldData = null;
        let newData = null;
        let metadata = {
          ip: req.ip,
          user_agent: req.headers["user-agent"],
          device_info: deviceInfo,
        };

        // 🔍 SPECIAL CASE: role-bulk update with multiple roleIds
        const isRoleBulkUpdate =
          tableName === "role_permissions" &&
          req.originalUrl === "/api/permissions/role-bulk" &&
          Array.isArray(req.body) &&
          req.body[0]?.roleId;

        if (isRoleBulkUpdate) {
          const roleIds = req.body.map((r) => r.roleId);

          // Fetch old permissions
          const existing = await db("permissions")
            .join(
              "role_permissions",
              "permissions.id",
              "role_permissions.permission_id"
            )
            .whereIn("role_permissions.role_id", roleIds)
            .whereNull("role_permissions.deleted_at")
            .select("role_permissions.role_id", "permissions.name");

          const oldMap = {};
          for (const { role_id, name } of existing) {
            if (!oldMap[role_id]) oldMap[role_id] = [];
            oldMap[role_id].push(name);
          }

          oldData = roleIds.map((roleId) => ({
            roleId,
            permissions: oldMap[roleId] || [],
          }));

          newData = req.body.map((r) => ({
            roleId: r.roleId,
            permissions: Array.isArray(r.permissions) ? r.permissions : [],
          }));

          metadata.affected_roles = roleIds;
        } else {
          if (action === "update" || action === "delete") {
            oldData = sanitize(res.locals.oldData); // Pull pre-update data
          }
          if (action === "create" || action === "update") {
            newData = sanitize(req.body);
          }
        }

        await logActivity({
          user_id,
          action: specificAction !== null && specificAction !== undefined ? specificAction : action,
          table_name: tableName,
          record_id,
          old_data: oldData,
          new_data: newData,
          metadata,
        });
      } catch (err) {
        console.error("Failed to auto-log activity:", err.message);
      }
    });

    next();
  };
};

module.exports = activityLogger;
