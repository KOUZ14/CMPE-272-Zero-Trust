'use client';

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import "../login/login.styles.scss";
import { bearerJsonHeaders, getAccessToken } from "@/lib/clientAuth";

/**
 * @typedef {'loading' | 'intro' | 'qr' | 'already' | 'success'} EnrollPhase
 */

export default function MfaEnrollPage() {
  const router = useRouter();
  const [phase, setPhase] = useState(/** @type {EnrollPhase} */ ("loading"));
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const redirectToLogin = useCallback(() => {
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError("");
      setPhase("loading");
      const token = getAccessToken();
      if (!token) {
        redirectToLogin();
        return;
      }
      const res = await fetch("/api/users/me", {
        headers: bearerJsonHeaders(token),
      });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (!res.ok) {
        setError(data.message || "Could not load your profile.");
        setPhase("intro");
        return;
      }
      setUserEmail(typeof data.email === "string" ? data.email : "");
      if (data.mfa_enabled) {
        setPhase("already");
      } else {
        setPhase("intro");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [redirectToLogin]);

  async function handleStartSetup() {
    setError("");
    const token = getAccessToken();
    if (!token) {
      redirectToLogin();
      return;
    }

    setSetupLoading(true);
    try {
      const res = await fetch("/api/auth/mfa-setup", {
        method: "POST",
        headers: bearerJsonHeaders(token),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not start MFA setup.");
        return;
      }
      if (data.qrDataUrl) {
        setQrDataUrl(data.qrDataUrl);
      }
      setOtpauthUrl(typeof data.otpauthUrl === "string" ? data.otpauthUrl : "");
      setCode("");
      setPhase("qr");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      redirectToLogin();
      return;
    }

    setVerifyLoading(true);
    try {
      const res = await fetch("/api/auth/mfa-verify", {
        method: "POST",
        headers: bearerJsonHeaders(token),
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Verification failed.");
        return;
      }
      setPhase("success");
      setCode("");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setVerifyLoading(false);
    }
  }

  return (
    <div className="loginRoot">
      <div className="loginBg" aria-hidden>
        <div className="loginBgBlob loginBgBlobTop" />
        <div className="loginBgBlob loginBgBlobBottom" />
      </div>

      <Navbar />

      <main className="loginMain">
        <div className="loginCard">
          <div className="loginBrandIcon">
            <img
              src="/assets/logo-alt.svg"
              alt=""
              className="loginBrandIconImg"
              width={64}
              height={64}
              aria-hidden
            />
          </div>
          {phase !== "success" ? (
            <>
              <h1 className="loginTitle">Authenticator setup</h1>
              <p className="loginSubtitle">
                Add this account to Google Authenticator, Authy, or another TOTP app.
                {userEmail ? (
                  <>
                    {" "}
                    Signed in as <strong>{userEmail}</strong>.
                  </>
                ) : null}
              </p>
            </>
          ) : null}

          {phase !== "success" && error ? (
            <p className="loginError">{error}</p>
          ) : null}

          {phase === "loading" ? (
            <p className="loginSubtitle">Loading…</p>
          ) : null}

          {phase === "already" ? (
            <>
              <p className="loginInfo" style={{ textAlign: "center" }}>
                Two-factor authentication is already enabled on your account.
              </p>
              <Link href="/dashboard" className="loginSubmit" style={{ textAlign: "center", textDecoration: "none", display: "block" }}>
                Back to dashboard
              </Link>
            </>
          ) : null}

          {phase === "intro" ? (
            <>
              <ol className="loginMfaSteps">
                <li>Sign in if you haven&apos;t already (this page needs an active session).</li>
                <li>Install an authenticator app on your phone.</li>
                <li>Continue to generate a QR code and confirm with a 6-digit code.</li>
              </ol>
              <button
                type="button"
                className="loginSubmit"
                onClick={handleStartSetup}
                disabled={setupLoading}
              >
                {setupLoading ? "Preparing…" : "Continue to QR code"}
              </button>
              <p className="loginRegister" style={{ marginTop: "1.25rem" }}>
                <Link href="/login" className="loginRegisterLink">
                  Sign in
                </Link>
                {" · "}
                <Link href="/dashboard" className="loginRegisterLink">
                  Dashboard
                </Link>
              </p>
            </>
          ) : null}

          {phase === "qr" ? (
            <form className="loginForm" onSubmit={handleVerify}>
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Scan to add this account to your authenticator app"
                  className="loginMfaQr"
                  width={220}
                  height={220}
                />
              ) : (
                <p className="loginSubtitle">
                  QR image unavailable; use the manual setup key below.
                </p>
              )}

              <details className="loginMfaManual">
                <summary>Can&apos;t scan the QR code?</summary>
                <span>
                  Add a time-based account manually and paste this otpauth URL (or
                  copy the secret from your authenticator if it prompts for a key):
                </span>
                {otpauthUrl ? (
                  <code className="loginMfaManualUrl">{otpauthUrl}</code>
                ) : (
                  <p className="loginSubtitle" style={{ marginTop: "0.5rem" }}>
                    No otpauth URL returned. Try generating the QR again from the
                    previous step.
                  </p>
                )}
              </details>

              <div className="loginField">
                <label htmlFor="mfa-enroll-code" className="loginLabel">
                  Verification code
                </label>
                <input
                  id="mfa-enroll-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="loginInput"
                  placeholder="000000"
                  maxLength={6}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </div>

              <button
                type="submit"
                className="loginSubmit"
                disabled={verifyLoading}
              >
                {verifyLoading ? "Verifying…" : "Confirm and enable MFA"}
              </button>

              <p className="loginRegister" style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className="loginForgot"
                  onClick={() => {
                    setError("");
                    setQrDataUrl("");
                    setOtpauthUrl("");
                    setCode("");
                    setPhase("intro");
                  }}
                >
                  Start over
                </button>
              </p>
            </form>
          ) : null}

          {phase === "success" ? (
            <>
              <h1 className="loginTitle">All set</h1>
              <div className="loginSuccessScreen">
                <div className="loginSuccessMark" aria-hidden>
                  ✓
                </div>
                <h2 className="loginSuccessTitle">Two-factor authentication is on</h2>
                <p className="loginSuccessText">
                  Your authenticator code was accepted. From your next sign-in,
                  you&apos;ll enter a code from your app after your password.
                </p>
                <Link
                  href="/dashboard"
                  className="loginSubmit"
                  style={{
                    textAlign: "center",
                    textDecoration: "none",
                    display: "block",
                    marginBottom: "0.75rem",
                  }}
                >
                  Continue to portal
                </Link>
                <p className="loginRegister">
                  <Link href="/login" className="loginRegisterLink">
                    Back to sign in
                  </Link>
                </p>
              </div>
            </>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  );
}
