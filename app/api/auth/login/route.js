import { NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  signAccessToken,
  signMfaPendingToken,
  verifyPassword,
  parseRolesFromRow,
} from "@/lib/auth";
import { createSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request) {
  try {
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
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const user = rows[0];
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const roles = parseRolesFromRow(user.role_names);

    if (user.mfa_enabled) {
      const mfaToken = signMfaPendingToken(user.id);
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
