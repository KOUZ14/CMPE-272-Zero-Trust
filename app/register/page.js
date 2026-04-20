'use client';
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import "../login/login.styles.scss";

/** Remember Me: email + name only (never the password). */
const REMEMBER_STORAGE_KEY = "eventmaster_register_remember";

function readRememberedRegister() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(REMEMBER_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const email = typeof data?.email === "string" ? data.email : "";
    const firstName =
      typeof data?.firstName === "string"
        ? data.firstName
        : typeof data?.username === "string"
          ? data.username
          : "";
    const lastName = typeof data?.lastName === "string" ? data.lastName : "";
    if (!email && !firstName && !lastName) return null;
    return { email, firstName, lastName };
  } catch {
    return null;
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = readRememberedRegister();
    if (saved) {
      queueMicrotask(() => {
        setEmail(saved.email);
        setFirstName(saved.firstName);
        setLastName(saved.lastName);
        setRemember(true);
      });
    }
  }, []);

  async function handleRegisterSubmit(e) {
    e.preventDefault();
    setError("");
    const emailTrim = email.trim();
    const firstTrim = firstName.trim();
    const lastTrim = lastName.trim();
    const password = String(e.currentTarget.password?.value || "");

    if (remember && (emailTrim || firstTrim || lastTrim)) {
      localStorage.setItem(
        REMEMBER_STORAGE_KEY,
        JSON.stringify({
          email: emailTrim,
          firstName: firstTrim,
          lastName: lastTrim,
        })
      );
    } else {
      localStorage.removeItem(REMEMBER_STORAGE_KEY);
    }

    if (!emailTrim || !password) {
      setError("Email and password are required.");
      return;
    }
    if (!firstTrim || !lastTrim) {
      setError("First and last name are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailTrim,
          password,
          firstName: firstTrim,
          lastName: lastTrim,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message || "Registration failed.");
        return;
      }

      router.push("/login?registered=1");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
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
          <h1 className="loginTitle">Register your account</h1>
          <p className="loginSubtitle">
            Let&apos;s fill out a few details, and we&apos;ll get you on your way.
          </p>

          {error ? <p className="loginError">{error}</p> : null}

          <form className="loginForm" onSubmit={handleRegisterSubmit}>
            <div className="loginField">
              <label htmlFor="register-email" className="loginLabel">
                Email Address
              </label>
              <input
                id="register-email"
                name="email"
                type="email"
                autoComplete="email"
                className="loginInput"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="loginNameRow">
              <div className="loginField">
                <label htmlFor="register-first-name" className="loginLabel">
                  First name
                </label>
                <input
                  id="register-first-name"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  className="loginInput"
                  placeholder="Jane"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="loginField">
                <label htmlFor="register-last-name" className="loginLabel">
                  Last name
                </label>
                <input
                  id="register-last-name"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  className="loginInput"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="loginField">
              <label htmlFor="register-password" className="loginLabel">
                Password
              </label>
              <input
                id="register-password"
                name="password"
                type="password"
                autoComplete="new-password"
                className="loginInput"
                placeholder="Create a password"
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
            </div>

            <button
              type="submit"
              className="loginSubmit"
              disabled={loading}
            >
              {loading ? "Creating account…" : "Register"}
            </button>
          </form>

          <p className="loginRegister">
            Already have an account?{" "}
            <Link href="/login" className="loginRegisterLink">
              Login
            </Link>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
