import { NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  signAccessToken,
  signMfaPendingToken,
  verifyPassword,
  parseRolesFromRow,
} from "@/lib/auth";
import { createSession } from "@/lib/session";
import { logAccessEvent, requestAuditContext } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const auditContext = requestAuditContext(request);
    const body = await request.json().catch(() => ({}));
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { message: "email and password are required" },
        { status: 400 }
      );
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.mfa_enabled, u.mfa_secret,
              GROUP_CONCAT(r.name ORDER BY r.name SEPARATOR ',') AS role_names
       FROM Users u
       LEFT JOIN UserRoles ur ON ur.user_id = u.id
       LEFT JOIN Roles r ON r.id = ur.role_id
       WHERE u.email = ?
       GROUP BY u.id, u.email, u.password_hash, u.full_name, u.mfa_enabled, u.mfa_secret`,
      [email]
    );

    if (rows.length === 0) {
      await logAccessEvent({
        ...auditContext,
        category: "auth",
        eventType: "login_failed",
        decision: "deny",
        severity: "medium",
        message: "Login failed: unknown email",
        metadata: { email },
      });
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const user = rows[0];
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      await logAccessEvent({
        ...auditContext,
        category: "auth",
        eventType: "login_failed",
        decision: "deny",
        severity: "medium",
        userId: user.id,
        message: "Login failed: invalid password",
      });
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const roles = parseRolesFromRow(user.role_names);

    if (user.mfa_enabled) {
      const mfaToken = signMfaPendingToken(user.id);
      await logAccessEvent({
        ...auditContext,
        category: "auth",
        eventType: "login_password_verified",
        decision: "info",
        severity: "low",
        userId: user.id,
        message: "Password verified; MFA required",
      });
      return NextResponse.json({
        message: "Password verified. MFA required.",
        mfaRequired: true,
        mfaToken,
      });
    }

    const { sessionId, refreshToken, expiresAt } = await createSession({
      userId: user.id,
      deviceId: null,
    });

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      mfaVerified: false,
      deviceId: null,
      sessionId,
    });

    await logAccessEvent({
      ...auditContext,
      category: "auth",
      eventType: "login_success",
      decision: "allow",
      severity: "low",
      userId: user.id,
      sessionId,
      message: "Login succeeded without MFA requirement",
    });

    return NextResponse.json({
      accessToken,
      refreshToken,
      sessionId,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        mfa_enabled: Boolean(user.mfa_enabled),
        roles,
      },
    });
  } catch (error) {
    console.error("login:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
