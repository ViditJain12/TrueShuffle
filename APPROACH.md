# TrueShuffle — Approach & Technical Writeup

## The Problem

Spotify's built-in shuffle is notoriously bad. It clusters songs, repeats artists, and often plays the same tracks across back-to-back sessions. The algorithm is optimised for engagement rather than true randomness. TrueShuffle replaces it with a shuffle that actually feels random.

---

## How the Shuffle Works

The core idea is **burst-based queuing with a rolling exclusion window**.

Instead of shuffling an entire playlist upfront, TrueShuffle builds short **5-song bursts** on demand. Before picking tracks for a new burst, it looks up the last 25 played track IDs (stored in localStorage per playlist) and excludes them from the candidate pool. The result: songs you just heard can't appear for a long time, regardless of playlist size.

```
buildQueue(tracks, excludeIds):
  1. Filter out tracks in the exclusion set
  2. If enough preferred tracks exist, draw only from those
  3. Otherwise fall back to the full pool (small playlists)
  4. Fisher-Yates style random draw until 5 songs selected
```

The next burst is **pre-computed silently** while the last song of the current burst is still playing (20 seconds before it ends), so there's zero gap between bursts. A 1.5-second handoff window handles the actual track transition, detecting when the current song is nearly over and queuing the next one through the Spotify API.

---

## Auth — No Backend Required

TrueShuffle uses **Spotify's OAuth flow**, which is designed for public clients (apps with no server-side secret). The entire auth flow runs client-side:

1. Generate a cryptographically random `code_verifier` (64 chars, `crypto.getRandomValues`)
2. SHA-256 hash it → base64url encode → `code_challenge`
3. Redirect to Spotify with the challenge
4. Spotify redirects back with a short-lived `code`
5. Exchange `code + code_verifier` for access + refresh tokens
6. Store tokens in localStorage, refresh silently before expiry

No backend. No secrets. Tokens live only in the user's browser.

---

## Spotify Web Playback SDK

Playback is handled entirely in the browser via Spotify's **Web Playback SDK**. This registers the browser tab as a Spotify Connect device, meaning:

- Audio streams directly from Spotify's CDN to the browser
- The app controls playback by calling Spotify's REST API with a `device_id`
- Track state (position, duration, paused) is updated via SDK event listeners and a polling interval

The SDK requires **Spotify Premium** — this is a Spotify platform constraint, not a limitation of this app.

---

## Desktop App (Tauri + Rust)

The original version was a cross-platform desktop app built with **Tauri** (Rust backend + React frontend in a WebView). The desktop-specific challenge: OAuth requires a redirect URI, but a desktop app has no web server to receive it.

The solution: a **Rust TCP server** spun up on a random available port (`TcpListener::bind("127.0.0.1:0")`) for each login attempt. It:

1. Listens for one HTTP request (Spotify's redirect)
2. Parses the `code` query param from the raw HTTP request
3. Passes it back to the frontend via a `poll_spotify_auth_result` Tauri command
4. Serves a "You can close this tab" HTML page to the browser
5. Shuts down

The frontend polls every 700ms for up to 3 minutes. This avoids any custom URI scheme or OS-level browser integration.

---

## Web Deployment (Vercel)

The same React codebase runs as a standard web app. The Tauri-specific code paths are gated behind an `isTauriDesktop()` check (`window.__TAURI_INTERNALS__`), so the web build skips them entirely.

Deployed to **Vercel** with:
- A `vercel.json` rewrite rule (`"/(.*)" → "/index.html"`) for client-side routing
- `VITE_SPOTIFY_CLIENT_ID` and `VITE_SPOTIFY_REDIRECT_URI` as environment variables
- Vite builds to `dist/`, served as a static site

---

## Tech Stack

| Layer | Choice |
|---|---|
| UI | React 18 + Vite |
| Styling | Tailwind CSS v4 |
| Animation | Framer Motion |
| Auth | Spotify PKCE (no backend) |
| Playback | Spotify Web Playback SDK |
| Desktop shell | Tauri v2 (Rust) |
| Deployment | Vercel |

---

## Key Decisions

**Why PKCE instead of a backend auth server?**
Keeping auth entirely client-side means zero infrastructure to maintain. The tradeoff is that the client ID is visible in the source — acceptable for a public client where the PKCE verifier is the actual secret.

**Why burst queuing instead of a full shuffle upfront?**
A full upfront shuffle means committing to an order for hundreds of songs. Burst queuing keeps choices fresh and lets the exclusion window do its job progressively — each burst is chosen with full knowledge of what was just played.

**Why Tauri instead of Electron?**
Tauri ships a significantly smaller binary (~10MB vs ~150MB) by using the OS's native WebView instead of bundling Chromium. The Rust backend also gives direct access to system APIs like TCP sockets and `open` without Node.js overhead.
