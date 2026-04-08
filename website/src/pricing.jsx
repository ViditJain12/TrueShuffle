import React from "react";
import ReactDOM from "react-dom/client";
import { motion } from "framer-motion";
import { ArrowLeft, BadgeCheck, CalendarDays, Check } from "lucide-react";
import "./index.css";

const pricingPlans = [
  {
    name: "Monthly",
    price: "$1",
    cadence: "/month",
    originalPrice: null,
    savings: null,
    highlight: false,
    copy: "Perfect for listeners who want a dramatically better shuffle experience without thinking about it.",
    points: [
      "TrueShuffle desktop app",
      "5-song rolling shuffle bursts",
      "Smarter repeat timing",
      "All core updates included",
    ],
  },
  {
    name: "Yearly",
    price: "$10",
    cadence: "/year",
    originalPrice: "$12",
    savings: "Save 17%",
    highlight: true,
    copy: "Best for frequent listeners who want smarter shuffle every time they open Spotify.",
    points: [
      "Everything in Monthly",
      "Lower annual price",
      "Priority access to new features",
      "Best option for frequent listeners",
    ],
  },
];

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

function PricingPage() {
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
            <div className="brand-tag">Pricing</div>
          </div>
        </a>

        <nav className="top-links">
          <a href="./">Home</a>
          <a href="./index.html#features">Features</a>
          <a href="./index.html#future">Future</a>
          <a href="./coming-soon.html">Coming Soon</a>
        </nav>

        <a className="secondary-button top-cta" href="./">
          <ArrowLeft size={18} />
          Back home
        </a>
      </header>

      <main id="top">
        <section className="pricing-hero">
          <motion.div
            className="hero-copy pricing-copy"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div className="eyebrow">Simple, honest pricing</div>
            <h1>
              Fix Spotify shuffle
              <span> for less than a coffee.</span>
            </h1>
            <p className="hero-blurb">
              Spotify already handles playback. TrueShuffle makes every listening session smarter with
              burst-based shuffle, better spacing, and zero annoying repeats. Pricing stays intentionally
              tiny because this is a focused desktop experience, not another bloated subscription.
            </p>
          </motion.div>
        </section>

        <section className="pricing-section standalone-pricing">
          <div className="pricing-grid">
            {pricingPlans.map((plan, index) => (
              <motion.article
                key={plan.name}
                className={`pricing-card ${plan.highlight ? "pricing-card-highlight" : ""}`}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
              >
                <div className="pricing-topline">
                  <div>
                    <div className="pricing-name">{plan.name}</div>
                    <p>{plan.copy}</p>
                  </div>
                  {plan.highlight ? <div className="pricing-badge">2 months free</div> : null}
                </div>

                <div className="pricing-number">
                  {plan.originalPrice ? <div className="pricing-original">{plan.originalPrice}</div> : null}
                  <span>{plan.price}</span>
                  <small>{plan.cadence}</small>
                </div>
                {plan.savings ? <div className="pricing-savings">{plan.savings}</div> : null}

                <div className="pricing-points">
                  {plan.points.map((point) => (
                    <div key={point} className="pricing-point">
                      <Check size={16} />
                      {point}
                    </div>
                  ))}
                </div>

                <a className={plan.highlight ? "primary-button pricing-button" : "secondary-button pricing-button"} href="./index.html#demo">
                  <BadgeCheck size={18} />
                  {plan.highlight ? "Get better shuffle all year" : "Start for $1"}
                </a>
              </motion.article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PricingPage />
  </React.StrictMode>,
);
