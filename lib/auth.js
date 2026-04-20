import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const ACCESS_TTL = "1h";
const MFA_PENDING_TTL = "15m";

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return secret;
}

/**
 * @param {object} payload
 * @param {number} payload.sub
 * @param {string} payload.email
 * @param {string[]} payload.roles
 * @param {boolean} payload.mfaVerified
 * @param {number|null} [payload.deviceId]
 * @param {number} payload.sessionId
 */
export function signAccessToken(payload) {
  return jwt.sign(
    {
      typ: "access",
      sub: String(payload.sub),
      email: payload.email,
      roles: payload.roles,
      mfaVerified: payload.mfaVerified,
      deviceId: payload.deviceId ?? null,
      sessionId: payload.sessionId,
    },
    getJwtSecret(),
    { expiresIn: ACCESS_TTL }
  );
}

/** Short-lived token after password OK when MFA is required. */
export function signMfaPendingToken(userId) {
  return jwt.sign(
    { typ: "mfa_pending", sub: String(userId) },
    getJwtSecret(),
    { expiresIn: MFA_PENDING_TTL }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export function getBearerToken(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const t = auth.slice(7).trim();
  return t || null;
}

export function hashRefreshToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateRefreshTokenRaw() {
  return crypto.randomBytes(32).toString("hex");
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function parseRolesFromRow(roleNames) {
  if (!roleNames) return [];
  return String(roleNames)
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}
