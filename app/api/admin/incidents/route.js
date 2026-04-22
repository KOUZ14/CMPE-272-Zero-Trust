import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { logAccessEvent, requestAuditContext } from "@/lib/audit";
import { authenticateRequest, requireAdmin } from "@/lib/zeroTrust";

export const runtime = "nodejs";

const STATUSES = new Set(["open", "investigating", "resolved", "false_positive"]);
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);

async function requireAdminAuth(request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth;
  const admin = requireAdmin(auth);
  if (!admin.ok) return admin;
  return auth;
}

export async function GET(request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message }, { status: auth.status });
    }

    const [incidents] = await pool.query(
      `SELECT i.id, i.title, i.description, i.severity, i.status,
              i.related_user_id, u.email AS related_user_email,
              i.related_event_id, i.assignee, i.notes, i.created_at, i.updated_at
       FROM Incidents i
       LEFT JOIN Users u ON u.id = i.related_user_id
       ORDER BY FIELD(i.status, 'open', 'investigating', 'resolved', 'false_positive'),
                i.updated_at DESC, i.id DESC
       LIMIT 100`
    );

    return NextResponse.json({ incidents });
  } catch (error) {
    console.error("admin/incidents list:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auditContext = requestAuditContext(request);
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const incidentId =
      typeof body.incidentId === "number"
        ? body.incidentId
        : typeof body.incidentId === "string"
          ? Number(body.incidentId)
          : NaN;
    const status = typeof body.status === "string" ? body.status : "";
    const severity = typeof body.severity === "string" ? body.severity : "";
    const assignee =
      typeof body.assignee === "string" && body.assignee.trim()
        ? body.assignee.trim()
        : null;
    const notes =
      typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    if (!Number.isFinite(incidentId) || incidentId < 1) {
      return NextResponse.json({ message: "incidentId is required" }, { status: 400 });
    }
    if (status && !STATUSES.has(status)) {
      return NextResponse.json({ message: "Invalid incident status" }, { status: 400 });
    }
    if (severity && !SEVERITIES.has(severity)) {
      return NextResponse.json({ message: "Invalid incident severity" }, { status: 400 });
    }

    const [existing] = await pool.query(
      "SELECT id, status, severity FROM Incidents WHERE id = ? LIMIT 1",
      [incidentId]
    );
    if (existing.length === 0) {
      return NextResponse.json({ message: "Incident not found" }, { status: 404 });
    }

    await pool.query(
      `UPDATE Incidents
       SET status = COALESCE(?, status),
           severity = COALESCE(?, severity),
           assignee = COALESCE(?, assignee),
           notes = COALESCE(?, notes)
       WHERE id = ?`,
      [status || null, severity || null, assignee, notes, incidentId]
    );

    await logAccessEvent({
      ...auditContext,
      category: "admin",
      eventType: "incident_updated",
      decision: "allow",
      severity: severity || existing[0].severity || "medium",
      userId: auth.userId,
      sessionId: auth.sessionId,
      deviceId: auth.deviceId,
      message: `Incident ${incidentId} updated`,
      metadata: { incidentId, status, severity, assignee },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin/incidents update:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
