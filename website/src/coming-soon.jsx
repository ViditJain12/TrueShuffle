import React from "react";
import ReactDOM from "react-dom/client";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarDays, Sparkles } from "lucide-react";
import "./index.css";

function TrueShuffleMark({ className = "h-14 w-14" }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#tile)" />
      <rect x="2" y="2" width="60" height="60" rx="18" stroke="rgba(255,255,255,0.1)" />
      <path d="M44.2 18.5 50 24.2l-5.8 5.8" stroke="url(#stroke)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.2 24.2h31" stroke="url(#stroke)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M19.8 45.5 14 39.8l5.8-5.8" stroke="url(#stroke)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M45.8 39.8h-31" stroke="url(#stroke)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M24.5 28.4 40 36.9" stroke="url(#stroke)" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M40 28.4 24.5 36.9" stroke="url(#stroke)" strokeWidth="3.6" strokeLinecap="round" />
      <defs>
        <linearGradient id="tile" x1="8" y1="8" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0F171A" />
          <stop offset="1" stopColor="#091013" />
        </linearGradient>
        <linearGradient id="stroke" x1="15" y1="18" x2="49" y2="47" gradientUnits="userSpaceOnUse">
          <stop stopColor="#77FFC3" />
          <stop offset="0.55" stopColor="#35E98D" />
          <stop offset="1" stopColor="#12B96A" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ComingSoonPage() {
  return (
    <div className="site-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <div className="ambient ambient-bottom" />

      <header className="topbar">
        <a href="./" className="brand-lockup">
          <TrueShuffleMark className="brand-mark" />
          <div>
            <div className="brand-name">TrueShuffle</div>
            <div className="brand-tag">Coming soon</div>
          </div>
        </a>

        <nav className="top-links">
          <a href="./">Home</a>
          <a href="./pricing.html">Pricing</a>
          <a href="./index.html#future">Future</a>
          <a href="./index.html#demo">Book a demo</a>
        </nav>

        <a className="secondary-button top-cta" href="./">
          <ArrowLeft size={18} />
          Back home
        </a>
      </header>

      <main id="top">
        <section className="coming-shell">
          <motion.div
            className="coming-card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div className="coming-chip">
              <Sparkles size={16} />
              App release coming soon
            </div>
            <h1>TrueShuffle desktop is almost ready.</h1>
            <p>
              The app is currently in limited rollout while we keep polishing the experience.
              Wider access is coming soon. If you want to get in early, book a demo and we&apos;ll reach out.
            </p>

            <div className="coming-actions">
              <a className="primary-button" href="./index.html#demo">
                <CalendarDays size={18} />
                Book a demo
              </a>
              <a className="secondary-button" href="./pricing.html">
                See pricing
              </a>
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ComingSoonPage />
  </React.StrictMode>,
);
