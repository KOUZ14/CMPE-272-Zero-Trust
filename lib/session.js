import pool from "./db";
import { generateRefreshTokenRaw, hashRefreshToken } from "./auth";

const DEFAULT_REFRESH_DAYS = 30;

/**
 * @param {{ userId: number, deviceId?: number|null, refreshDays?: number }} opts
 * @returns {Promise<{ sessionId: number, refreshToken: string, expiresAt: Date }>}
 */
export async function createSession({
  userId,
  deviceId = null,
  refreshDays = DEFAULT_REFRESH_DAYS,
}) {
  const refreshToken = generateRefreshTokenRaw();
  const refresh_token_hash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + refreshDays * 86400000);

  const [result] = await pool.query(
    `INSERT INTO Sessions (user_id, device_id, refresh_token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [userId, deviceId, refresh_token_hash, expiresAt]
  );

  return {
    sessionId: result.insertId,
    refreshToken,
    expiresAt,
  };
}

export async function revokeSession(sessionId, userId) {
  const [result] = await pool.query(
    `UPDATE Sessions
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    [sessionId, userId]
  );
  return result.affectedRows > 0;
}
