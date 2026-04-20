import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getBearerToken, verifyToken, parseRolesFromRow } from "@/lib/auth";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["employee", "manager", "admin"]);

function tokenHasAdmin(decoded) {
  const roles = Array.isArray(decoded.roles)
    ? decoded.roles
    : parseRolesFromRow(decoded.roles);
  return roles.some((r) => String(r).toLowerCase() === "admin");
}

export async function POST(request) {
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

    if (!tokenHasAdmin(decoded)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const roleNameRaw =
      typeof body.roleName === "string" ? body.roleName.trim().toLowerCase() : "";
    const targetUserId =
      typeof body.userId === "number"
        ? body.userId
        : typeof body.userId === "string"
          ? Number(body.userId)
          : NaN;
    const targetEmail =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!roleNameRaw || !ALLOWED_ROLES.has(roleNameRaw)) {
      return NextResponse.json(
        { message: "roleName must be one of: employee, manager, admin" },
        { status: 400 }
      );
    }

    let userId = targetUserId;
    if (!Number.isFinite(userId) || userId < 1) {
      if (!targetEmail) {
        return NextResponse.json(
          { message: "Provide userId or email for the target user" },
          { status: 400 }
        );
      }
      const [urows] = await pool.query(
        "SELECT id FROM Users WHERE email = ? LIMIT 1",
        [targetEmail]
      );
      if (urows.length === 0) {
        return NextResponse.json({ message: "User not found" }, { status: 404 });
      }
      userId = urows[0].id;
    }

    const [rrows] = await pool.query(
      "SELECT id FROM Roles WHERE name = ? LIMIT 1",
      [roleNameRaw]
    );
    if (rrows.length === 0) {
      return NextResponse.json({ message: "Role not found in database" }, { status: 404 });
    }
    const roleId = rrows[0].id;

    try {
      await pool.query(
        "INSERT INTO UserRoles (user_id, role_id) VALUES (?, ?)",
        [userId, roleId]
      );
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") {
        return NextResponse.json({
          ok: true,
          message: "User already has this role",
          userId,
          roleName: roleNameRaw,
        });
      }
      throw e;
    }

    return NextResponse.json({
      ok: true,
      userId,
      roleName: roleNameRaw,
    });
  } catch (error) {
    console.error("assign-role:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
