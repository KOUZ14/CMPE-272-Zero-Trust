'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  bearerJsonHeaders,
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
} from "@/lib/clientAuth";
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

function getLatestAccessDecision(resource, accessResults) {
  if (!resource) return null;
  const result = accessResults[resource.id];
  if (result) return result;
  return {
    allowed: Boolean(resource.eligible),
    reason: resource.eligibilityReason || "Access decision unavailable",
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [me, setMe] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [resources, setResources] = useState([]);
  const [accessResults, setAccessResults] = useState({});
  const [auditEvents, setAuditEvents] = useState([]);
  const [incidents, setIncidents] = useState([]);
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
  const [incidentNotes, setIncidentNotes] = useState({});

  const roleSet = useMemo(() => new Set(me?.roles || []), [me?.roles]);
  const isAdmin = roleSet.has("admin");
  const currentSessionId = me?.token?.sessionId ?? null;
  const visibleSessions = showAllSessions ? sessions : sessions.slice(0, 5);
  const hrResource = useMemo(
    () => resources.find((resource) => resource.name === "HR Portal") || null,
    [resources]
  );
  const financeResource = useMemo(
    () => resources.find((resource) => resource.name === "Finance System") || null,
    [resources]
  );
  const managerReportsResource = useMemo(
    () => resources.find((resource) => resource.name === "Manager Reports") || null,
    [resources]
  );
  const engineeringResource = useMemo(
    () => resources.find((resource) => resource.name === "Engineering Repository") || null,
    [resources]
  );
  const adminConsoleResource = useMemo(
    () => resources.find((resource) => resource.name === "Admin Console") || null,
    [resources]
  );
  const hrDecision = useMemo(
    () => getLatestAccessDecision(hrResource, accessResults),
    [hrResource, accessResults]
  );
  const financeDecision = useMemo(
    () => getLatestAccessDecision(financeResource, accessResults),
    [financeResource, accessResults]
  );
  const managerDecision = useMemo(
    () => getLatestAccessDecision(managerReportsResource, accessResults),
    [managerReportsResource, accessResults]
  );
  const engineeringDecision = useMemo(
    () => getLatestAccessDecision(engineeringResource, accessResults),
    [engineeringResource, accessResults]
  );
  const adminConsoleDecision = useMemo(
    () => getLatestAccessDecision(adminConsoleResource, accessResults),
    [adminConsoleResource, accessResults]
  );

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
      const [meRes, sessionRes, deviceRes, resourceRes] = await Promise.all([
        authFetch("/api/users/me"),
        authFetch("/api/sessions"),
        authFetch("/api/devices"),
        authFetch("/api/resources"),
      ]);
      if (!meRes || !sessionRes || !deviceRes || !resourceRes) return;

      const [meData, sessionData, deviceData, resourceData] = await Promise.all([
        meRes.json().catch(() => ({})),
        sessionRes.json().catch(() => ({})),
        deviceRes.json().catch(() => ({})),
        resourceRes.json().catch(() => ({})),
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

      if (resourceRes.ok) {
        setResources(Array.isArray(resourceData.resources) ? resourceData.resources : []);
      } else {
        setResources([]);
        setError((prev) =>
          prev || parseError(resourceData, "Resources are temporarily unavailable")
        );
      }

      const roles = Array.isArray(meData.roles) ? meData.roles : [];
      if (roles.includes("admin") && meData.token?.mfaVerified) {
        const [auditRes, incidentRes] = await Promise.all([
          authFetch("/api/admin/audit-events"),
          authFetch("/api/admin/incidents"),
        ]);
        if (auditRes) {
          const auditData = await auditRes.json().catch(() => ({}));
          setAuditEvents(auditRes.ok && Array.isArray(auditData.events) ? auditData.events : []);
        }
        if (incidentRes) {
          const incidentData = await incidentRes.json().catch(() => ({}));
          setIncidents(
            incidentRes.ok && Array.isArray(incidentData.incidents)
              ? incidentData.incidents
              : []
          );
        }
      } else {
        setAuditEvents([]);
        setIncidents([]);
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

  async function handleAccessResource(resourceId) {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/resources/access", {
        method: "POST",
        body: JSON.stringify({ resourceId }),
      });
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      setAccessResults((prev) => ({
        ...prev,
        [resourceId]: {
          allowed: Boolean(data.allowed),
          reason: data.reason || data.message || "Access decision unavailable",
        },
      }));
      await loadAll();
    } catch (e) {
      setError(e.message || "Could not evaluate resource access");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateIncident(incidentId, status, severity) {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/incidents", {
        method: "POST",
        body: JSON.stringify({
          incidentId,
          status,
          severity,
          notes: incidentNotes[incidentId] || "",
        }),
      });
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseError(data, "Could not update incident"));
      await loadAll();
    } catch (e) {
      setError(e.message || "Could not update incident");
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
        <article className={styles.card}>
          <h3>Open Incidents</h3>
          <p>{incidents.filter((i) => i.status === "open").length}</p>
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

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Resources</h2>
            <button onClick={loadAll} disabled={busy}>
              Refresh
            </button>
          </div>
          <div className={styles.list}>
            {resources.length === 0 ? <p>No resources found.</p> : null}
            {resources.map((resource) => {
              const result = accessResults[resource.id];
              return (
                <div key={resource.id} className={styles.row}>
                  <div>
                    <p><strong>{resource.name}</strong></p>
                    <p>{resource.description || "No description"}</p>
                    <p>
                      Segment: {resource.segment} | Sensitivity: {resource.sensitivity}
                    </p>
                    <p>
                      Current eligibility: {resource.eligible ? "likely allowed" : "not ready"}
                    </p>
                    {result ? (
                      <p
                        className={
                          result.allowed ? styles.successText : styles.warningText
                        }
                      >
                        {result.allowed ? "Allowed" : "Denied"}: {result.reason}
                      </p>
                    ) : (
                      <p>{resource.eligibilityReason}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleAccessResource(resource.id)}
                    disabled={busy}
                  >
                    Access
                  </button>
                </div>
              );
            })}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>HR Portal</h2>
            <button
              onClick={() => hrResource && handleAccessResource(hrResource.id)}
              disabled={busy || !hrResource}
            >
              Verify access
            </button>
          </div>
          {!hrResource ? (
            <p>HR Portal resource is not seeded yet.</p>
          ) : (
            <>
              <p>
                Segment: {hrResource.segment} | Sensitivity: {hrResource.sensitivity}
              </p>
              {hrDecision?.allowed ? (
                <div className={styles.portalContent}>
                  <p className={styles.successText}>Access granted: {hrDecision.reason}</p>
                  <div className={styles.portalGrid}>
                    <article className={styles.portalCard}>
                      <h3>Benefits Enrollment</h3>
                      <p>Current plan: Standard PPO</p>
                      <p>Open enrollment window: Active</p>
                    </article>
                    <article className={styles.portalCard}>
                      <h3>Time Off Balance</h3>
                      <p>Vacation: 54 hours</p>
                      <p>Sick leave: 18 hours</p>
                    </article>
                  </div>
                </div>
              ) : (
                <div className={styles.portalLocked}>
                  <p className={styles.warningText}>Access denied: {hrDecision?.reason}</p>
                  <p>
                    Complete required checks (active session, role policy, and MFA) then verify
                    access again.
                  </p>
                </div>
              )}
            </>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Finance System</h2>
            <button
              onClick={() => financeResource && handleAccessResource(financeResource.id)}
              disabled={busy || !financeResource}
            >
              Verify access
            </button>
          </div>
          {!financeResource ? (
            <p>Finance System resource is not seeded yet.</p>
          ) : (
            <>
              <p>
                Segment: {financeResource.segment} | Sensitivity: {financeResource.sensitivity}
              </p>
              {financeDecision?.allowed ? (
                <div className={styles.portalContent}>
                  <p className={styles.successText}>Access granted: {financeDecision.reason}</p>
                  <div className={styles.portalGrid}>
                    <article className={styles.portalCard}>
                      <h3>Budget Snapshot</h3>
                      <p>Q2 Operating Budget: $1.24M</p>
                      <p>Variance: -1.8%</p>
                    </article>
                    <article className={styles.portalCard}>
                      <h3>Invoice Queue</h3>
                      <p>Pending approvals: 6</p>
                      <p>High-priority invoices: 2</p>
                    </article>
                  </div>
                </div>
              ) : (
                <div className={styles.portalLocked}>
                  <p className={styles.warningText}>Access denied: {financeDecision?.reason}</p>
                  <p>
                    Finance access usually requires admin role, MFA-verified login, and a trusted
                    device.
                  </p>
                </div>
              )}
            </>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Manager Reports</h2>
            <button
              onClick={() =>
                managerReportsResource && handleAccessResource(managerReportsResource.id)
              }
              disabled={busy || !managerReportsResource}
            >
              Verify access
            </button>
          </div>
          {!managerReportsResource ? (
            <p>Manager Reports resource is not seeded yet.</p>
          ) : (
            <>
              <p>
                Segment: {managerReportsResource.segment} | Sensitivity:{" "}
                {managerReportsResource.sensitivity}
              </p>
              {managerDecision?.allowed ? (
                <div className={styles.portalContent}>
                  <p className={styles.successText}>Access granted: {managerDecision.reason}</p>
                  <div className={styles.portalGrid}>
                    <article className={styles.portalCard}>
                      <h3>Team Performance</h3>
                      <p>Active goals: 11</p>
                      <p>At-risk goals: 2</p>
                    </article>
                    <article className={styles.portalCard}>
                      <h3>Staffing Summary</h3>
                      <p>Open requisitions: 3</p>
                      <p>Backfills pending: 1</p>
                    </article>
                  </div>
                </div>
              ) : (
                <div className={styles.portalLocked}>
                  <p className={styles.warningText}>Access denied: {managerDecision?.reason}</p>
                  <p>
                    Manager reports require a manager/admin role with MFA verification and a
                    trusted device.
                  </p>
                </div>
              )}
            </>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Engineering Repository</h2>
            <button
              onClick={() => engineeringResource && handleAccessResource(engineeringResource.id)}
              disabled={busy || !engineeringResource}
            >
              Verify access
            </button>
          </div>
          {!engineeringResource ? (
            <p>Engineering Repository resource is not seeded yet.</p>
          ) : (
            <>
              <p>
                Segment: {engineeringResource.segment} | Sensitivity:{" "}
                {engineeringResource.sensitivity}
              </p>
              {engineeringDecision?.allowed ? (
                <div className={styles.portalContent}>
                  <p className={styles.successText}>
                    Access granted: {engineeringDecision.reason}
                  </p>
                  <div className={styles.portalGrid}>
                    <article className={styles.portalCard}>
                      <h3>Release Branches</h3>
                      <p>Release/2026.04.2 status: Ready</p>
                      <p>Security patch queue: 2</p>
                    </article>
                    <article className={styles.portalCard}>
                      <h3>Deployment Artifacts</h3>
                      <p>Last signed build: 5 minutes ago</p>
                      <p>Artifact integrity: Verified</p>
                    </article>
                  </div>
                </div>
              ) : (
                <div className={styles.portalLocked}>
                  <p className={styles.warningText}>
                    Access denied: {engineeringDecision?.reason}
                  </p>
                  <p>
                    Engineering repository access is restricted to admin policy requirements.
                  </p>
                </div>
              )}
            </>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Admin Console</h2>
            <button
              onClick={() => adminConsoleResource && handleAccessResource(adminConsoleResource.id)}
              disabled={busy || !adminConsoleResource}
            >
              Verify access
            </button>
          </div>
          {!adminConsoleResource ? (
            <p>Admin Console resource is not seeded yet.</p>
          ) : (
            <>
              <p>
                Segment: {adminConsoleResource.segment} | Sensitivity:{" "}
                {adminConsoleResource.sensitivity}
              </p>
              {adminConsoleDecision?.allowed ? (
                <div className={styles.portalContent}>
                  <p className={styles.successText}>
                    Access granted: {adminConsoleDecision.reason}
                  </p>
                  <div className={styles.portalGrid}>
                    <article className={styles.portalCard}>
                      <h3>Privileged Access</h3>
                      <p>Pending admin approvals: 2</p>
                      <p>Recent role changes: 4</p>
                    </article>
                    <article className={styles.portalCard}>
                      <h3>Security Operations</h3>
                      <p>Open incidents: {incidents.filter((i) => i.status === "open").length}</p>
                      <p>Critical alerts today: 1</p>
                    </article>
                  </div>
                </div>
              ) : (
                <div className={styles.portalLocked}>
                  <p className={styles.warningText}>
                    Access denied: {adminConsoleDecision?.reason}
                  </p>
                  <p>
                    Admin console requires admin role, MFA-verified login, and trusted device
                    posture.
                  </p>
                </div>
              )}
            </>
          )}
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

        {isAdmin ? (
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Monitoring</h2>
              <button onClick={loadAll} disabled={busy}>
                Refresh
              </button>
            </div>
            {!me?.token?.mfaVerified ? (
              <p>Admin monitoring requires an MFA-verified login.</p>
            ) : (
              <div className={styles.list}>
                {auditEvents.length === 0 ? <p>No audit events found.</p> : null}
                {auditEvents.slice(0, 12).map((event) => (
                  <div key={event.id} className={styles.eventRow}>
                    <p>
                      <strong>{event.category}/{event.event_type}</strong>{" "}
                      <span className={styles.badge}>{event.decision}</span>{" "}
                      <span className={styles.badge}>{event.severity}</span>
                    </p>
                    <p>{prettyDate(event.created_at)}</p>
                    <p>
                      User: {event.user_email || event.user_id || "n/a"} | Resource:{" "}
                      {event.resource_name || event.resource_id || "n/a"}
                    </p>
                    <p>{event.message || "No message"}</p>
                  </div>
                ))}
              </div>
            )}
          </article>
        ) : null}

        {isAdmin ? (
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Incident Response</h2>
              <button onClick={loadAll} disabled={busy}>
                Refresh
              </button>
            </div>
            {!me?.token?.mfaVerified ? (
              <p>Incident response requires an MFA-verified login.</p>
            ) : (
              <div className={styles.list}>
                {incidents.length === 0 ? <p>No incidents found.</p> : null}
                {incidents.map((incident) => (
                  <div key={incident.id} className={styles.incidentRow}>
                    <div>
                      <p>
                        <strong>{incident.title}</strong>{" "}
                        <span className={styles.badge}>{incident.status}</span>{" "}
                        <span className={styles.badge}>{incident.severity}</span>
                      </p>
                      <p>{incident.description || "No description"}</p>
                      <p>
                        Related user:{" "}
                        {incident.related_user_email || incident.related_user_id || "n/a"}
                      </p>
                      <p>
                        Created: {prettyDate(incident.created_at)} | Updated:{" "}
                        {prettyDate(incident.updated_at)}
                      </p>
                      {incident.notes ? <p>Notes: {incident.notes}</p> : null}
                      <textarea
                        value={incidentNotes[incident.id] || ""}
                        onChange={(e) =>
                          setIncidentNotes((prev) => ({
                            ...prev,
                            [incident.id]: e.target.value,
                          }))
                        }
                        placeholder="Triage notes"
                        className={styles.notes}
                      />
                    </div>
                    <div className={styles.actions}>
                      <button
                        onClick={() =>
                          handleUpdateIncident(
                            incident.id,
                            "investigating",
                            incident.severity
                          )
                        }
                        disabled={busy}
                      >
                        Investigate
                      </button>
                      <button
                        onClick={() =>
                          handleUpdateIncident(incident.id, "resolved", incident.severity)
                        }
                        disabled={busy}
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() =>
                          handleUpdateIncident(
                            incident.id,
                            "false_positive",
                            incident.severity
                          )
                        }
                        disabled={busy}
                      >
                        False Positive
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        ) : null}
      </section>
    </main>
  );
}
