import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI || "http://127.0.0.1:5173";
const SONGS_PER_SESSION = 5;
const RECENT_TRACK_LIMIT = 25;
const PREP_WINDOW_MS = 20_000;
const HANDOFF_WINDOW_MS = 1_500;

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
];

const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const APP_SESSION_KEY = "trueshuffle_app_session_v1";

const STORAGE_KEYS = {
  verifier: "trueshuffle_pkce_verifier",
  accessToken: "trueshuffle_access_token",
  refreshToken: "trueshuffle_refresh_token",
  expiresAt: "trueshuffle_expires_at",
  authRedirectUri: "trueshuffle_auth_redirect_uri",
};

function isTauriDesktop() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function generateRandomString(length) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => charset[value % charset.length]).join("");
}

async function sha256(plain) {
  const data = new TextEncoder().encode(plain);
  return window.crypto.subtle.digest("SHA-256", data);
}

function base64UrlEncode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function createCodeChallenge(verifier) {
  const digest = await sha256(verifier);
  return base64UrlEncode(digest);
}

async function spotifyFetch(url, accessToken, options = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(`Spotify API ${response.status}: ${text || response.statusText}`);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text || null;
}

async function waitForBrowserDevice(accessToken, deviceId, retries = 10, delayMs = 400) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const devicesResponse = await spotifyFetch("https://api.spotify.com/v1/me/player/devices", accessToken);
    const devices = devicesResponse?.devices || [];
    const matchingDevice = devices.find((device) => device.id === deviceId);
    if (matchingDevice) {
      return matchingDevice;
    }
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }

  return null;
}

async function exchangeCodeForToken(code, redirectUri = localStorage.getItem(STORAGE_KEYS.authRedirectUri) || REDIRECT_URI) {
  const verifier = localStorage.getItem(STORAGE_KEYS.verifier);
  if (!verifier) {
    throw new Error("Missing PKCE verifier. Start login again.");
  }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text || response.statusText}`);
  }

  return response.json();
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${text || response.statusText}`);
  }

  return response.json();
}

function storeTokenResponse(tokenData) {
  localStorage.setItem(STORAGE_KEYS.accessToken, tokenData.access_token);
  if (tokenData.refresh_token) {
    localStorage.setItem(STORAGE_KEYS.refreshToken, tokenData.refresh_token);
  }
  localStorage.setItem(STORAGE_KEYS.expiresAt, String(Date.now() + tokenData.expires_in * 1000));
  return tokenData.access_token;
}

async function ensureValidAccessToken() {
  const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken);
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
  const expiresAt = Number(localStorage.getItem(STORAGE_KEYS.expiresAt) || "0");

  if (accessToken && Date.now() < expiresAt - 60_000) {
    return accessToken;
  }

  if (refreshToken) {
    const refreshed = await refreshAccessToken(refreshToken);
    return storeTokenResponse(refreshed);
  }

  return null;
}

async function beginLogin() {
  if (!CLIENT_ID) {
    throw new Error("Missing VITE_SPOTIFY_CLIENT_ID in sdk-react-test/.env.local");
  }

  const verifier = generateRandomString(64);
  const challenge = await createCodeChallenge(verifier);
  localStorage.setItem(STORAGE_KEYS.verifier, verifier);

  if (isTauriDesktop()) {
    const { redirectUri } = await invoke("start_spotify_auth_server");
    localStorage.setItem(STORAGE_KEYS.authRedirectUri, redirectUri);

    const url = new URL(AUTH_ENDPOINT);
    url.search = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: challenge,
      scope: SCOPES.join(" "),
    }).toString();

    await invoke("open_external_url", { url: url.toString() });

    const startedAt = Date.now();
    while (Date.now() - startedAt < 180_000) {
      const result = await invoke("poll_spotify_auth_result");
      if (result?.error) {
        throw new Error(`Spotify login failed: ${result.error}`);
      }

      if (result?.code) {
        const tokenData = await exchangeCodeForToken(result.code, redirectUri);
        const token = storeTokenResponse(tokenData);
        localStorage.removeItem(STORAGE_KEYS.authRedirectUri);
        return token;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 700));
    }

    throw new Error("Spotify login timed out. Please try again.");
  }

  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES.join(" "),
  }).toString();

  window.location.href = url.toString();
}

function clearSession() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(APP_SESSION_KEY);
  window.location.reload();
}

function serializeQueue(queue) {
  return queue
    .map((item) => item?.track?.id)
    .filter(Boolean);
}

function saveAppSession(sessionData) {
  try {
    localStorage.setItem(
      APP_SESSION_KEY,
      JSON.stringify({
        ...sessionData,
        updatedAt: Date.now(),
      }),
    );
  } catch {
    // Best-effort persistence only.
  }
}

function loadAppSession() {
  try {
    const raw = localStorage.getItem(APP_SESSION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function hydrateQueue(trackIds, availableTracks) {
  if (!Array.isArray(trackIds) || trackIds.length === 0) {
    return [];
  }

  const trackMap = new Map(
    availableTracks
      .filter((item) => item?.track?.id)
      .map((item) => [item.track.id, item]),
  );

  return trackIds
    .map((trackId) => trackMap.get(trackId))
    .filter(Boolean);
}

function getRecentKey(playlistId) {
  return `trueshuffle_recent_${playlistId}`;
}

function loadRecentTrackIds(playlistId) {
  if (!playlistId) {
    return [];
  }

  try {
    const value = localStorage.getItem(getRecentKey(playlistId));
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function appendRecentTrackIds(playlistId, trackIds) {
  if (!playlistId || trackIds.length === 0) {
    return;
  }

  const current = loadRecentTrackIds(playlistId);
  const combined = [...current.filter((id) => !trackIds.includes(id)), ...trackIds];
  localStorage.setItem(getRecentKey(playlistId), JSON.stringify(combined.slice(-RECENT_TRACK_LIMIT)));
}

function buildQueue(tracks, excludeIds = []) {
  const excludeSet = new Set(excludeIds);
  const validTracks = tracks.filter(
    (item) =>
      item.track &&
      item.track.id &&
      item.track.uri &&
      item.track.name &&
      Array.isArray(item.track.artists) &&
      item.track.artists.length > 0,
  );

  const preferred = validTracks.filter((item) => !excludeSet.has(item.track.id));
  const candidates = preferred.length >= SONGS_PER_SESSION ? preferred : validTracks;

  if (candidates.length < SONGS_PER_SESSION) {
    return [];
  }

  const pool = [...candidates];
  const queue = [];
  while (queue.length < SONGS_PER_SESSION) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    queue.push(pool.splice(randomIndex, 1)[0]);
  }
  return queue;
}

function formatArtists(track) {
  return (track?.artists || []).map((artist) => artist.name).join(", ");
}

function getTrackImage(track) {
  return track?.album?.images?.[0]?.url || "";
}

function formatDuration(durationMs) {
  const totalSeconds = Math.floor((durationMs || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getUniqueTrackCount(tracks) {
  return new Set(
    tracks
      .map((item) => item?.track?.id)
      .filter(Boolean),
  ).size;
}

function IconLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m17 3 4 4-4 4" />
      <path d="M3 7h18" />
      <path d="M7 21 3 17l4-4" />
      <path d="M21 17H3" />
      <path d="m8 8 8 8" />
      <path d="m16 8-8 8" />
    </svg>
  );
}

function IconSpotify() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M12 1.75a10.25 10.25 0 1 0 0 20.5 10.25 10.25 0 0 0 0-20.5Zm4.7 14.73a.64.64 0 0 1-.88.21c-2.43-1.48-5.5-1.82-9.11-1.03a.64.64 0 0 1-.27-1.26c3.96-.85 7.36-.45 10.05 1.19.3.18.39.57.2.89Zm1.25-2.77a.8.8 0 0 1-1.1.26c-2.78-1.71-7.02-2.2-10.3-1.2a.8.8 0 0 1-.47-1.54c3.74-1.14 8.38-.58 11.61 1.41.37.23.49.72.26 1.1Zm.1-2.9c-3.33-1.98-8.82-2.17-12-.98a.96.96 0 1 1-.67-1.8c3.65-1.36 9.73-1.1 13.65 1.22a.96.96 0 0 1-.98 1.56Z" />
    </svg>
  );
}

function IconPlay({ className = "h-6 w-6" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l10-6.5-10-6.5Z" />
    </svg>
  );
}

function IconPause({ className = "h-6 w-6" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M7 5h4v14H7zm6 0h4v14h-4z" />
    </svg>
  );
}

function IconPrev() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M6 5h2v14H6zM18 6.2 9.5 12l8.5 5.8V6.2Z" />
    </svg>
  );
}

function IconNext() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M16 5h2v14h-2zM6 17.8 14.5 12 6 6.2v11.6Z" />
    </svg>
  );
}

function IconShuffle() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 3h5v5" />
      <path d="m4 20 7-7" />
      <path d="m21 3-7.5 7.5" />
      <path d="M13 13 4 4" />
      <path d="M16 21h5v-5" />
      <path d="m21 21-7.5-7.5" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="m12 2 1.76 4.74L18.5 8.5l-4.74 1.76L12 15l-1.76-4.74L5.5 8.5l4.74-1.76L12 2Zm7 11 1.1 2.9L23 17l-2.9 1.1L19 21l-1.1-2.9L15 17l2.9-1.1L19 13ZM5 13l1.1 2.9L9 17l-2.9 1.1L5 21l-1.1-2.9L1 17l2.9-1.1L5 13Z" />
    </svg>
  );
}

function IconDotsVertical() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function Equalizer({ active }) {
  return (
    <div className="flex items-end gap-1">
      {[10, 16, 8, 14].map((height, index) => (
        <motion.span
          key={index}
          className={`w-1 rounded-full ${active ? "bg-emerald-400" : "bg-white/25"}`}
          animate={active ? { height: [6, height, 8, height - 2, 6] } : { height: 4 }}
          transition={{ duration: 1.1 + index * 0.15, repeat: Infinity, ease: "easeInOut" }}
          style={{ height: active ? height : 4 }}
        />
      ))}
    </div>
  );
}

function App() {
  const playerRef = useRef(null);
  const monitorRef = useRef(null);
  const handoffInProgressRef = useRef(false);
  const currentQueueRef = useRef([]);
  const authExchangeInFlightRef = useRef(false);
  const pendingRestoreRef = useRef(null);
  const hasAttemptedPlaybackRestoreRef = useRef(false);
  const hasHydratedPlaylistStateRef = useRef(false);
  const wheelCooldownRef = useRef(false);
  const wheelDeltaAccumulatorRef = useRef(0);

  const [accessToken, setAccessToken] = useState(null);
  const [status, setStatus] = useState("Checking Spotify session...");
  const [profile, setProfile] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [tracks, setTracks] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPaused, setIsPaused] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [currentQueue, setCurrentQueue] = useState([]);
  const [preparedQueue, setPreparedQueue] = useState([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);

  async function handleLogin() {
    try {
      setStatus(isTauriDesktop() ? "Opening Spotify in your browser..." : "Redirecting to Spotify...");
      const token = await beginLogin();
      if (token) {
        setAccessToken(token);
        setStatus("Spotify login complete.");
      }
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    currentQueueRef.current = currentQueue;
  }, [currentQueue]);

  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const error = params.get("error");

        if (error) {
          throw new Error(`Spotify login failed: ${error}`);
        }

        if (code) {
          if (authExchangeInFlightRef.current) {
            return;
          }

          authExchangeInFlightRef.current = true;
          const tokenData = await exchangeCodeForToken(code);
          const token = storeTokenResponse(tokenData);
          if (!cancelled) {
            setAccessToken(token);
            setStatus("Spotify login complete.");
          }
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        const token = await ensureValidAccessToken();
        if (!cancelled && token) {
          setAccessToken(token);
          setStatus("Connected to saved Spotify session.");
        } else if (!cancelled) {
          setStatus("Login required to start your browser-native player.");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error.message);
        }
      } finally {
        authExchangeInFlightRef.current = false;
      }
    }

    initAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    async function loadAccountData() {
      try {
        const [me, playlistResponse] = await Promise.all([
          spotifyFetch("https://api.spotify.com/v1/me", accessToken),
          spotifyFetch("https://api.spotify.com/v1/me/playlists?limit=50", accessToken),
        ]);

        if (cancelled) {
          return;
        }

        const playlistItems = playlistResponse.items || [];
        const savedSession = loadAppSession();
        const savedPlaylistId = savedSession?.selectedPlaylistId;
        const savedPlaylistExists = playlistItems.some((playlist) => playlist.id === savedPlaylistId);

        setProfile(me);
        setPlaylists(playlistItems);
        if (playlistItems.length > 0) {
          setSelectedPlaylistId((current) => current || (savedPlaylistExists ? savedPlaylistId : playlistItems[0].id));
        }
        setStatus("Spotify connected. Generate a fresh queue and press play.");
      } catch (error) {
        if (!cancelled) {
          setStatus(error.message);
        }
      }
    }

    loadAccountData();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedPlaylistId) {
      return;
    }

    hasHydratedPlaylistStateRef.current = false;
    let cancelled = false;

    async function loadTracks() {
      try {
        if (!cancelled) {
          setIsPlaylistLoading(true);
        }
        let url = `https://api.spotify.com/v1/playlists/${selectedPlaylistId}/tracks?limit=100`;
        const allItems = [];

        while (url) {
          const data = await spotifyFetch(url, accessToken);
          allItems.push(...(data.items || []));
          url = data.next;
        }

        const playable = allItems.filter(
          (item) =>
            item.track &&
            item.track.id &&
            item.track.uri &&
            item.track.name &&
            Array.isArray(item.track.artists) &&
            item.track.artists.length > 0,
        );

        if (!cancelled) {
          const savedSession = loadAppSession();
          const canRestorePlaylist = savedSession?.selectedPlaylistId === selectedPlaylistId;
          const restoredCurrentQueue = canRestorePlaylist ? hydrateQueue(savedSession.currentQueueTrackIds, playable) : [];
          const restoredPreparedQueue = canRestorePlaylist ? hydrateQueue(savedSession.preparedQueueTrackIds, playable) : [];
          const restoredIndex =
            canRestorePlaylist && Number.isInteger(savedSession.currentQueueIndex)
              ? Math.max(0, Math.min(savedSession.currentQueueIndex, restoredCurrentQueue.length - 1))
              : -1;
          const restoredTrack =
            canRestorePlaylist && savedSession.currentTrackId
              ? restoredCurrentQueue.find((item) => item.track.id === savedSession.currentTrackId)?.track ||
                restoredPreparedQueue.find((item) => item.track.id === savedSession.currentTrackId)?.track ||
                null
              : null;

          setTracks(playable);
          setCurrentQueue(restoredCurrentQueue);
          setPreparedQueue(restoredPreparedQueue);
          setCurrentQueueIndex(restoredIndex);
          setCurrentTrack(restoredTrack);
          setIsPaused(canRestorePlaylist ? savedSession.isPaused ?? true : true);
          setPositionMs(canRestorePlaylist ? savedSession.positionMs || 0 : 0);
          setDurationMs(canRestorePlaylist ? savedSession.durationMs || 0 : 0);
          setIsRestoringSession(canRestorePlaylist && restoredCurrentQueue.length > 0);
          pendingRestoreRef.current =
            canRestorePlaylist && restoredCurrentQueue.length > 0
              ? {
                  ...savedSession,
                  currentQueue: restoredCurrentQueue,
                }
              : null;
          hasAttemptedPlaybackRestoreRef.current = false;
          hasHydratedPlaylistStateRef.current = true;
          setStatus(
            restoredCurrentQueue.length > 0
              ? "Restored your saved TrueShuffle session."
              : `Loaded ${playable.length} playable tracks. Ready for a new burst.`,
          );
          setIsPlaylistLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          hasHydratedPlaylistStateRef.current = true;
          setIsRestoringSession(false);
          setStatus(error.message);
          setIsPlaylistLoading(false);
        }
      }
    }

    loadTracks();
    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedPlaylistId]);

  useEffect(() => {
    if (!selectedPlaylistId || !hasHydratedPlaylistStateRef.current || isPlaylistLoading) {
      return;
    }

    saveAppSession({
      selectedPlaylistId,
      currentQueueTrackIds: serializeQueue(currentQueue),
      preparedQueueTrackIds: serializeQueue(preparedQueue),
      currentQueueIndex,
      currentTrackId: currentTrack?.id || null,
      positionMs: Math.max(0, Math.floor(positionMs)),
      durationMs: Math.max(0, Math.floor(durationMs)),
      isPaused,
    });
  }, [selectedPlaylistId, currentQueue, preparedQueue, currentQueueIndex, currentTrack, positionMs, durationMs, isPaused, isPlaylistLoading]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    if (window.Spotify) {
      setSdkReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      setSdkReady(true);
    };
  }, [accessToken]);

  useEffect(() => {
    if (!sdkReady || !accessToken || playerRef.current) {
      return;
    }

    const player = new window.Spotify.Player({
      name: "TrueShuffle Browser Player",
      getOAuthToken: async (callback) => {
        const token = (await ensureValidAccessToken()) || accessToken;
        callback(token);
      },
      volume: 0.75,
    });

    player.addListener("ready", ({ device_id }) => {
      setDeviceId(device_id);
      setStatus("Browser player ready. Start your TrueShuffle session.");
    });

    player.addListener("not_ready", ({ device_id }) => {
      setStatus(`Browser player went offline: ${device_id}`);
    });

    player.addListener("initialization_error", ({ message }) => {
      setStatus(`Initialization error: ${message}`);
    });

    player.addListener("authentication_error", ({ message }) => {
      setStatus(`Authentication error: ${message}`);
    });

    player.addListener("account_error", ({ message }) => {
      setStatus(`Account error: ${message}. Spotify Premium is required.`);
    });

    player.addListener("playback_error", ({ message }) => {
      setStatus(`Playback error: ${message}`);
    });

    player.addListener("player_state_changed", (state) => {
      if (!state) {
        return;
      }

      const track = state.track_window.current_track || null;
      setCurrentTrack(track);
      setIsPaused(state.paused);
      setPositionMs(state.position || 0);
      setDurationMs(state.duration || 0);

      if (!track) {
        return;
      }

      setCurrentQueueIndex((previousIndex) => {
        const queueIndex = currentQueueRef.current.findIndex((item) => item.track.id === track.id);
        return queueIndex >= 0 ? queueIndex : previousIndex;
      });
    });

    player.connect();
    playerRef.current = player;

    return () => {
      player.disconnect();
      playerRef.current = null;
    };
  }, [sdkReady, accessToken]);

  useEffect(() => {
    const pendingRestore = pendingRestoreRef.current;
    if (!pendingRestore || hasAttemptedPlaybackRestoreRef.current || !accessToken || !deviceId || isPlaylistLoading) {
      return;
    }

    if (!pendingRestore.currentTrackId || pendingRestore.currentQueueIndex < 0 || pendingRestore.currentQueue.length === 0) {
      hasAttemptedPlaybackRestoreRef.current = true;
      pendingRestoreRef.current = null;
      setIsRestoringSession(false);
      return;
    }

    hasAttemptedPlaybackRestoreRef.current = true;

    async function restorePlaybackSession() {
      const restored = await playQueue(pendingRestore.currentQueue, pendingRestore.currentQueueIndex, {
        markAsRecent: false,
        transferFirst: true,
        startPositionMs: pendingRestore.positionMs || 0,
        statusMessage: "Restored your saved TrueShuffle session.",
      });

      if (!restored) {
        pendingRestoreRef.current = null;
        setIsRestoringSession(false);
        return;
      }

      if (pendingRestore.isPaused) {
        try {
          await spotifyFetch(
            `https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(deviceId)}`,
            accessToken,
            { method: "PUT" },
          );
          setIsPaused(true);
        } catch (error) {
          setStatus(error.message);
        }
      }

      pendingRestoreRef.current = null;
      setIsRestoringSession(false);
    }

    restorePlaybackSession();
  }, [accessToken, deviceId, isPlaylistLoading, selectedPlaylistId]);

  function createFreshQueue() {
    if (isPlaylistLoading) {
      setStatus("Playlist is still loading. Give it a moment before generating a queue.");
      return [];
    }

    const excludeIds = [...loadRecentTrackIds(selectedPlaylistId), ...currentQueue.map((item) => item.track.id)];
    const queue = buildQueue(tracks, excludeIds);
    if (queue.length === 0) {
      setStatus("Not enough playable songs in this playlist to build a 5-song queue.");
      return [];
    }

    setCurrentQueue(queue);
    setPreparedQueue([]);
    setCurrentQueueIndex(0);
    setStatus("Fresh TrueShuffle burst ready.");
    return queue;
  }

  async function playQueue(queue, startIndex = 0, options = {}) {
    const { markAsRecent = true, transferFirst = true, statusMessage, startPositionMs = 0 } = options;

    if (!accessToken || !deviceId || queue.length === 0) {
      setStatus("The browser player is not ready yet.");
      return false;
    }

    try {
      handoffInProgressRef.current = true;

      if (transferFirst) {
        if (playerRef.current) {
          await playerRef.current.activateElement();
        }

        const knownDevice = await waitForBrowserDevice(accessToken, deviceId);
        if (!knownDevice) {
          throw new Error("Browser player was not detected by Spotify yet. Wait a second and try again.");
        }

        await spotifyFetch("https://api.spotify.com/v1/me/player", accessToken, {
          method: "PUT",
          body: JSON.stringify({
            device_ids: [deviceId],
            play: false,
          }),
        });

        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }

      await spotifyFetch(`https://api.spotify.com/v1/me/player/shuffle?state=false&device_id=${encodeURIComponent(deviceId)}`, accessToken, {
        method: "PUT",
      });
      await spotifyFetch(`https://api.spotify.com/v1/me/player/repeat?state=off&device_id=${encodeURIComponent(deviceId)}`, accessToken, {
        method: "PUT",
      });

      await spotifyFetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
        accessToken,
        {
          method: "PUT",
          body: JSON.stringify({
            uris: [queue[startIndex].track.uri],
            position_ms: Math.max(0, Math.floor(startPositionMs)),
          }),
        },
      );

      setCurrentQueue(queue);
      setCurrentQueueIndex(startIndex);
      setCurrentTrack(queue[startIndex]?.track || null);
      setIsPaused(false);
      setPositionMs(Math.max(0, Math.floor(startPositionMs)));
      setDurationMs(queue[startIndex]?.track?.duration_ms || 0);
      if (markAsRecent) {
        appendRecentTrackIds(
          selectedPlaylistId,
          queue.map((item) => item.track.id),
        );
      }

      if (statusMessage) {
        setStatus(statusMessage);
      }

      window.setTimeout(() => {
        handoffInProgressRef.current = false;
      }, 1200);

      return true;
    } catch (error) {
      handoffInProgressRef.current = false;
      setStatus(error.message);
      return false;
    }
  }

  async function playCurrentQueue() {
    if (isPlaylistLoading) {
      setStatus("Playlist is still loading. Wait for the tracks to finish loading first.");
      return;
    }

    const queueToPlay = currentQueue.length > 0 ? currentQueue : createFreshQueue();
    if (queueToPlay.length === 0) {
      return;
    }

    await playQueue(queueToPlay, 0, {
      statusMessage: "Now playing your TrueShuffle queue in the browser.",
    });
  }

  async function togglePlayback() {
    if (!accessToken || !deviceId) {
      setStatus("The browser player is not ready yet.");
      return;
    }

    if (currentQueue.length === 0) {
      await playCurrentQueue();
      return;
    }

    try {
      if (isPaused) {
        if (currentQueueIndex >= 0 && currentQueue[currentQueueIndex]) {
          await playQueue(currentQueue, currentQueueIndex, {
            markAsRecent: false,
            transferFirst: false,
            startPositionMs: positionMs,
          });
          return;
        }

        await spotifyFetch(
          `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
          accessToken,
          { method: "PUT" },
        );
        setIsPaused(false);
      } else {
        await spotifyFetch(
          `https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(deviceId)}`,
          accessToken,
          { method: "PUT" },
        );
        setIsPaused(true);
      }
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function ensurePreparedQueue() {
    if (preparedQueue.length > 0) {
      return preparedQueue;
    }

    const excludeIds = [
      ...loadRecentTrackIds(selectedPlaylistId),
      ...currentQueue.map((item) => item.track.id),
    ];
    const nextQueue = buildQueue(tracks, excludeIds);
    if (nextQueue.length === 0) {
      setStatus("Could not prepare the next queue. Try a larger playlist.");
      return [];
    }
    setPreparedQueue(nextQueue);
    return nextQueue;
  }

  async function nextTrack() {
    if (currentQueue.length === 0) {
      await playCurrentQueue();
      return;
    }

    if (currentQueueIndex >= 0 && currentQueueIndex < currentQueue.length - 1) {
      await playQueue(currentQueue, currentQueueIndex + 1, {
        markAsRecent: false,
        transferFirst: false,
      });
      return;
    }

    const nextQueueTracks = await ensurePreparedQueue();
    if (nextQueueTracks.length === 0) {
      return;
    }

    setPreparedQueue([]);
    await playQueue(nextQueueTracks, 0, {
      transferFirst: false,
      statusMessage: "New TrueShuffle burst started.",
    });
  }

  async function previousTrack() {
    if (currentQueue.length === 0 || currentQueueIndex <= 0) {
      return;
    }

    await playQueue(currentQueue, currentQueueIndex - 1, {
      markAsRecent: false,
      transferFirst: false,
    });
  }

  useEffect(() => {
    if (!playerRef.current || currentQueue.length === 0 || currentQueueIndex < 0) {
      return;
    }

    if (monitorRef.current) {
      window.clearInterval(monitorRef.current);
    }

    monitorRef.current = window.setInterval(async () => {
      if (!playerRef.current || handoffInProgressRef.current) {
        return;
      }

      const state = await playerRef.current.getCurrentState();
      if (!state || !state.track_window?.current_track) {
        return;
      }

      const track = state.track_window.current_track;
      const queueIndex = currentQueue.findIndex((item) => item.track.id === track.id);
      const remainingMs = Math.max((state.duration || 0) - (state.position || 0), 0);

      setCurrentTrack(track);
      setIsPaused(state.paused);
      setPositionMs(state.position || 0);
      setDurationMs(state.duration || 0);
      if (queueIndex >= 0) {
        setCurrentQueueIndex(queueIndex);
      }

      if (queueIndex === currentQueue.length - 1 && preparedQueue.length === 0 && remainingMs <= PREP_WINDOW_MS) {
        const nextQueueTracks = buildQueue(
          tracks,
          [...loadRecentTrackIds(selectedPlaylistId), ...currentQueue.map((item) => item.track.id)],
        );
        if (nextQueueTracks.length > 0) {
          setPreparedQueue(nextQueueTracks);
        }
      }

      if (remainingMs <= HANDOFF_WINDOW_MS || (state.paused && remainingMs <= 2_000)) {
        if (queueIndex >= 0 && queueIndex < currentQueue.length - 1) {
          await playQueue(currentQueue, queueIndex + 1, {
            markAsRecent: false,
            transferFirst: false,
          });
          return;
        }

        if (queueIndex === currentQueue.length - 1 && preparedQueue.length > 0) {
          const nextQueueTracks = preparedQueue;
          setPreparedQueue([]);
          await playQueue(nextQueueTracks, 0, {
            transferFirst: false,
            statusMessage: "Next TrueShuffle queue is live.",
          });
        }
      }
    }, 1200);

    return () => {
      if (monitorRef.current) {
        window.clearInterval(monitorRef.current);
        monitorRef.current = null;
      }
    };
  }, [currentQueue, currentQueueIndex, preparedQueue, selectedPlaylistId, tracks, accessToken, deviceId]);

  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId);
  const displayTrack = currentTrack || currentQueue[currentQueueIndex]?.track || null;
  const displayTrackImage = getTrackImage(displayTrack);
  const progressRatio = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  const activeQueueLabel = currentQueue.length > 0 ? `${currentQueue.length}-song burst` : "No burst yet";
  const profileLabel = profile?.display_name?.[0]?.toUpperCase() || "S";
  const queueItems = useMemo(() => currentQueue, [currentQueue]);
  const controlsDisabled = isPlaylistLoading || isRestoringSession || tracks.length === 0;
  const uniqueTrackCount = getUniqueTrackCount(tracks);
  const strictAvoidanceCapacity = Math.max(uniqueTrackCount - SONGS_PER_SESSION, 0);
  const effectiveRepeatWindow = Math.min(RECENT_TRACK_LIMIT, strictAvoidanceCapacity);
  const fallbackRepeatsAllowed = effectiveRepeatWindow < SONGS_PER_SESSION;
  const selectedPlaylistIndex = Math.max(
    playlists.findIndex((playlist) => playlist.id === selectedPlaylistId),
    0,
  );
  const wheelPlaylists = playlists
    .map((playlist, index) => ({
      ...playlist,
      index,
      distance: index - selectedPlaylistIndex,
    }))
    .filter((playlist) => Math.abs(playlist.distance) <= 3);

  function selectPlaylistByIndex(index) {
    if (playlists.length === 0) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(index, playlists.length - 1));
    const nextPlaylist = playlists[boundedIndex];
    if (nextPlaylist && nextPlaylist.id !== selectedPlaylistId) {
      setSelectedPlaylistId(nextPlaylist.id);
      setStatus(`Loading ${nextPlaylist.name}...`);
    }
  }

  function handleWheelPlaylistChange(event) {
    event.preventDefault();
    if (wheelCooldownRef.current || playlists.length === 0) {
      return;
    }

    wheelDeltaAccumulatorRef.current += event.deltaY;
    if (Math.abs(wheelDeltaAccumulatorRef.current) < 70) {
      return;
    }

    wheelCooldownRef.current = true;
    const direction = wheelDeltaAccumulatorRef.current > 0 ? 1 : -1;
    wheelDeltaAccumulatorRef.current = 0;
    selectPlaylistByIndex(selectedPlaylistIndex + direction);

    window.setTimeout(() => {
      wheelCooldownRef.current = false;
    }, 80);
  }

  return (
    <div className="min-h-screen bg-[#05070A] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full bg-emerald-500/18 blur-3xl" />
        <div className="absolute right-[-4rem] top-24 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-72 w-96 -translate-x-1/2 rounded-full bg-emerald-500/8 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1320px] flex-col gap-6 px-4 py-6 lg:px-6">
        <motion.header
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-[30px] border border-white/8 bg-white/[0.03] px-6 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-400/20">
                <IconLogo />
              </div>
              <div className="min-w-0">
                <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">
                  True<span className="text-emerald-400">Shuffle</span>
                </h1>
                <p className="mt-2 text-sm font-medium text-white/65 md:text-base">
                  Smarter shuffle. No repeats. <span className="text-emerald-400">Always fresh.</span>
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/18 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200">
                    <IconSparkle />
                    {activeQueueLabel}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-white/55">
                    {selectedPlaylist?.name || "Choose a playlist"}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative self-start">
              <button
                onClick={() => setMenuOpen((open) => !open)}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/25 bg-white/[0.04] text-emerald-300 shadow-[0_12px_36px_rgba(29,185,84,0.12)] backdrop-blur-xl transition hover:border-emerald-300/40 hover:bg-white/[0.08]"
                aria-label="Spotify account menu"
              >
                {accessToken ? (
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-white">
                    {profileLabel}
                  </span>
                ) : (
                  <IconSpotify />
                )}
              </button>

              <AnimatePresence>
                {menuOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 top-16 z-20 w-56 rounded-2xl border border-white/8 bg-[#11151B]/90 p-3 shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
                  >
                    {accessToken ? (
                      <>
                        <div className="px-3 py-2 text-sm font-semibold text-white">{profile?.display_name || "Spotify connected"}</div>
                        <div className="px-3 pb-3 text-xs text-white/45">Secure • Native SDK</div>
                        <button
                          onClick={clearSession}
                          className="flex w-full items-center justify-center rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-medium text-white transition hover:bg-white/[0.1]"
                        >
                          Log out
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleLogin}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-[#051209] transition hover:bg-emerald-400"
                      >
                        <IconSpotify />
                        Login with Spotify
                      </button>
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </motion.header>

        {!accessToken ? (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="rounded-[32px] border border-white/8 bg-white/[0.03] p-8 shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-3xl font-bold text-white">Connect Spotify</h2>
              <p className="mt-3 text-white/60">
                Launch the browser-native TrueShuffle player with Spotify’s Web Playback SDK.
              </p>
              <button
                onClick={handleLogin}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-bold text-[#041108] shadow-[0_18px_40px_rgba(29,185,84,0.18)] transition hover:translate-y-[-1px] hover:bg-emerald-400"
              >
                <IconSpotify />
                Login with Spotify
              </button>
              <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left text-sm text-white/65">
                {status}
              </div>
            </div>
          </motion.section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
            <motion.aside
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.08 }}
              className="hidden lg:block"
            >
              <div className="sticky top-6 rounded-[30px] border border-white/8 bg-white/[0.03] px-4 py-5 shadow-[0_24px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                <div className="mb-4 px-2">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">Playlist Dial</div>
                  <div className="mt-2 text-sm text-white/50">Spin into a new source playlist.</div>
                </div>
                <div
                  onWheel={handleWheelPlaylistChange}
                  className="relative h-[520px] overflow-hidden overscroll-contain rounded-[26px] border border-white/6 bg-[radial-gradient(circle_at_left_center,rgba(29,185,84,0.12),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]"
                >
                  <div className="pointer-events-none absolute inset-y-0 left-0 w-24 rounded-r-full border-r border-white/6 bg-[radial-gradient(circle_at_left_center,rgba(29,185,84,0.16),transparent_70%)]" />
                  <div className="absolute inset-y-6 right-3 left-3">
                    {wheelPlaylists.map((playlist) => {
                      const translateY = 210 + playlist.distance * 78;
                      const translateX = Math.abs(playlist.distance) * 22;
                      const scale = playlist.distance === 0 ? 1 : 1 - Math.abs(playlist.distance) * 0.08;
                      const opacity = playlist.distance === 0 ? 1 : 0.72 - Math.abs(playlist.distance) * 0.14;
                      const isActive = playlist.id === selectedPlaylistId;

                      return (
                        <button
                          key={playlist.id}
                          onClick={() => selectPlaylistByIndex(playlist.index)}
                          className={`absolute left-0 right-0 flex origin-left items-center gap-3 rounded-2xl border px-4 py-4 text-left transition ${
                            isActive
                              ? "border-emerald-400/24 bg-emerald-500/[0.12] shadow-[0_18px_36px_rgba(16,185,129,0.16)]"
                              : "border-white/8 bg-white/[0.04] hover:bg-white/[0.07]"
                          }`}
                          style={{
                            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
                            opacity,
                          }}
                        >
                          <div className={`h-10 w-10 rounded-2xl ${isActive ? "bg-emerald-400/18 text-emerald-200" : "bg-white/[0.06] text-white/65"} flex items-center justify-center text-xs font-bold`}>
                            {playlist.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-semibold ${isActive ? "text-white" : "text-white/78"}`}>{playlist.name}</div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/30">
                              {isActive ? "Active source" : "Playlist"}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.aside>

            <div className="min-w-0">
              <div className="mb-4 lg:hidden">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 backdrop-blur-md">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/40">Source Playlist</div>
                  <select
                    value={selectedPlaylistId}
                    onChange={(event) => {
                      const nextIndex = playlists.findIndex((playlist) => playlist.id === event.target.value);
                      selectPlaylistByIndex(nextIndex);
                    }}
                    className="w-full bg-transparent text-sm font-semibold text-white outline-none"
                  >
                    {playlists.map((playlist) => (
                      <option key={playlist.id} value={playlist.id} className="bg-[#101418]">
                        {playlist.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.06 }}
              className="relative overflow-hidden rounded-[32px] border border-white/8 bg-white/[0.04] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl md:p-7"
            >
              <div className="pointer-events-none absolute inset-y-0 left-0 w-72 bg-[radial-gradient(circle_at_20%_30%,rgba(29,185,84,0.18),transparent_55%)]" />
              <div className="pointer-events-none absolute right-8 top-8 hidden h-28 w-20 rounded-full bg-emerald-400/10 blur-2xl lg:block" />
              <div className="relative grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
                <div className="rounded-[26px] border border-white/10 bg-[#0D1117]/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  {displayTrackImage ? (
                    <img
                      src={displayTrackImage}
                      alt={displayTrack?.name || "Album art"}
                      className="aspect-square w-full rounded-[22px] object-cover shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-[22px] bg-[radial-gradient(circle_at_top_left,rgba(29,185,84,0.28),transparent_40%),linear-gradient(135deg,#171D24,#0B1015)] text-4xl font-black tracking-wide text-emerald-200 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
                      TS
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-col justify-between">
                  <div>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/18 bg-emerald-500/10 px-4 py-2 text-xs font-semibold tracking-wide text-emerald-200">
                        <IconSparkle />
                        TrueShuffle Active
                      </span>
                      <div className="hidden items-center gap-2 text-emerald-300 lg:flex">
                        <Equalizer active={!isPaused} />
                      </div>
                    </div>

                    <div className="text-[11px] uppercase tracking-[0.2em] text-white/35">Now Playing</div>
                    <h2 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
                      {displayTrack?.name || "Nothing playing yet"}
                    </h2>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-emerald-300">
                      <span>{displayTrack ? formatArtists(displayTrack) : "Generate a queue to begin."}</span>
                      <span className="text-white/20">•</span>
                      <span className="text-white/60">{selectedPlaylist?.name || "No playlist selected"}</span>
                    </div>
                  </div>

                  <div className="mt-8">
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="absolute inset-y-0 left-0 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.55)]"
                        animate={{ width: `${progressRatio * 100}%` }}
                        transition={{ duration: 0.25 }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs font-medium text-white/45">
                      <span>{formatDuration(positionMs)}</span>
                      <span>{formatDuration(durationMs)}</span>
                    </div>

                    <div className="mt-6 flex items-center justify-center gap-4">
                  <button
                    onClick={createFreshQueue}
                    disabled={controlsDisabled}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/8 bg-white/[0.05] text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition enabled:hover:-translate-y-0.5 enabled:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Regenerate queue"
                  >
                    <IconShuffle />
                  </button>
                  <button
                    onClick={previousTrack}
                    disabled={controlsDisabled}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/8 bg-white/[0.05] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition enabled:hover:-translate-y-0.5 enabled:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Previous song"
                  >
                    <IconPrev />
                  </button>
                  <button
                    onClick={togglePlayback}
                    disabled={controlsDisabled}
                    className="flex h-20 w-20 items-center justify-center rounded-full border border-emerald-300/30 bg-[radial-gradient(circle_at_30%_30%,rgba(52,211,153,0.85),rgba(16,185,129,0.78))] text-[#041108] shadow-[0_0_0_6px_rgba(29,185,84,0.12),0_18px_48px_rgba(29,185,84,0.26)] transition enabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label={isPaused ? "Play queue" : "Pause queue"}
                  >
                    {isPaused ? <IconPlay className="ml-1 h-8 w-8" /> : <IconPause className="h-8 w-8" />}
                  </button>
                  <button
                    onClick={nextTrack}
                    disabled={controlsDisabled}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/8 bg-white/[0.05] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition enabled:hover:-translate-y-0.5 enabled:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Next song"
                  >
                    <IconNext />
                  </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="rounded-[30px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl md:p-6"
            >
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.6)]" />
                    <h3 className="text-2xl font-bold tracking-tight text-white">Smart Queue Timeline</h3>
                  </div>
                  <p className="mt-2 text-sm text-white/50">Your next 5 songs, intelligently shuffled.</p>
                </div>
                <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-400/18 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200">
                  <IconSparkle />
                  5-song burst
                </div>
              </div>

              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {queueItems.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-6 text-sm text-white/55"
                    >
                      Generate a fresh queue to start your first TrueShuffle burst.
                    </motion.div>
                  ) : (
                    queueItems.map((item, index) => {
                      const track = item.track;
                      const isActive = currentTrack?.id === track.id || currentQueueIndex === index;
                      return (
                        <motion.div
                          key={`${track.id}-${index}`}
                          layout
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className={`group flex items-center gap-4 rounded-[22px] border px-4 py-3 backdrop-blur-xl transition ${
                            isActive
                              ? "border-emerald-400/22 bg-emerald-500/[0.09] shadow-[0_0_0_1px_rgba(52,211,153,0.08),0_18px_44px_rgba(16,185,129,0.12)]"
                              : "border-white/8 bg-white/[0.035] hover:bg-white/[0.055]"
                          }`}
                        >
                          <div className="hidden text-white/20 sm:block">
                            <IconDotsVertical />
                          </div>
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-sm font-semibold text-white/85">
                            {index + 1}
                          </div>
                          {getTrackImage(track) ? (
                            <img src={getTrackImage(track)} alt={track.name} className="h-14 w-14 rounded-2xl object-cover shadow-[0_10px_30px_rgba(0,0,0,0.28)]" />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_top_left,rgba(29,185,84,0.2),transparent_40%),linear-gradient(135deg,#171D24,#0B1015)] text-sm font-bold text-emerald-200">
                              TS
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-base font-semibold text-white">{track.name}</div>
                            <div className="truncate text-sm text-white/48">{formatArtists(track)}</div>
                          </div>
                          <div className="hidden items-center gap-5 sm:flex">
                            {isActive ? <Equalizer active /> : <Equalizer active={false} />}
                            <div className="text-sm font-medium text-white/52">{formatDuration(track.duration_ms)}</div>
                            <div className={`h-7 w-7 rounded-full border ${isActive ? "border-emerald-400/30 bg-emerald-400/12" : "border-white/8 bg-white/[0.03]"}`} />
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </AnimatePresence>
              </div>
            </motion.section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
