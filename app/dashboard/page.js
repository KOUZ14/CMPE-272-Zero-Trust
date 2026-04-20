'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  bearerJsonHeaders,
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
} from "@/lib/clientAuth";
import Navbar from "../components/Navbar";
import styles from "./page.module.css";

function maskFingerprint(value) {
  if (!value) return "unknown";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function prettyDate(value) {
  if (!value) return "n/a";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "n/a";
  return d.toLocaleString();
}

function parseError(data, fallback) {
  return typeof data?.message === "string" ? data.message : fallback;
}

function makeFingerprint() {
  if (typeof window === "undefined") return "server";
  const parts = [
    navigator.userAgent ?? "",
    navigator.language ?? "",
    String(screen?.width ?? ""),
    String(screen?.height ?? ""),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
  ];
  return btoa(unescape(encodeURIComponent(parts.join("|")))).slice(0, 128);
}

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [me, setMe] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaQr, setMfaQr] = useState("");
  const [mfaUrl, setMfaUrl] = useState("");
  const [assignEmail, setAssignEmail] = useState("");
  const [assignRole, setAssignRole] = useState("manager");
  const [adminResult, setAdminResult] = useState("");
  const [showAllSessions, setShowAllSessions] = useState(false);

  const roleSet = useMemo(() => new Set(me?.roles || []), [me?.roles]);
  const isAdmin = roleSet.has("admin");
  const currentSessionId = me?.token?.sessionId ?? null;
  const visibleSessions = showAllSessions ? sessions : sessions.slice(0, 5);

  const authFetch = useCallback(
    async (url, opts = {}) => {
      const res = await fetch(url, {
        ...opts,
        headers: {
          ...bearerJsonHeaders(token),
          ...(opts.headers || {}),
        },
      });
      if (res.status === 401) {
        clearSessionTokens();
        router.replace("/login");
        return null;
      }
      return res;
    },
    [router, token]
  );

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [meRes, sessionRes, deviceRes] = await Promise.all([
        authFetch("/api/users/me"),
        authFetch("/api/sessions"),
        authFetch("/api/devices"),
      ]);
      if (!meRes || !sessionRes || !deviceRes) return;

      const [meData, sessionData, deviceData] = await Promise.all([
        meRes.json().catch(() => ({})),
        sessionRes.json().catch(() => ({})),
        deviceRes.json().catch(() => ({})),
      ]);

      if (!meRes.ok) {
        throw new Error(parseError(meData, "Failed to load profile"));
      }
      setMe(meData);

      if (sessionRes.ok) {
        setSessions(Array.isArray(sessionData.sessions) ? sessionData.sessions : []);
      } else {
        setSessions([]);
        setError((prev) =>
          prev || parseError(sessionData, "Sessions are temporarily unavailable")
        );
      }

      if (deviceRes.ok) {
        setDevices(Array.isArray(deviceData.devices) ? deviceData.devices : []);
      } else {
        setDevices([]);
        setError((prev) =>
          prev || parseError(deviceData, "Devices are temporarily unavailable")
        );
      }
    } catch (e) {
      setError(e.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [authFetch, token]);

  useEffect(() => {
    const access = getAccessToken();
    const refresh = getRefreshToken();
    if (!access) {
      router.replace("/login");
      return;
    }
    setToken(access);
    setRefreshToken(refresh);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    loadAll();
  }, [loadAll, token]);

  async function handleLogout() {
    if (!token) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: bearerJsonHeaders(token),
        body: JSON.stringify({ refreshToken: refreshToken ?? "" }),
      });
    } finally {
      clearSessionTokens();
      router.replace("/login");
      setBusy(false);
    }
  }

  async function handleRegisterCurrentDevice() {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/auth/register-device", {
        method: "POST",
        body: JSON.stringify({
          fingerprint: makeFingerprint(),
          deviceName: "Current browser",
        }),
      });
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseError(data, "Could not register device"));
      await loadAll();
    } catch (e) {
      setError(e.message || "Could not register device");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleTrust(deviceId, trusted) {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/devices/trust", {
        method: "POST",
        body: JSON.stringify({ deviceId, trusted: !trusted }),
      });
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseError(data, "Could not update trust"));
      await loadAll();
    } catch (e) {
      setError(e.message || "Could not update trust");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveDevice(deviceId) {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/devices/remove", {
        method: "POST",
        body: JSON.stringify({ deviceId }),
      });
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseError(data, "Could not remove device"));
      await loadAll();
    } catch (e) {
      setError(e.message || "Could not remove device");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevokeSession(sessionId) {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/sessions/revoke", {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      });
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseError(data, "Could not revoke session"));
      if (sessionId === currentSessionId) {
        clearSessionTokens();
        router.replace("/login");
        return;
      }
      await loadAll();
    } catch (e) {
      setError(e.message || "Could not revoke session");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartMfaSetup() {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/auth/mfa-setup", {
        method: "POST",
      });
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseError(data, "Could not start MFA setup"));
      setMfaQr(data.qrDataUrl || "");
      setMfaUrl(data.otpauthUrl || "");
    } catch (e) {
      setError(e.message || "Could not start MFA setup");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyMfa(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(mfaCode)) {
      setError("Enter a valid 6-digit MFA code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/auth/mfa-verify", {
        method: "POST",
        body: JSON.stringify({ code: mfaCode }),
      });
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseError(data, "Could not verify MFA"));
      setMfaCode("");
      setMfaQr("");
      setMfaUrl("");
      await loadAll();
    } catch (e) {
      setError(e.message || "Could not verify MFA");
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignRole(e) {
    e.preventDefault();
    setAdminResult("");
    if (!assignEmail.trim()) {
      setAdminResult("Provide a target email");
      return;
    }
    setBusy(true);
    try {
      const res = await authFetch("/api/users/assign-role", {
        method: "POST",
        body: JSON.stringify({
          email: assignEmail.trim().toLowerCase(),
          roleName: assignRole,
        }),
      });
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdminResult(parseError(data, "Role assignment failed"));
        return;
      }
      setAdminResult(`Assigned role '${assignRole}' to ${assignEmail.trim()}`);
      setAssignEmail("");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <p>Loading dashboard...</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <div>
          <h1>Security Dashboard</h1>
          <p>{me?.email || "Unknown user"}</p>
        </div>
        <div className={styles.topActions}>
          <button onClick={loadAll} disabled={busy}>
            Refresh
          </button>
          <button onClick={handleLogout} disabled={busy}>
            Logout
          </button>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.cards}>
        <article className={styles.card}>
          <h3>MFA Status</h3>
          <p>{me?.mfa_enabled ? "Enabled" : "Not enabled"}</p>
        </article>
        <article className={styles.card}>
          <h3>Roles</h3>
          <p>{(me?.roles || []).join(", ") || "none"}</p>
        </article>
        <article className={styles.card}>
          <h3>Active Session</h3>
          <p>{currentSessionId ? `#${currentSessionId}` : "unknown"}</p>
        </article>
        <article className={styles.card}>
          <h3>Trusted Devices</h3>
          <p>{devices.filter((d) => d.trusted).length}</p>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <h2>My Account</h2>
          <p><strong>Name:</strong> {me?.full_name || "n/a"}</p>
          <p><strong>Email:</strong> {me?.email || "n/a"}</p>
          <p><strong>Created:</strong> {prettyDate(me?.created_at)}</p>
          <p><strong>MFA Verified in Token:</strong> {me?.token?.mfaVerified ? "yes" : "no"}</p>
        </article>

        <article className={styles.panel}>
          <h2>MFA Center</h2>
          {me?.mfa_enabled ? (
            <p>MFA is currently enabled.</p>
          ) : (
            <>
              <button onClick={handleStartMfaSetup} disabled={busy}>
                Start MFA setup
              </button>
              {mfaQr ? (
                <div className={styles.mfaBlock}>
                  <img src={mfaQr} alt="MFA QR code" className={styles.qr} />
                  <details>
                    <summary>Manual setup URL</summary>
                    <code className={styles.code}>{mfaUrl || "Unavailable"}</code>
                  </details>
                  <form onSubmit={handleVerifyMfa} className={styles.inlineForm}>
                    <input
                      value={mfaCode}
                      onChange={(e) =>
                        setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="000000"
                      inputMode="numeric"
                      maxLength={6}
                    />
                    <button type="submit" disabled={busy}>
                      Verify
                    </button>
                  </form>
                </div>
              ) : null}
            </>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Sessions</h2>
          </div>
          <div className={styles.list}>
            {sessions.length === 0 ? <p>No sessions found.</p> : null}
            {visibleSessions.map((session) => (
              <div key={session.id} className={styles.row}>
                <div>
                  <p>
                    <strong>Session #{session.id}</strong>{" "}
                    {session.id === currentSessionId ? "(current)" : ""}
                  </p>
                  <p>Expires: {prettyDate(session.expires_at)}</p>
                  <p>Created: {prettyDate(session.created_at)}</p>
                  <p>Status: {session.revoked_at ? "revoked" : "active"}</p>
                </div>
                {!session.revoked_at ? (
                  <button
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={busy}
                  >
                    Revoke
                  </button>
                ) : null}
              </div>
            ))}
            {sessions.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAllSessions((v) => !v)}
                disabled={busy}
              >
                {showAllSessions ? "Show less" : "See more"}
              </button>
            ) : null}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Trusted Devices</h2>
            <button onClick={handleRegisterCurrentDevice} disabled={busy}>
              Register current device
            </button>
          </div>
          <div className={styles.list}>
            {devices.length === 0 ? <p>No devices found.</p> : null}
            {devices.map((device) => (
              <div key={device.id} className={styles.row}>
                <div>
                  <p><strong>{device.device_name || "Unnamed device"}</strong></p>
                  <p>Fingerprint: {maskFingerprint(device.fingerprint)}</p>
                  <p>IP: {device.ip_address || "n/a"}</p>
                  <p>Last seen: {prettyDate(device.last_seen_at)}</p>
                  <p>Status: {device.trusted ? "trusted" : "untrusted"}</p>
                </div>
                <div className={styles.actions}>
                  <button
                    onClick={() => handleToggleTrust(device.id, device.trusted)}
                    disabled={busy}
                  >
                    {device.trusted ? "Untrust" : "Trust"}
                  </button>
                  <button onClick={() => handleRemoveDevice(device.id)} disabled={busy}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        {isAdmin ? (
          <article className={styles.panel}>
            <h2>Admin: Assign Role</h2>
            <form onSubmit={handleAssignRole} className={styles.inlineForm}>
              <input
                type="email"
                placeholder="user@example.com"
                value={assignEmail}
                onChange={(e) => setAssignEmail(e.target.value)}
              />
              <select
                value={assignRole}
                onChange={(e) => setAssignRole(e.target.value)}
              >
                <option value="employee">employee</option>
                <option value="manager">manager</option>
                <option value="admin">admin</option>
              </select>
              <button type="submit" disabled={busy}>
                Assign
              </button>
            </form>
            {adminResult ? <p>{adminResult}</p> : null}
          </article>
        ) : null}
      </section>
    </main>
  );
}
