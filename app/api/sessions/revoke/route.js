import { NextResponse } from "next/server";
import { getBearerToken, verifyToken } from "@/lib/auth";
import { revokeSession } from "@/lib/session";
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
    const sessionId =
      typeof body.sessionId === "number"
        ? body.sessionId
        : typeof body.sessionId === "string"
          ? Number(body.sessionId)
          : NaN;

    if (!Number.isFinite(sessionId) || sessionId < 1) {
      return NextResponse.json({ message: "sessionId is required" }, { status: 400 });
    }

    const revoked = await revokeSession(sessionId, userId);
    await logAccessEvent({
      ...auditContext,
      category: "session",
      eventType: "session_revoked",
      decision: "info",
      severity: revoked ? "medium" : "low",
      userId,
      sessionId,
      deviceId: Number(decoded.deviceId) || null,
      message: revoked ? "Session revoked" : "Session revoke requested but no active session changed",
    });
    return NextResponse.json({ ok: true, revoked });
  } catch (error) {
    console.error("sessions/revoke:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
