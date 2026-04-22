import { NextResponse } from "next/server";
import pool from "@/lib/db";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { getBearerToken, verifyToken } from "@/lib/auth";
import { logAccessEvent, requestAuditContext } from "@/lib/audit";

export const runtime = "nodejs";

const ISSUER = process.env.MFA_ISSUER_NAME || "Employee Portal";

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

    const [users] = await pool.query(
      "SELECT id, email, mfa_enabled FROM Users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (users.length === 0) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    const user = users[0];
    if (user.mfa_enabled) {
      return NextResponse.json(
        { message: "MFA is already enabled. Disable it before enrolling again." },
        { status: 400 }
      );
    }

    const secret = speakeasy.generateSecret({
      name: `${ISSUER} (${user.email})`,
      issuer: ISSUER,
      length: 32,
    });

    await pool.query(
      "UPDATE Users SET mfa_secret = ?, mfa_enabled = FALSE WHERE id = ?",
      [secret.base32, userId]
    );

    await logAccessEvent({
      ...auditContext,
      category: "mfa",
      eventType: "mfa_setup_started",
      decision: "info",
      severity: "low",
      userId,
      sessionId: Number(decoded.sessionId) || null,
      deviceId: Number(decoded.deviceId) || null,
      message: "MFA setup started",
    });

    const otpauthUrl = secret.otpauth_url;
    const qrDataUrl = otpauthUrl
      ? await QRCode.toDataURL(otpauthUrl)
      : null;

    return NextResponse.json({
      message: "Scan the QR code with your authenticator app, then verify with POST /api/auth/mfa-verify",
      otpauthUrl,
      qrDataUrl,
    });
  } catch (error) {
    console.error("mfa-setup:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
