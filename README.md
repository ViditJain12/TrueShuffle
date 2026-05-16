# TrueShuffle

> **Note:** As of May 15, 2025, Spotify restricts third-party app access to verified organizations only (250k+ MAU minimum). TrueShuffle cannot be made publicly available due to this policy change. The app is fully functional but limited to manually allowlisted Spotify accounts.

TrueShuffle is a Spotify player that actually shuffles your music.

Spotify's built-in shuffle clusters songs, repeats artists, and plays the same tracks session after session. TrueShuffle replaces it with a burst-based queue that tracks what you've recently heard and makes sure it doesn't come back for a while.

## What It Does

Pick a playlist, hit play, and TrueShuffle builds a fresh 5-song burst drawn randomly from your library while avoiding the last 25 tracks you heard. When the burst is almost over, the next one is already prepared in the background so playback never gaps. You get genuinely random music without the awkward repeats.

Audio streams directly through Spotify — TrueShuffle just controls what plays and when.

## Running Locally

**Requirements:** Node.js and a Spotify Premium account.

```bash
# Clone the repo
git clone https://github.com/ViditJain12/TrueShuffle.git
cd TrueShuffle

# Install dependencies
npm install

# Add your Spotify app credentials
cp .env.example .env.local
# Fill in VITE_SPOTIFY_CLIENT_ID in .env.local

# Start the dev server
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) in your browser and log in with Spotify.

You'll need to add `http://127.0.0.1:5173` as a redirect URI in your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) app settings.
