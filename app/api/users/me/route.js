import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getBearerToken, verifyToken, parseRolesFromRow } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request) {
  try {
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

    const [users] = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.mfa_enabled, u.created_at,
              GROUP_CONCAT(r.name ORDER BY r.name SEPARATOR ',') AS role_names
       FROM Users u
       LEFT JOIN UserRoles ur ON ur.user_id = u.id
       LEFT JOIN Roles r ON r.id = ur.role_id
       WHERE u.id = ?
       GROUP BY u.id, u.email, u.full_name, u.mfa_enabled, u.created_at`,
      [userId]
    );

    if (users.length === 0) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const u = users[0];
    const rolesFromDb = parseRolesFromRow(u.role_names);
    const roles =
      rolesFromDb.length > 0 ? rolesFromDb : Array.isArray(decoded.roles) ? decoded.roles : [];

    return NextResponse.json({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      mfa_enabled: Boolean(u.mfa_enabled),
      created_at: u.created_at,
      roles,
      token: {
        mfaVerified: Boolean(decoded.mfaVerified),
        deviceId: decoded.deviceId ?? null,
        sessionId: decoded.sessionId ?? null,
      },
    });
  } catch (error) {
    console.error("users/me:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
