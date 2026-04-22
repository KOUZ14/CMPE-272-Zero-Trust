import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateRequest, requireAdmin } from "@/lib/zeroTrust";

export const runtime = "nodejs";

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

export async function GET(request) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message }, { status: auth.status });
    }
    const admin = requireAdmin(auth);
    if (!admin.ok) {
      return NextResponse.json({ message: admin.message }, { status: admin.status });
    }

    const { searchParams } = new URL(request.url);
    const filters = [];
    const values = [];

    const category = searchParams.get("category");
    if (CATEGORIES.has(category)) {
      filters.push("ae.category = ?");
      values.push(category);
    }

    const decision = searchParams.get("decision");
    if (DECISIONS.has(decision)) {
      filters.push("ae.decision = ?");
      values.push(decision);
    }

    const severity = searchParams.get("severity");
    if (SEVERITIES.has(severity)) {
      filters.push("ae.severity = ?");
      values.push(severity);
    }

    const userId = Number(searchParams.get("userId"));
    if (Number.isFinite(userId) && userId > 0) {
      filters.push("ae.user_id = ?");
      values.push(userId);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const [events] = await pool.query(
      `SELECT ae.id, ae.category, ae.event_type, ae.decision, ae.severity,
              ae.user_id, u.email AS user_email, ae.session_id, ae.device_id,
              ae.resource_id, r.name AS resource_name, ae.ip_address,
              ae.user_agent, ae.message, ae.metadata, ae.created_at
       FROM AccessEvents ae
       LEFT JOIN Users u ON u.id = ae.user_id
       LEFT JOIN Resources r ON r.id = ae.resource_id
       ${where}
       ORDER BY ae.created_at DESC, ae.id DESC
       LIMIT 100`,
      values
    );

    return NextResponse.json({ events });
  } catch (error) {
    console.error("admin/audit-events:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
