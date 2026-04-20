'use client';
import Link from "next/link";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import "./login/login.styles.scss";
import styles from "./page.module.css";
import {motion, AnimatePresence, useAnimation} from 'framer-motion'

export default function Home() {
  return (
    <div className="loginRoot">
      <div className="loginBg" aria-hidden>
        <div className="loginBgBlob loginBgBlobTop" />
        <div className="loginBgBlob loginBgBlobBottom" />
      </div>

      <Navbar />

      <main className={styles.landing}>
        <motion.section className={styles.hero}
          initial={{opacity:0, y:24}}
          animate={{opacity:1, y:0}}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 35,
          }}
        >
          <h1>Your next experience starts here</h1>
          <p>
            Eventmaster helps you find events and purchase entry in one place—clear,
            quick, and built for organizers and guests alike.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/register" className={styles.ctaPrimary}>
              Get started
            </Link>
            <Link href="/login" className={styles.ctaSecondary}>
              Sign in
            </Link>
          </div>
        </motion.section>
      </main>

      <Footer />
    </div>
  );
}
