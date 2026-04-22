import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getBearerToken, verifyToken } from "@/lib/auth";
import { logAccessEvent, requestAuditContext } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const auditContext = requestAuditContext(request);
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ message: "Missing authorization" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
    }

    if (decoded.typ !== "access") {
      return NextResponse.json({ message: "Invalid token type" }, { status: 401 });
    }

    const userId = Number(decoded.sub);
    if (!userId) {
      return NextResponse.json({ message: "Invalid token payload" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const deviceId =
      typeof body.deviceId === "number"
        ? body.deviceId
        : typeof body.deviceId === "string"
          ? Number(body.deviceId)
          : NaN;

    if (!Number.isFinite(deviceId) || deviceId < 1) {
      return NextResponse.json({ message: "deviceId is required" }, { status: 400 });
    }

    const [result] = await pool.query(
      "DELETE FROM Devices WHERE id = ? AND user_id = ?",
      [deviceId, userId]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ message: "Device not found" }, { status: 404 });
    }

    await logAccessEvent({
      ...auditContext,
      category: "device",
      eventType: "device_removed",
      decision: "info",
      severity: "medium",
      userId,
      sessionId: Number(decoded.sessionId) || null,
      deviceId,
      message: "Device removed",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("devices/remove:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
