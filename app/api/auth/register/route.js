import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullNameFromField =
      typeof body.fullName === "string" ? body.fullName.trim() : "";
    const first = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const last = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const full_name =
      fullNameFromField ||
      [first, last].filter(Boolean).join(" ").trim();

    if (!emailRaw || !password || !full_name) {
      return NextResponse.json(
        { message: "email, password, and full name are required" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { message: "password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const [dup] = await pool.query(
      "SELECT id FROM Users WHERE email = ? LIMIT 1",
      [emailRaw]
    );
    if (dup.length > 0) {
      return NextResponse.json({ message: "Email already registered" }, { status: 409 });
    }

    const [roleRows] = await pool.query(
      "SELECT id FROM Roles WHERE name = 'employee' LIMIT 1"
    );
    if (roleRows.length === 0) {
      return NextResponse.json(
        { message: "Database is missing the employee role; run role seed SQL" },
        { status: 500 }
      );
    }
    const employeeRoleId = roleRows[0].id;

    const password_hash = await hashPassword(password);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [ins] = await conn.query(
        `INSERT INTO Users (email, password_hash, full_name, mfa_enabled, mfa_secret)
         VALUES (?, ?, ?, FALSE, NULL)`,
        [emailRaw, password_hash, full_name]
      );
      const userId = ins.insertId;
      await conn.query(
        "INSERT INTO UserRoles (user_id, role_id) VALUES (?, ?)",
        [userId, employeeRoleId]
      );
      await conn.commit();
      return NextResponse.json(
        { id: userId, email: emailRaw, full_name, roles: ["employee"] },
        { status: 201 }
      );
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error("register:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
