'use client';

import Link from "next/link";

const LOGO_SRC = "/assets/logo.svg";

export function LogoMark({ className }) {
  return (
    <img
      src={LOGO_SRC}
      alt=""
      width={32}
      height={25}
      className={className ? `loginLogoImg ${className}` : "loginLogoImg"}
      aria-hidden
    />
  );
}

export const navLinks = [
  { href: "#", label: "Home" },
  { href: "#", label: "About Us" },
  { href: "#", label: "Resources" },
  { href: "#", label: "Contact" },
];

export default function Navbar() {
  return (
    <header className="loginHeader">
      <Link href="/" className="loginLogo">
        <LogoMark />
        <p className="logoText">
            Admin Portal
        </p>
      </Link>
      <nav className="loginNav" aria-label="Primary">
        {navLinks.map(({ href, label }) => (
          <a key={label} href={href} className="loginNavLink">
            {label}
          </a>
        ))}
      </nav>
      <button type="button" className="loginHeaderCta">
        <span className="loginHeaderCtaDot" aria-hidden />
        Get Started
      </button>
    </header>
  );
}
