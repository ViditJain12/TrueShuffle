import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  AudioLines,
  CalendarDays,
  Check,
  Clock3,
  Disc3,
  LockKeyhole,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Users,
  Waves,
  X,
} from "lucide-react";
import { useState } from "react";

const testerEmail = "viditjain2005@gmail.com";
const demoEndpoint = `https://formsubmit.co/ajax/${testerEmail}`;

const featureCards = [
  {
    icon: Shuffle,
    title: "Shuffle that stays alive",
    copy: "TrueShuffle keeps rebuilding the future of your queue in five-song bursts, so the session keeps opening up instead of settling into one stale order.",
  },
  {
    icon: Clock3,
    title: "Repeats with better timing",
    copy: "Songs can come back when the moment feels right, not after two tracks and not only after the entire playlist has burned out.",
  },
  {
    icon: AudioLines,
    title: "Built for playlist people",
    copy: "This is a focused desktop player for listeners who care about flow, pacing, and what their queue feels like over a long session.",
  },
];

const painPoints = [
  "Spotify shuffle can front-load the same artist, mood, or energy band.",
  "The future of the queue often feels decided too early, so discovery flattens out.",
  "People who care about flow want randomness without chaos or stale repetition.",
];

const benefits = [
  "Fresh five-song bursts make randomness feel intentional instead of messy.",
  "Repeat cooldown logic keeps favorite tracks from boomeranging back too quickly.",
  "The next burst is prepared in the background so the queue keeps moving cleanly.",
  "The player feels like a premium music product, not a workaround bolted onto Spotify.",
];

const futureFeatures = [
  {
    title: "Mood-based shuffle",
    copy: "Pick a mood like focus, gym, late night, or mellow and TrueShuffle can steer songs from your own playlists toward that feeling.",
  },
  {
    title: "No same artist too soon",
    copy: "Space artists out more naturally so one name does not dominate the session just because shuffle got lucky twice.",
  },
  {
    title: "Genre steering",
    copy: "Nudge long playlists toward a specific lane without losing the feeling of randomness or discovery.",
  },
  {
    title: "Skip learning",
    copy: "If you keep skipping a certain kind of song, TrueShuffle can learn from that behavior and improve the next bursts.",
  },
  {
    title: "Crowd mode",
    copy: "A session mode for parties and shared rooms where the goal is broader appeal without flattening the vibe.",
  },
  {
    title: "Session modes",
    copy: "Switch between tighter, balanced, or more adventurous bursts depending on how surprising you want the queue to feel.",
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

function DemoModal({ open, onClose }) {
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    spotifyEmail: "",
    useCase: "",
    why: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  function handleChange(event) {
    const { name, value } = event.target;
    setSubmitted(false);
    setSubmitError("");
    setFormState((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch(demoEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          _subject: "TrueShuffle demo request",
          _captcha: "false",
          name: formState.name,
          email: formState.email,
          spotify_account_email: formState.spotifyEmail,
          listening_style: formState.useCase || "-",
          shuffle_goal: formState.why || "-",
        }),
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      setSubmittedEmail(formState.email);
      setSubmitted(true);
      setFormState({
        name: "",
        email: "",
        spotifyEmail: "",
        useCase: "",
        why: "",
      });
    } catch {
      setSubmitError("Something went wrong while sending your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="signup-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="signup-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            className="signup-modal"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.24 }}
          >
            <button className="icon-button close-button" onClick={onClose} aria-label="Close demo form">
              <X size={18} />
            </button>

            <div className="signup-header">
              <div className="eyebrow">Book A Demo</div>
              <h3>Tell us a little about your listening style</h3>
              <p>
                Fill this out and we&apos;ll receive your request directly. We&apos;ll use it to follow up
                and coordinate early access.
              </p>
            </div>

            <form className="signup-grid" onSubmit={handleSubmit}>
              <label>
                Name
                <input name="name" value={formState.name} onChange={handleChange} placeholder="Alex Chen" required />
              </label>
              <label>
                Contact email
                <input name="email" type="email" value={formState.email} onChange={handleChange} placeholder="alex@email.com" required />
              </label>
              <label>
                Spotify account email
                <input
                  name="spotifyEmail"
                  type="email"
                  value={formState.spotifyEmail}
                  onChange={handleChange}
                  placeholder="The Spotify account you want to use with TrueShuffle"
                  required
                />
              </label>
              <label>
                Listening style
                <input
                  name="useCase"
                  value={formState.useCase}
                  onChange={handleChange}
                  placeholder="Gym playlists, deep house, Bollywood, long-focus work sessions..."
                />
              </label>
              <label className="full-span">
                What kind of shuffle experience are you looking for?
                <textarea
                  name="why"
                  value={formState.why}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Tell us what frustrates you about Spotify shuffle, what kind of playlists you use most, or why TrueShuffle caught your attention."
                />
              </label>

              <div className="signup-actions full-span">
                <button className="secondary-button" type="button" onClick={onClose}>
                  Close
                </button>
                <button className="primary-button" type="submit" disabled={isSubmitting}>
                  <CalendarDays size={18} />
                  {isSubmitting ? "Submitting..." : "Submit"}
                </button>
              </div>

              {submitted ? (
                <div className="signup-success full-span">
                  Your request was sent successfully. We&apos;ll reach out at <strong>{submittedEmail || "your email"}</strong> with the instructions.
                </div>
              ) : null}

              {submitError ? <div className="signup-error full-span">{submitError}</div> : null}
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default function App() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="site-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <div className="ambient ambient-bottom" />

      <header className="topbar">
        <a href="#top" className="brand-lockup">
          <TrueShuffleMark className="brand-mark" />
          <div>
            <div className="brand-name">TrueShuffle</div>
            <div className="brand-tag">A better shuffle experience for Spotify listeners</div>
          </div>
        </a>

        <nav className="top-links">
          <a href="#why">Why TrueShuffle</a>
          <a href="#features">Features</a>
          <a href="#future">Future</a>
          <a href="./pricing.html">Pricing</a>
          <a href="./coming-soon.html">Coming Soon</a>
        </nav>

        <button className="primary-button top-cta" onClick={() => setModalOpen(true)}>
          <CalendarDays size={18} />
          Book a demo
        </button>
      </header>

      <main id="top">
        <section className="hero-grid">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="eyebrow">Smarter Spotify sessions</div>
            <h1>
              Stop settling for
              <span> weak shuffle logic.</span>
            </h1>
            <p className="hero-blurb">
              TrueShuffle is a premium desktop player for people who love playlists but hate what
              Spotify shuffle does to them. It keeps the queue fresh, spaces repeats better, and
              makes every session feel less predictable without becoming chaotic.
            </p>

            <div className="hero-actions">
              <a className="secondary-button" href="#future">
                Explore future vision
                <ArrowRight size={18} />
              </a>
            </div>

            <div className="mini-stats">
              <div>
                <strong>5-song bursts</strong>
                <span>smaller queue windows keep discovery moving</span>
              </div>
              <div>
                <strong>Cooldown repeats</strong>
                <span>favorite tracks come back later, not immediately</span>
              </div>
              <div>
                <strong>$1/month</strong>
                <span>a tiny upgrade for people who care how shuffle feels</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="hero-visual"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
          >
            <div className="mock-window">
              <div className="mock-glow" />
              <div className="mock-header">
                <div className="window-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="window-title">TrueShuffle Desktop</div>
              </div>

              <div className="mock-player">
                <div className="mock-album">
                  <div className="album-core">
                    <TrueShuffleMark className="album-mark" />
                  </div>
                </div>

                <div className="mock-track-meta">
                  <div className="active-chip">
                    <Waves size={14} />
                    TrueShuffle Active
                  </div>
                  <h3>Night Drive Signals</h3>
                  <p>The queue keeps changing shape so the next song never feels locked in too early.</p>

                  <div className="progress-track">
                    <motion.div
                      className="progress-fill"
                      initial={{ width: "14%" }}
                      animate={{ width: ["14%", "64%", "36%"] }}
                      transition={{ duration: 7.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </div>

                  <div className="mock-controls">
                    <button className="icon-button">
                      <Shuffle size={18} />
                    </button>
                    <button className="icon-button">
                      <Disc3 size={18} />
                    </button>
                    <button className="play-button">
                      <AudioLines size={22} />
                    </button>
                    <button className="icon-button">
                      <Clock3 size={18} />
                    </button>
                    <button className="icon-button">
                      <Sparkles size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mock-queue">
                {["Open Sky Routine", "Lucky Static", "Midnight Rewrite", "Neon Replay", "Gravity Fade"].map((track, index) => (
                  <motion.div
                    key={track}
                    className={`queue-row ${index === 1 ? "active-row" : ""}`}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + index * 0.08 }}
                  >
                    <div className="queue-row-index">{index + 1}</div>
                    <div className="queue-row-meta">
                      <strong>{track}</strong>
                      <span>Fresh picks, cleaner pacing, better timing</span>
                    </div>
                    <div className="queue-row-length">3:{18 + index}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </section>

        <section className="problem-grid" id="why">
          <motion.div
            className="problem-panel"
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
          >
            <div className="eyebrow">The problem</div>
            <h2>Spotify shuffle is random, but it often does a bad job of preserving momentum.</h2>
            <p>
              Playlist listeners want novelty, pacing, and just enough familiarity to keep a session grounded.
              Standard shuffle often misses that balance. It can cluster similar tracks, overplay recent songs,
              and make the rest of the queue feel decided far too early.
            </p>

            <ul className="problem-list">
              {painPoints.map((point) => (
                <li key={point}>
                  <span className="dot" />
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            className="steps-panel"
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.08 }}
          >
            <div className="eyebrow">What changes</div>
            <h2>TrueShuffle makes shuffle feel more like a good DJ and less like a coin flip.</h2>

            <div className="benefit-list">
              {benefits.map((item) => (
                <div key={item} className="benefit-row">
                  <div className="benefit-icon">
                    <Check size={16} />
                  </div>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="feature-band" id="features">
          {featureCards.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.article
                key={feature.title}
                className="feature-card"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
              >
                <div className="feature-icon">
                  <Icon size={20} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </motion.article>
            );
          })}
        </section>

        <section className="future-section" id="future">
          <motion.div
            className="future-header"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
          >
            <div className="eyebrow">Future of TrueShuffle</div>
            <h2>Beyond better shuffle, this can become a smarter listening layer on top of Spotify.</h2>
            <p>
              The core product fixes weak shuffle logic today. The longer-term vision is a player that
              adapts to mood, context, taste, and group listening without losing what makes shuffle fun.
            </p>
          </motion.div>

          <div className="future-grid">
            {futureFeatures.map((feature, index) => (
              <motion.article
                key={feature.title}
                className="future-card"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
              >
                <div className="future-icon">
                  <Sparkles size={18} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </motion.article>
            ))}
          </div>

          <div className="future-footer">
            <a className="secondary-button" href="./pricing.html">
              See pricing
              <ArrowRight size={18} />
            </a>
          </div>
        </section>

        <section className="tester-panel" id="demo">
          <motion.div
            className="tester-content"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
          >
            <div className="tester-copy">
              <div className="eyebrow">Book a demo</div>
              <h2>Want to try TrueShuffle with your own playlists?</h2>
              <p>
                If the product feels right for you, request a demo and share the Spotify account you want
                connected. We are rolling access out carefully while the app is still in early release.
              </p>
            </div>

            <div className="tester-side">
              <div className="tester-perks">
                <div>
                  <Users size={18} />
                  Best for heavy playlist listeners
                </div>
                <div>
                  <SlidersHorizontal size={18} />
                  Help shape the product roadmap
                </div>
                <div>
                  <LockKeyhole size={18} />
                  Early access while rollout stays curated
                </div>
              </div>

              <button className="primary-button" onClick={() => setModalOpen(true)}>
                <CalendarDays size={18} />
                Request access
              </button>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <TrueShuffleMark className="footer-mark" />
          <div>
            <strong>TrueShuffle</strong>
            <span>For listeners who want shuffle to feel fresh, balanced, and worth staying inside.</span>
          </div>
        </div>

        <div className="footer-note">
          <a href="./pricing.html">View pricing</a> and book a demo if you want early access.
        </div>
      </footer>

      <DemoModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
