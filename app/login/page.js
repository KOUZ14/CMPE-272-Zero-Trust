'use client';
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { storeSessionTokens } from "@/lib/clientAuth";
import "./login.styles.scss";

/** Remember Me: only the email is stored (never the password). */
const REMEMBER_STORAGE_KEY = "eventmaster_login_remember";

function readRememberedEmail() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(REMEMBER_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return typeof data?.email === "string" ? data.email : null;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mfaToken, setMfaToken] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoginSuccess, setMfaLoginSuccess] = useState(false);
  const [mfaSuccessUser, setMfaSuccessUser] = useState(null);
  const [registeredOk, setRegisteredOk] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("registered") === "1") {
      setRegisteredOk(true);
      router.replace("/login", { scroll: false });
    }
  }, [router]);

  useEffect(() => {
    const saved = readRememberedEmail();
    if (saved) {
      queueMicrotask(() => {
        setEmail(saved);
        setRemember(true);
      });
    }
  }, []);

  async function handleLoginSubmit(e) {
    e.preventDefault();
    setError("");
    const trimmed = email.trim();
    const password = String(e.currentTarget.password?.value || "");

    if (remember && trimmed) {
      localStorage.setItem(
        REMEMBER_STORAGE_KEY,
        JSON.stringify({ email: trimmed })
      );
    } else {
      localStorage.removeItem(REMEMBER_STORAGE_KEY);
    }

    if (!trimmed || !password) {
      setError("Enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message || "Sign in failed.");
        return;
      }

      if (data.mfaRequired && data.mfaToken) {
        setMfaToken(data.mfaToken);
        setMfaCode("");
        return;
      }

      if (data.accessToken) {
        storeSessionTokens(data);
        router.push("/");
        router.refresh();
        return;
      }

      setError("Unexpected response from server.");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e) {
    e.preventDefault();
    setError("");
    const code = mfaCode.trim();
    if (!/^\d{6}$/.test(code) || !mfaToken) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/mfa-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, mfaToken }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message || "Verification failed.");
        return;
      }

      if (data.accessToken) {
        storeSessionTokens(data);
        setMfaToken(null);
        setMfaCode("");
        setMfaSuccessUser(data.user ?? null);
        setMfaLoginSuccess(true);
        return;
      }

      setError("Unexpected response from server.");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function cancelMfa() {
    setMfaToken(null);
    setMfaCode("");
    setError("");
  }

  function continueAfterMfaSuccess() {
    router.push("/");
    router.refresh();
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
          {mfaLoginSuccess ? (
            <>
              <h1 className="loginTitle">You&apos;re in</h1>
              <div className="loginSuccessScreen">
                <div className="loginSuccessMark" aria-hidden>
                  ✓
                </div>
                <h2 className="loginSuccessTitle">Two-factor verification complete</h2>
                <p className="loginSuccessText">
                  Your authenticator code was accepted and your session is active.
                </p>
                {mfaSuccessUser?.email ? (
                  <p className="loginSuccessMeta">
                    Signed in as <strong>{mfaSuccessUser.email}</strong>
                  </p>
                ) : null}
                <button
                  type="button"
                  className="loginSubmit"
                  onClick={continueAfterMfaSuccess}
                >
                  Continue to portal
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="loginTitle">Welcome Back</h1>
              <p className="loginSubtitle">
                Let&apos;s fill out your details and get you on track.
              </p>

              {registeredOk ? (
                <p className="loginInfo">
                  Account created. You can sign in below.
                </p>
              ) : null}
              {error ? <p className="loginError">{error}</p> : null}

              {mfaToken ? (
                <form className="loginForm" onSubmit={handleMfaSubmit}>
                  <p className="loginSubtitle" style={{ marginBottom: "1rem" }}>
                    Enter the 6-digit code from your authenticator app.
                  </p>
                  <div className="loginField">
                    <label htmlFor="login-mfa-code" className="loginLabel">
                      Authentication code
                    </label>
                    <input
                      id="login-mfa-code"
                      name="mfaCode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="loginInput"
                      placeholder="000000"
                      maxLength={6}
                      value={mfaCode}
                      onChange={(e) =>
                        setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                    />
                  </div>
                  <button
                    type="submit"
                    className="loginSubmit"
                    disabled={loading}
                  >
                    {loading ? "Verifying…" : "Verify"}
                  </button>
                  <p className="loginRegister" style={{ marginTop: "1rem" }}>
                    <button
                      type="button"
                      className="loginForgot"
                      onClick={cancelMfa}
                    >
                      Use a different account
                    </button>
                  </p>
                </form>
              ) : (
                <form className="loginForm" onSubmit={handleLoginSubmit}>
              <div className="loginField">
                <label htmlFor="login-email" className="loginLabel">
                  Email address
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="text"
                  autoComplete="username"
                  className="loginInput"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="loginField">
                <label htmlFor="login-password" className="loginLabel">
                  Password
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="loginInput"
                  placeholder="Enter your password"
                />
              </div>

              <div className="loginRow">
                <label className="loginRemember">
                  <input
                    type="checkbox"
                    className="loginCheckbox"
                    name="remember"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Remember Me
                </label>
                <button type="button" className="loginForgot">
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                className="loginSubmit"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
              )}
            </>
          )}

          {!mfaLoginSuccess ? (
            <>
              <p className="loginRegister">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="loginRegisterLink">
                  Register
                </Link>
              </p>
              <p className="loginRegister" style={{ marginTop: "0.75rem" }}>
                <Link href="/mfa-enroll" className="loginRegisterLink">
                  Set up two-factor authentication
                </Link>
              </p>
            </>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  );
}
