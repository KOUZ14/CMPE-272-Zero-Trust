import { NextResponse } from "next/server";
import pool from "@/lib/db";
import speakeasy from "speakeasy";
import {
  getBearerToken,
  verifyToken,
  signAccessToken,
  parseRolesFromRow,
} from "@/lib/auth";
import { createSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Two modes:
 * 1) Login: { code, mfaToken } — complete MFA after password when mfa_enabled.
 * 2) Enrollment: Authorization Bearer + { code } — confirm TOTP after mfa-setup (mfa_enabled still false).
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const mfaToken = typeof body.mfaToken === "string" ? body.mfaToken.trim() : "";

    if (!code || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { message: "A valid 6-digit code is required" },
        { status: 400 }
      );
    }

    if (mfaToken) {
      let pending;
      try {
        pending = verifyToken(mfaToken);
      } catch {
        return NextResponse.json(
          { message: "Invalid or expired MFA token" },
          { status: 401 }
        );
      }
      if (pending.typ !== "mfa_pending") {
        return NextResponse.json({ message: "Invalid MFA token type" }, { status: 401 });
      }

      const userId = Number(pending.sub);
      if (!userId) {
        return NextResponse.json({ message: "Invalid MFA token" }, { status: 401 });
      }

      const [rows] = await pool.query(
        `SELECT u.id, u.email, u.full_name, u.mfa_enabled, u.mfa_secret,
                GROUP_CONCAT(r.name ORDER BY r.name SEPARATOR ',') AS role_names
         FROM Users u
         LEFT JOIN UserRoles ur ON ur.user_id = u.id
         LEFT JOIN Roles r ON r.id = ur.role_id
         WHERE u.id = ?
         GROUP BY u.id, u.email, u.full_name, u.mfa_enabled, u.mfa_secret`,
        [userId]
      );

      if (rows.length === 0 || !rows[0].mfa_enabled || !rows[0].mfa_secret) {
        return NextResponse.json({ message: "MFA not configured" }, { status: 400 });
      }

      const user = rows[0];
      const valid = speakeasy.totp.verify({
        secret: user.mfa_secret,
        encoding: "base32",
        token: code,
        window: 1,
      });
      if (!valid) {
        return NextResponse.json({ message: "Invalid code" }, { status: 401 });
      }

      const roles = parseRolesFromRow(user.role_names);
      const { sessionId, refreshToken, expiresAt } = await createSession({
        userId: user.id,
        deviceId: null,
      });

      const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        roles,
        mfaVerified: true,
        deviceId: null,
        sessionId,
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
          mfa_enabled: true,
          roles,
        },
      });
    }

    const bearer = getBearerToken(request);
    if (!bearer) {
      return NextResponse.json(
        { message: "Provide mfaToken (login) or Authorization bearer (enrollment)" },
        { status: 401 }
      );
    }

    let decoded;
    try {
      decoded = verifyToken(bearer);
    } catch {
      return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
    }
    if (decoded.typ !== "access") {
      return NextResponse.json({ message: "Invalid token type" }, { status: 401 });
    }

    const userId = Number(decoded.sub);
    const [users] = await pool.query(
      "SELECT id, email, mfa_enabled, mfa_secret FROM Users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (users.length === 0) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    const u = users[0];
    if (u.mfa_enabled) {
      return NextResponse.json({ message: "MFA is already enabled" }, { status: 400 });
    }
    if (!u.mfa_secret) {
      return NextResponse.json(
        { message: "Run MFA setup first (POST /api/auth/mfa-setup)" },
        { status: 400 }
      );
    }

    const valid = speakeasy.totp.verify({
      secret: u.mfa_secret,
      encoding: "base32",
      token: code,
      window: 1,
    });
    if (!valid) {
      return NextResponse.json({ message: "Invalid code" }, { status: 401 });
    }

    await pool.query("UPDATE Users SET mfa_enabled = TRUE WHERE id = ?", [userId]);

    return NextResponse.json({ ok: true, mfa_enabled: true });
  } catch (error) {
    console.error("mfa-verify:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
