'use client';

import { LogoMark, navLinks } from "./Navbar";
import Link from "next/link";
const footerNav = ["Subpage A", "Subpage B", "Subpage C", "Subpage D"];

function IconInstagram() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 7.2A4.8 4.8 0 1 0 16.8 12 4.81 4.81 0 0 0 12 7.2Zm0 7.93A3.13 3.13 0 1 1 15.13 12 3.14 3.14 0 0 1 12 15.13Zm6.09-8.14a1.12 1.12 0 1 1-1.12 1.12 1.12 1.12 0 0 1 1.12-1.12ZM20.4 7.2a4.4 4.4 0 0 0-2.47-2.47A6.56 6.56 0 0 0 12 4.2h-.8A6.56 6.56 0 0 0 6.07 4.73 4.4 4.4 0 0 0 3.6 7.2 6.56 6.56 0 0 0 3.07 12v.8a6.56 6.56 0 0 0 .53 4.93 4.4 4.4 0 0 0 2.47 2.47 6.56 6.56 0 0 0 4.93.53H12a6.56 6.56 0 0 0 4.93-.53 4.4 4.4 0 0 0 2.47-2.47 6.56 6.56 0 0 0 .53-4.93V12a6.56 6.56 0 0 0-.53-4.8ZM19 16.8a3.2 3.2 0 0 1-1.8 1.8A10.56 10.56 0 0 1 12 19h-.8a10.56 10.56 0 0 1-5.2-.4 3.2 3.2 0 0 1-1.8-1.8A10.56 10.56 0 0 1 5 12.8v-.8a10.56 10.56 0 0 1 .4-5.2 3.2 3.2 0 0 1 1.8-1.8A10.56 10.56 0 0 1 11.2 5h.8a10.56 10.56 0 0 1 5.2.4 3.2 3.2 0 0 1 1.8 1.8 10.56 10.56 0 0 1 .4 5.2v.8a10.56 10.56 0 0 1-.4 5.2Z" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="loginFooter">
      <div className="loginFooterInner">
        <div className="loginFooterGrid">
          <div className="loginFooterBrand">
            <Link href="/" className="loginLogo">
              <LogoMark />
              <p className="logoTextAlt">
                 Admin Portal
              </p>
            </Link>
            <p className="loginFooterBrandText">
              Our solutions accelerate businesses through mentorship and accessibility. Contact us for more info.
            </p>
          </div>
          <div>
            <p className="loginFooterColTitle">Navigation 1</p>
            <ul className="loginFooterLinks">
              {footerNav.map((label) => (
                <li key={label}>
                  <a href="#" className="loginFooterLink">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="loginFooterColTitle">Navigation 2</p>
            <ul className="loginFooterLinks">
              {footerNav.map((label) => (
                <li key={`n2-${label}`}>
                  <a href="#" className="loginFooterLink">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="loginFooterColTitle">Navigation 3</p>
            <ul className="loginFooterLinks">
              {footerNav.map((label) => (
                <li key={`n3-${label}`}>
                  <a href="#" className="loginFooterLink">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="loginFooterColTitle">Get In Touch</p>
            <div className="loginSocialRow">
              <button type="button" className="loginSocialBtn" aria-label="Instagram">
                <IconInstagram />
              </button>
              <button type="button" className="loginSocialBtn" aria-label="X">
                <IconX />
              </button>
              <button type="button" className="loginSocialBtn" aria-label="Website">
                <IconGlobe />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="loginFooterBottom">
        <p className="loginCopyright">2026 Eventmaster</p>
        <div className="loginFooterLegal">
          {navLinks.map(({ href, label }) => (
            <a key={`legal-${label}`} href={href}>
              {label}
            </a>
          ))}
          <a href="#">Terms &amp; Conditions</a>
          <a href="#">Privacy Policy</a>
        </div>
      </div>
    </footer>
  );
}
