/**
 * Shared RBAC Permission Matrix Config
 * 
 * This file serves as the single source of truth for Role-Based Access Control (RBAC)
 * permissions on both the backend and frontend. Every route, controller, and UI
 * element must reference this configuration to authorize or gate access.
 * 
 * Conceptually, this implements the permissions defined in 03-user-roles-permission-matrix.md §3
 * and is referenced by the traceability notes in 06-api-specification.md §14.
 * 
 * The system enforces a default-deny policy: if a role-resource-action combination is not
 * explicitly mapped below, permission is denied.
 */

const permissions = {
  super_admin: {
    organization: ['delete', 'list_platform', 'health_platform'],
    users: ['read_self', 'update_self', 'suspend_admin'],
    dashboards: ['read_platform'],
    notifications: ['update_self_preferences'],
    audit: ['read']
  },
  org_admin: {
    organization: ['read', 'update'],
    users: ['invite', 'change_role', 'list', 'delete', 'read_self', 'update_self'],
    servers: ['create', 'read', 'update', 'delete'],
    api_monitors: ['create', 'read', 'update', 'delete'],
    ai_insights: ['read', 'update_settings', 'review'],
    alerts: ['read', 'create_rule', 'update_rule', 'acknowledge', 'resolve', 'delete'],
    notifications: ['receive_email', 'receive_in_app', 'update_self_preferences', 'update_org_defaults'],
    dashboards: ['read_org', 'update_layout'],
    reports: ['export_metrics', 'export_alerts', 'export_anomalies'],
    audit: ['read']
  },
  devops_engineer: {
    organization: ['read'],
    users: ['list', 'read_self', 'update_self'],
    servers: ['create', 'read', 'update', 'delete'],
    api_monitors: ['create', 'read', 'update', 'delete'],
    ai_insights: ['read', 'update_settings', 'review'],
    alerts: ['read', 'create_rule', 'update_rule', 'acknowledge', 'resolve'],
    notifications: ['receive_email', 'receive_in_app', 'update_self_preferences'],
    dashboards: ['read_org', 'update_layout'],
    reports: ['export_metrics', 'export_alerts', 'export_anomalies']
  },
  team_lead: {
    organization: ['read'],
    users: ['list', 'read_self', 'update_self'],
    servers: ['read'],
    api_monitors: ['read'],
    ai_insights: ['read', 'review'],
    alerts: ['read', 'acknowledge', 'resolve'],
    notifications: ['receive_email', 'receive_in_app', 'update_self_preferences'],
    dashboards: ['read_org', 'update_layout'],
    reports: ['export_metrics', 'export_alerts', 'export_anomalies']
  },
  viewer: {
    organization: ['read'],
    users: ['read_self', 'update_self'],
    servers: ['read'],
    api_monitors: ['read'],
    ai_insights: ['read'],
    alerts: ['read'],
    notifications: ['receive_email', 'receive_in_app', 'update_self_preferences'],
    dashboards: ['read_org', 'update_layout'],
    reports: ['export_metrics', 'export_alerts', 'export_anomalies']
  }
};

/**
 * Check if a role has permission to perform an action on a resource.
 * Enforces a strict default-deny fallback.
 * 
 * @param {string} role - The user's role (e.g., 'org_admin', 'viewer')
 * @param {string} resource - The target resource (e.g., 'servers', 'users')
 * @param {string} action - The action to check (e.g., 'create', 'read')
 * @returns {boolean} True if permission is granted, false otherwise (default-deny)
 */
function hasPermission(role, resource, action) {
  if (!role || !resource || !action) {
    return false;
  }

  const roleKey = role.toLowerCase();
  const resourceKey = resource.toLowerCase();
  const actionKey = action.toLowerCase();

  const rolePermissions = permissions[roleKey];
  if (!rolePermissions) {
    return false;
  }

  const allowedActions = rolePermissions[resourceKey];
  if (!allowedActions) {
    return false;
  }

  return allowedActions.includes(actionKey);
}

module.exports = {
  permissions,
  hasPermission
};
