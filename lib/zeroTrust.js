import pool from "./db";
import { getBearerToken, parseRolesFromRow, verifyToken } from "./auth";

function roleMatches(userRoles, requiredRole) {
  const set = new Set(userRoles.map((r) => String(r).toLowerCase()));
  const role = String(requiredRole || "").toLowerCase();
  if (set.has("admin")) return true;
  if (role === "employee" && (set.has("manager") || set.has("admin"))) return true;
  return set.has(role);
}

export async function authenticateRequest(request) {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, message: "Missing authorization" };
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return { ok: false, status: 401, message: "Invalid or expired token" };
  }

  if (decoded.typ !== "access") {
    return { ok: false, status: 401, message: "Invalid token type" };
  }

  const userId = Number(decoded.sub);
  const sessionId = Number(decoded.sessionId);
  if (!userId || !sessionId) {
    return { ok: false, status: 401, message: "Invalid token payload" };
  }

  const [users] = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.mfa_enabled,
            GROUP_CONCAT(r.name ORDER BY r.name SEPARATOR ',') AS role_names
     FROM Users u
     LEFT JOIN UserRoles ur ON ur.user_id = u.id
     LEFT JOIN Roles r ON r.id = ur.role_id
     WHERE u.id = ?
     GROUP BY u.id, u.email, u.full_name, u.mfa_enabled`,
    [userId]
  );
  if (users.length === 0) {
    return { ok: false, status: 404, message: "User not found" };
  }

  const [sessions] = await pool.query(
    `SELECT id, user_id, device_id, expires_at, revoked_at
     FROM Sessions
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [sessionId, userId]
  );
  if (sessions.length === 0) {
    return { ok: false, status: 401, message: "Session not found" };
  }

  const session = sessions[0];
  if (session.revoked_at) {
    return { ok: false, status: 401, message: "Session has been revoked" };
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 401, message: "Session has expired" };
  }

  const user = users[0];
  const rolesFromDb = parseRolesFromRow(user.role_names);
  const roles =
    rolesFromDb.length > 0 ? rolesFromDb : Array.isArray(decoded.roles) ? decoded.roles : [];
  const deviceId = Number(decoded.deviceId || session.device_id) || null;
  let device = null;

  if (deviceId) {
    const [devices] = await pool.query(
      `SELECT id, user_id, device_name, trusted, last_seen_at
       FROM Devices
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [deviceId, userId]
    );
    device = devices[0] ?? null;
  }

  return {
    ok: true,
    decoded,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      mfa_enabled: Boolean(user.mfa_enabled),
      roles,
    },
    userId,
    roles,
    session,
    sessionId,
    device,
    deviceId,
    mfaVerified: Boolean(decoded.mfaVerified),
  };
}

export function requireAdmin(auth) {
  if (!auth.ok) return auth;
  const roles = auth.roles.map((role) => String(role).toLowerCase());
  if (!roles.includes("admin")) {
    return { ok: false, status: 403, message: "Admin role required" };
  }
  if (!auth.mfaVerified) {
    return { ok: false, status: 403, message: "Admin actions require MFA verification" };
  }
  return { ok: true };
}

export async function evaluateResourceAccess(auth, resourceId) {
  if (!auth.ok) {
    return {
      allowed: false,
      status: auth.status,
      reason: auth.message,
    };
  }

  const [resources] = await pool.query(
    `SELECT id, name, description, segment, sensitivity, active
     FROM Resources
     WHERE id = ?
     LIMIT 1`,
    [resourceId]
  );
  if (resources.length === 0) {
    return {
      allowed: false,
      status: 404,
      reason: "Resource not found",
    };
  }

  const resource = {
    ...resources[0],
    active: Boolean(resources[0].active),
  };
  if (!resource.active) {
    return {
      allowed: false,
      status: 403,
      reason: "Resource is inactive",
      resource,
    };
  }

  const [policies] = await pool.query(
    `SELECT id, name, role_name, segment, resource_id, require_mfa,
            require_trusted_device, active
     FROM AccessPolicies
     WHERE active = TRUE
       AND segment = ?
       AND (resource_id IS NULL OR resource_id = ?)
     ORDER BY resource_id DESC, id ASC`,
    [resource.segment, resource.id]
  );

  const matchingPolicies = policies.filter((policy) =>
    roleMatches(auth.roles, policy.role_name)
  );
  if (matchingPolicies.length === 0) {
    return {
      allowed: false,
      status: 403,
      reason: "No active policy allows your role to access this segment",
      userId: auth.userId,
      roles: auth.roles,
      sessionId: auth.sessionId,
      deviceId: auth.deviceId,
      resource,
    };
  }

  for (const policy of matchingPolicies) {
    if (policy.require_mfa && !auth.mfaVerified) {
      continue;
    }
    if (policy.require_trusted_device && !auth.device?.trusted) {
      continue;
    }
    return {
      allowed: true,
      status: 200,
      reason: `Allowed by policy: ${policy.name}`,
      policy,
      userId: auth.userId,
      roles: auth.roles,
      sessionId: auth.sessionId,
      deviceId: auth.deviceId,
      resource,
    };
  }

  const needsMfa = matchingPolicies.some((policy) => policy.require_mfa);
  const needsTrustedDevice = matchingPolicies.some(
    (policy) => policy.require_trusted_device
  );
  let reason = "Policy requirements were not satisfied";
  if (needsMfa && !auth.mfaVerified) {
    reason = "MFA verification is required for this resource";
  } else if (needsTrustedDevice && !auth.device?.trusted) {
    reason = "A trusted device is required for this resource";
  }

  return {
    allowed: false,
    status: 403,
    reason,
    userId: auth.userId,
    roles: auth.roles,
    sessionId: auth.sessionId,
    deviceId: auth.deviceId,
    resource,
  };
}
