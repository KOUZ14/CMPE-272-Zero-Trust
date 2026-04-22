import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateRequest, evaluateResourceAccess } from "@/lib/zeroTrust";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message }, { status: auth.status });
    }

    const [rows] = await pool.query(
      `SELECT id, name, description, segment, sensitivity, active
       FROM Resources
       WHERE active = TRUE
       ORDER BY FIELD(segment, 'Employee', 'Management', 'Finance', 'Engineering', 'Admin'), name`
    );

    const resources = [];
    for (const row of rows) {
      const decision = await evaluateResourceAccess(auth, row.id);
      resources.push({
        id: row.id,
        name: row.name,
        description: row.description,
        segment: row.segment,
        sensitivity: row.sensitivity,
        active: Boolean(row.active),
        eligible: Boolean(decision.allowed),
        eligibilityReason: decision.reason,
      });
    }

    return NextResponse.json({ resources });
  } catch (error) {
    console.error("resources/list:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
