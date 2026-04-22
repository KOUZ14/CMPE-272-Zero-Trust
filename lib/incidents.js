import pool from "./db";
import { logAccessEvent } from "./audit";

const HIGH_SENSITIVITY = new Set(["high", "critical"]);

export async function createOrUpdateIncidentForDeniedAccess({
  decision,
  eventId = null,
  ipAddress = null,
  userAgent = null,
}) {
  if (decision.allowed || !decision.resource || !decision.userId) return null;

  const sensitivity = String(decision.resource.sensitivity || "").toLowerCase();
  const shouldOpenForSensitivity = HIGH_SENSITIVITY.has(sensitivity);

  const [recentDenials] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM AccessEvents
     WHERE user_id = ?
       AND decision = 'deny'
       AND category = 'resource'
       AND created_at >= (CURRENT_TIMESTAMP - INTERVAL 30 MINUTE)`,
    [decision.userId]
  );
  const repeatedDenials = Number(recentDenials[0]?.count || 0) >= 3;

  if (!shouldOpenForSensitivity && !repeatedDenials) return null;

  const severity = sensitivity === "critical" ? "critical" : "high";
  const title = `Suspicious access denied: ${decision.resource.name}`;
  const description =
    repeatedDenials
      ? `Repeated denied resource access detected. Latest reason: ${decision.reason}`
      : `Denied access to ${sensitivity} sensitivity resource. Reason: ${decision.reason}`;

  const [existing] = await pool.query(
    `SELECT id
     FROM Incidents
     WHERE related_user_id = ?
       AND status IN ('open', 'investigating')
       AND title = ?
     ORDER BY id DESC
     LIMIT 1`,
    [decision.userId, title]
  );

  let incidentId;
  if (existing.length > 0) {
    incidentId = existing[0].id;
    await pool.query(
      `UPDATE Incidents
       SET description = ?, severity = ?, related_event_id = COALESCE(?, related_event_id)
       WHERE id = ?`,
      [description, severity, eventId, incidentId]
    );
  } else {
    const [result] = await pool.query(
      `INSERT INTO Incidents
       (title, description, severity, status, related_user_id, related_event_id)
       VALUES (?, ?, ?, 'open', ?, ?)`,
      [title, description, severity, decision.userId, eventId]
    );
    incidentId = result.insertId;
  }

  await logAccessEvent({
    category: "incident",
    eventType: existing.length > 0 ? "incident_updated" : "incident_created",
    decision: "info",
    severity,
    userId: decision.userId,
    sessionId: decision.sessionId,
    deviceId: decision.deviceId,
    resourceId: decision.resource.id,
    ipAddress,
    userAgent,
    message: description,
    metadata: { incidentId, relatedEventId: eventId },
  });

  return incidentId;
}
