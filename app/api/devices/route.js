import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getBearerToken, verifyToken } from "@/lib/auth";

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

    const [rows] = await pool.query(
      `SELECT id, device_name, fingerprint, user_agent, ip_address, trusted, last_seen_at
       FROM Devices
       WHERE user_id = ?
       ORDER BY last_seen_at DESC, id DESC`,
      [userId]
    );

    return NextResponse.json({
      devices: rows.map((row) => ({
        id: row.id,
        device_name: row.device_name,
        fingerprint: row.fingerprint,
        user_agent: row.user_agent,
        ip_address: row.ip_address,
        trusted: Boolean(row.trusted),
        last_seen_at: row.last_seen_at,
      })),
    });
  } catch (error) {
    console.error("devices/list:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
