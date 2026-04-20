import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getBearerToken, verifyToken } from "@/lib/auth";
import { clientIp, userAgent } from "@/lib/request-utils";

export const runtime = "nodejs";

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

    const userId = Number(decoded.sub);
    if (!userId) {
      return NextResponse.json({ message: "Invalid token payload" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const fingerprint =
      typeof body.fingerprint === "string" ? body.fingerprint.trim() : "";
    const deviceName =
      typeof body.deviceName === "string" ? body.deviceName.trim() : null;

    if (!fingerprint) {
      return NextResponse.json({ message: "fingerprint is required" }, { status: 400 });
    }

    const ua = userAgent(request);
    const ip = clientIp(request);

    const [existing] = await pool.query(
      "SELECT id, trusted FROM Devices WHERE user_id = ? AND fingerprint = ? LIMIT 1",
      [userId, fingerprint]
    );

    if (existing.length > 0) {
      const dev = existing[0];
      await pool.query(
        `UPDATE Devices
         SET last_seen_at = CURRENT_TIMESTAMP,
             user_agent = COALESCE(?, user_agent),
             ip_address = COALESCE(?, ip_address),
             device_name = COALESCE(?, device_name)
         WHERE id = ?`,
        [ua, ip, deviceName, dev.id]
      );
      return NextResponse.json({
        id: dev.id,
        trusted: Boolean(dev.trusted),
        updated: true,
      });
    }

    const [ins] = await pool.query(
      `INSERT INTO Devices (user_id, device_name, fingerprint, user_agent, ip_address, trusted)
       VALUES (?, ?, ?, ?, ?, FALSE)`,
      [userId, deviceName, fingerprint, ua, ip]
    );

    return NextResponse.json(
      {
        id: ins.insertId,
        trusted: false,
        updated: false,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("register-device:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
