import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getBearerToken, hashRefreshToken, verifyToken } from "@/lib/auth";
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
    const sessionId = Number(decoded.sessionId);
    if (!userId || !sessionId) {
      return NextResponse.json({ message: "Invalid token payload" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const refreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";

    if (refreshToken) {
      const hash = hashRefreshToken(refreshToken);
      const [r] = await pool.query(
        `UPDATE Sessions
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE refresh_token_hash = ? AND user_id = ? AND revoked_at IS NULL`,
        [hash, userId]
      );
      if (r.affectedRows === 0) {
        await revokeSession(sessionId, userId);
      }
    } else {
      await revokeSession(sessionId, userId);
    }

    await logAccessEvent({
      ...auditContext,
      category: "session",
      eventType: "logout",
      decision: "info",
      severity: "low",
      userId,
      sessionId,
      deviceId: Number(decoded.deviceId) || null,
      message: "User logged out and session was revoked",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("logout:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
