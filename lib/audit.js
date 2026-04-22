import pool from "./db";
import { clientIp, userAgent } from "./request-utils";

const CATEGORIES = new Set([
  "auth",
  "mfa",
  "device",
  "session",
  "resource",
  "admin",
  "incident",
]);
const DECISIONS = new Set(["allow", "deny", "info"]);
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);

function safeEnum(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

export function requestAuditContext(request) {
  return {
    ipAddress: clientIp(request),
    userAgent: userAgent(request),
  };
}

export async function logAccessEvent({
  category,
  eventType,
  decision = "info",
  severity = "low",
  userId = null,
  sessionId = null,
  deviceId = null,
  resourceId = null,
  ipAddress = null,
  userAgent: ua = null,
  message = null,
  metadata = null,
}) {
  try {
    const [result] = await pool.query(
      `INSERT INTO AccessEvents
       (category, event_type, decision, severity, user_id, session_id, device_id,
        resource_id, ip_address, user_agent, message, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        safeEnum(category, CATEGORIES, "admin"),
        String(eventType || "event").slice(0, 80),
        safeEnum(decision, DECISIONS, "info"),
        safeEnum(severity, SEVERITIES, "low"),
        userId,
        sessionId,
        deviceId,
        resourceId,
        ipAddress,
        ua,
        message,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    return result.insertId;
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE") {
      console.warn(
        "Audit table is missing. Run `npm run db:setup:zero-trust` against your PlanetScale DATABASE_URL."
      );
      return null;
    }
    console.error("audit log failed:", error);
    return null;
  }
}
