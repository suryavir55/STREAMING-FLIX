import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipForward, SkipBack, Settings, X, Lock, Unlock,
  ChevronRight, FastForward, Rewind, Crop, Check, ExternalLink, Loader2, Download, PauseCircle, PlayCircle
} from "lucide-react";
import { db, ref, onValue, set, remove, update } from "@/lib/firebase";
import logoImg from "@/assets/logo.png";
import { getSessionUserDbKey } from "@/lib/userSession";
import { useUiConfig } from "@/hooks/useUiConfig";

interface QualityOption {
  label: string;
  src: string;
}

type StreamConfig = {
  proxyEnabled: boolean;
  proxyUrl: string;
  cdnEnabled: boolean;
  cdnUrl: string;
};

const DEFAULT_PROXY_URL = (() => {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
  if (!supabaseUrl || supabaseUrl.includes("placeholder.supabase.co")) return "";
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/video-proxy`;
})();

const DEFAULT_STREAM_CONFIG: StreamConfig = {
  proxyEnabled: true,
  proxyUrl: DEFAULT_PROXY_URL,
  cdnEnabled: true,
  cdnUrl: "https://rs-anime-3.rahatsarker224.workers.dev",
};

const buildRouteUrl = (baseUrl: string, targetUrl: string) => {
  const cleanBase = baseUrl.trim();
  if (!cleanBase) return "";
  if (cleanBase.includes("{url}")) {
    return cleanBase.replace("{url}", encodeURIComponent(targetUrl));
  }
  return `${cleanBase}${cleanBase.includes("?") ? "&" : "?"}url=${encodeURIComponent(targetUrl)}`;
};

// Proxy/CDN route HTTP URLs to avoid mixed content blocking
const proxyHttpUrl = (url: string, streamConfig: StreamConfig = DEFAULT_STREAM_CONFIG): string => {
  if (!url) return url;
  const trimmedUrl = url.trim();

  let normalizedUrl = trimmedUrl;
  try {
    const parsed = new URL(trimmedUrl);
    if (parsed.protocol === "https:" && parsed.port && parsed.port !== "443") {
      parsed.protocol = "http:";
      normalizedUrl = parsed.toString();
    }
  } catch {
    normalizedUrl = trimmedUrl;
  }

  if (normalizedUrl.startsWith("http://")) {
    if (streamConfig.proxyEnabled && streamConfig.proxyUrl) {
      const routed = buildRouteUrl(streamConfig.proxyUrl, normalizedUrl);
      if (routed) return routed;
    }
    if (streamConfig.cdnEnabled && streamConfig.cdnUrl) {
      const routed = buildRouteUrl(streamConfig.cdnUrl, normalizedUrl);
      if (routed) return routed;
    }
    return normalizedUrl;
  }
  return normalizedUrl;
};

interface VideoPlayerProps {
  src: string;
  title: string;
  subtitle?: string;
  poster?: string;
  onClose: () => void;
  onNextEpisode?: () => void;
  episodeList?: { number: number; active: boolean; onClick: () => void }[];
  qualityOptions?: QualityOption[];
  animeId?: string;
  onSaveProgress?: (currentTime: number, duration: number) => void;
}

const formatTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const VideoPlayer = ({ src, title, subtitle, poster, onClose, onNextEpisode, episodeList, qualityOptions, animeId, onSaveProgress }: VideoPlayerProps) => {
  const uiConfig = useUiConfig();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const rafId = useRef<number>(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [skipIndicator, setSkipIndicator] = useState<{ side: "left" | "right" | "center"; text: string } | null>(null);
  const [brightness, setBrightness] = useState(1);
  const [swipeState, setSwipeState] = useState<{ startX: number; startY: number; type: string | null } | null>(null);
  const cropModes = ["contain", "cover", "fill"] as const;
  const cropLabels = ["Fit", "Crop", "Stretch"];
  const [cropIndex, setCropIndex] = useState(0);
  const [settingsTab, setSettingsTab] = useState<"speed" | "quality">("speed");
  const [currentQuality, setCurrentQuality] = useState<string>("Auto");
  const [streamConfig, setStreamConfig] = useState<StreamConfig>(DEFAULT_STREAM_CONFIG);
  const [currentSrc, setCurrentSrc] = useState(proxyHttpUrl(src, DEFAULT_STREAM_CONFIG));
  const isProxied = currentSrc.includes('/functions/v1/video-proxy');
  const [isPremium, setIsPremium] = useState<boolean | null>(null); // null = loading
  const [adGateActive, setAdGateActive] = useState(false);
  const [shortenedLink, setShortenedLink] = useState<string | null>(null);
  const [shortenLoading, setShortenLoading] = useState(false);
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [qualityFailMsg, setQualityFailMsg] = useState<string | null>(null);
  const failedSrcsRef = useRef<Set<string>>(new Set());
  const [isBuffering, setIsBuffering] = useState(true);
  const [tutorialLink, setTutorialLink] = useState<string | null>(null);
  const [showTutorialVideo, setShowTutorialVideo] = useState(false);
  const [arolinkConfig, setArolinkConfig] = useState({ enabled: true, apiKey: "", accessHours: 24 });
  // Global download manager state
  const [activeDownloads, setActiveDownloads] = useState<Map<string, any>>(new Map());
  const [globalFreeAccess, setGlobalFreeAccess] = useState<boolean>(false);

  const mapStreamUrl = useCallback((url: string) => proxyHttpUrl(url, streamConfig), [streamConfig]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    import("@/lib/downloadManager").then(({ downloadManager }) => {
      unsub = downloadManager.subscribe(setActiveDownloads);
    });
    return () => { unsub?.(); };
  }, []);

  // Listen for global free access from Firebase
  useEffect(() => {
    const unsub = onValue(ref(db, "globalFreeAccess"), (snap) => {
      const data = snap.val();
      if (data?.active && data?.expiresAt > Date.now()) {
        setGlobalFreeAccess(true);
      } else {
        setGlobalFreeAccess(false);
      }
    });
    return () => unsub();
  }, []);

  // ===== VIDEO VIEW TRACKING =====
  useEffect(() => {
    if (!animeId) return;
    const getUserId = (): string | null => {
      try { const u = localStorage.getItem("rsanime_user"); if (u) return JSON.parse(u).id; } catch {} return null;
    };
    const uid = getUserId();
    if (!uid) return;

    // 1. Log a view count
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const viewRef = ref(db, `analytics/views/${animeId}/${today}/${uid}`);
    set(viewRef, { timestamp: Date.now(), title: title || "" }).catch(() => {});

    // 2. Track as active viewer (presence)
    const activeRef = ref(db, `analytics/activeViewers/${animeId}/${uid}`);
    const userName = (() => {
      try { return localStorage.getItem("rs_display_name") || JSON.parse(localStorage.getItem("rsanime_user") || "{}").name || "User"; } catch { return "User"; }
    })();
    set(activeRef, { title: title || "", userName, startedAt: Date.now() }).catch(() => {});

    // 3. Log to daily aggregate
    const dailyRef = ref(db, `analytics/dailyActive/${today}/${uid}`);
    set(dailyRef, { lastSeen: Date.now(), userName }).catch(() => {});

    return () => {
      // Remove active viewer on unmount
      remove(activeRef).catch(() => {});
    };
  }, [animeId, title]);

  // Check 24h access
  const has24hAccess = useCallback((): boolean => {
    if (globalFreeAccess) return true;
    try {
      const expiry = localStorage.getItem("rsanime_ad_access");
      if (expiry && parseInt(expiry) > Date.now()) return true;
    } catch {}
    return false;
  }, [globalFreeAccess]);

  // Load tutorial link from Firebase
  useEffect(() => {
    const unsub = onValue(ref(db, "settings/tutorialLink"), (snap) => {
      setTutorialLink(snap.val() || null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onValue(ref(db, "settings/arolink"), (snap) => {
      const data = snap.val() || {};
      setArolinkConfig({
        enabled: data.enabled !== false,
        apiKey: String(data.apiKey || "").trim(),
        accessHours: Number(data.accessHours) > 0 ? Number(data.accessHours) : 24,
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onValue(ref(db, "settings/streamConfig"), (snap) => {
      const data = snap.val() || {};
      setStreamConfig({
        proxyEnabled: data.proxyEnabled !== false,
        proxyUrl: String(data.proxyUrl || DEFAULT_PROXY_URL).trim(),
        cdnEnabled: data.cdnEnabled !== false,
        cdnUrl: String(data.cdnUrl || DEFAULT_STREAM_CONFIG.cdnUrl).trim(),
      });
    });
    return () => unsub();
  }, []);

  const shortenWithArolink = useCallback(async (apiKey: string, callbackUrl: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(
        `https://arolinks.com/api?api=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(callbackUrl)}`,
        {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        },
      );

      const data = await response.json().catch(() => null);
      if (!response.ok || !data) return null;

      return data.shortenedUrl || data.short || data.short_url || data.url || null;
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  // Maintenance pause listener
  useEffect(() => {
    const unsub = onValue(ref(db, "maintenance"), (snap) => {
      const maint = snap.val();
      if (!maint?.active && maint?.lastPauseDuration && maint?.lastResumedAt) {
        const appliedKey = `rsanime_pause_applied_${maint.lastResumedAt}`;
        if (!localStorage.getItem(appliedKey)) {
          const expiry = localStorage.getItem("rsanime_ad_access");
          if (expiry) {
            const newExpiry = parseInt(expiry) + maint.lastPauseDuration;
            localStorage.setItem("rsanime_ad_access", newExpiry.toString());
          }
          localStorage.setItem(appliedKey, "true");
        }
      }
    });
    return () => unsub();
  }, []);

  const grant24hAccess = useCallback(async () => {
    const expiry = Date.now() + arolinkConfig.accessHours * 60 * 60 * 1000;
    localStorage.setItem("rsanime_ad_access", expiry.toString());
  }, [arolinkConfig.accessHours]);

  // Premium check
  useEffect(() => {
    const uid = getSessionUserDbKey();
    if (!uid) { setIsPremium(false); return; }
    const premRef = ref(db, `users/${uid}/premium`);
    const unsub = onValue(premRef, (snap) => {
      const data = snap.val();
      setIsPremium(!!(data && data.active === true && data.expiresAt > Date.now()));
    });
    return () => unsub();
  }, []);

  // Ad gate - only run after premium check completes
  useEffect(() => {
    if (isPremium === null) return; // still loading premium status
    if (isPremium || has24hAccess() || !arolinkConfig.enabled) {
      setAdGateActive(false);
      setShortenLoading(false);
      setShortenedLink(null);
      return;
    }
    if (!arolinkConfig.apiKey) {
      setAdGateActive(false);
      setShortenLoading(false);
      setShortenedLink(null);
      return;
    }

    // No access - block video and show ad gate
    setAdGateActive(true);
    setVideoError(false);
    // Pause video immediately to prevent playing without access
    if (videoRef.current) {
      videoRef.current.pause();
    }

    setShortenLoading(true);
    setShortenedLink(null);

    const origin = window.location.origin;
    const unlockToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
    // Store token in Firebase for one-time use validation
    const userId = (() => {
      try { const u = localStorage.getItem("rsanime_user"); if (u) return JSON.parse(u).id || "anon"; } catch {} return "anon_" + Date.now();
    })();
    set(ref(db, `unlockTokens/${unlockToken}`), { 
      createdAt: Date.now(), 
      used: false, 
      createdBy: userId 
    }).catch(() => {});
    sessionStorage.setItem("rsanime_unlock_token", unlockToken);
    const callbackUrl = `${origin}/unlock?t=${unlockToken}`;

    let cancelled = false;
    (async () => {
      try {
        const shortLink = await shortenWithArolink(arolinkConfig.apiKey, callbackUrl);
        if (cancelled) return;

        if (shortLink) {
          setShortenedLink(shortLink);
        } else {
          setAdGateActive(false);
        }
      } catch {
        if (!cancelled) setAdGateActive(false);
      } finally {
        if (!cancelled) setShortenLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPremium, has24hAccess, arolinkConfig.enabled, arolinkConfig.apiKey, shortenWithArolink]);

  const handleOpenAdLink = useCallback(() => {
    if (shortenedLink) window.location.href = shortenedLink;
  }, [shortenedLink]);

  // Save progress every 10s
  useEffect(() => {
    if (!onSaveProgress) return;
    const v = videoRef.current;
    if (!v) return;
    const saveInterval = setInterval(() => {
      if (v.currentTime > 0 && v.duration > 0) onSaveProgress(v.currentTime, v.duration);
    }, 10000);
    const onPause = () => { if (v.currentTime > 0 && v.duration > 0) onSaveProgress(v.currentTime, v.duration); };
    v.addEventListener("pause", onPause);
    return () => {
      clearInterval(saveInterval);
      v.removeEventListener("pause", onPause);
      if (v.currentTime > 0 && v.duration > 0) onSaveProgress(v.currentTime, v.duration);
    };
  }, [onSaveProgress]);

  // Restore watch position
  useEffect(() => {
    if (!animeId) return;
    try {
      const user = localStorage.getItem("rsanime_user");
      if (!user) return;
      const userId = JSON.parse(user).id;
      if (!userId) return;
      import("@/lib/firebase").then(({ get: fbGet, ref: fbRef, db: fbDb }) => {
        const histRef = fbRef(fbDb, `users/${userId}/watchHistory/${animeId}`);
        fbGet(histRef).then((snap: any) => {
          if (snap.exists()) {
            const data = snap.val();
            if (data.currentTime && data.duration && (data.currentTime / data.duration) < 0.95) {
              const v = videoRef.current;
              if (v) {
                const tryRestore = () => { if (v.duration > 0) { v.currentTime = data.currentTime; v.removeEventListener("loadedmetadata", tryRestore); } };
                if (v.duration > 0) v.currentTime = data.currentTime;
                else v.addEventListener("loadedmetadata", tryRestore);
              }
            }
          }
        });
      });
    } catch {}
  }, [animeId]);

  // Build quality list
  const availableQualities: QualityOption[] = useMemo(() => {
    const list: QualityOption[] = [{ label: "Auto", src: mapStreamUrl(src) }];
    if (qualityOptions?.length) qualityOptions.forEach(q => { if (q.src) list.push({ ...q, src: mapStreamUrl(q.src) }); });
    return list;
  }, [src, qualityOptions, mapStreamUrl]);

  // Update src on prop change
  useEffect(() => { setCurrentSrc(mapStreamUrl(src)); setCurrentQuality("Auto"); setVideoError(false); setQualityFailMsg(null); failedSrcsRef.current.clear(); }, [src, mapStreamUrl]);

  // MediaSession API - show anime title + artwork in Chrome media notification
  useEffect(() => {
    if ('mediaSession' in navigator) {
      const artworkSrc = (() => {
        if (!poster) return `${window.location.origin}/favicon.ico`;
        try {
          return poster.startsWith("http") ? poster : new URL(poster, window.location.origin).toString();
        } catch {
          return `${window.location.origin}/favicon.ico`;
        }
      })();

      navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: subtitle || uiConfig.appName,
        album: uiConfig.appName,
        artwork: [
          { src: artworkSrc, sizes: "96x96" },
          { src: artworkSrc, sizes: "192x192" },
          { src: artworkSrc, sizes: "384x384" },
          { src: artworkSrc, sizes: "512x512" },
        ],
      });
      navigator.mediaSession.setActionHandler('play', () => { videoRef.current?.play(); });
      navigator.mediaSession.setActionHandler('pause', () => { videoRef.current?.pause(); });
      navigator.mediaSession.setActionHandler('seekbackward', () => seek(-10));
      navigator.mediaSession.setActionHandler('seekforward', () => seek(10));
      // Stop button - closes video and removes notification
      navigator.mediaSession.setActionHandler('stop', () => {
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.src = '';
        }
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
        onClose();
      });
      if (onNextEpisode) {
        navigator.mediaSession.setActionHandler('nexttrack', onNextEpisode);
      }
    }
    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.setActionHandler('stop', null);
      }
    };
  }, [title, subtitle, poster, onNextEpisode, onClose, uiConfig.appName]);

  const resetHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowControls(true);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [resetHideTimer]);

  // ===== OPTIMIZED: Use RAF for progress updates instead of timeupdate =====
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Track last known good position for fallback recovery
    let lastKnownTime = 0;
    const onLoaded = () => {
      setDuration(v.duration);
      if (pendingSeek.current !== null) {
        v.currentTime = pendingSeek.current;
        pendingSeek.current = null;
      }
      // Only autoplay if ad gate is not active
      if (!adGateActive) v.play().catch(() => {});
    };
    const onPlay = () => {
      setPlaying(true);
      // Start RAF loop for smooth progress
      const tick = () => {
        if (!v.paused && !v.ended) {
          const ct = v.currentTime;
          if (ct > 0) lastKnownTime = ct;
          const dur = v.duration;
          // Direct DOM updates for progress bar - avoids React re-renders
          if (progressRef.current && dur > 0) {
            progressRef.current.style.width = `${(ct / dur) * 100}%`;
          }
          if (timeDisplayRef.current && dur > 0) {
            timeDisplayRef.current.textContent = `${formatTime(ct)} / ${formatTime(dur)}`;
          }
          // Update React state less frequently (every ~500ms) for other consumers
          setCurrentTime(ct);
          rafId.current = requestAnimationFrame(tick);
        }
      };
      rafId.current = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(rafId.current);
    };
    const onEnded = () => {
      setPlaying(false);
      cancelAnimationFrame(rafId.current);
    };
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const onError = () => {
      if (adGateActive) return;

      if (retryCount >= MAX_RETRIES) {
        console.log('Video failed after retries. URL:', currentSrc);
        failedSrcsRef.current.add(currentSrc);
        const failedQualityLabel = currentQuality;
        
        const nextOption = availableQualities.find(
          (q) => !failedSrcsRef.current.has(mapStreamUrl(q.src)) && mapStreamUrl(q.src) !== currentSrc
        );
        
        if (nextOption) {
          setQualityFailMsg(`"${failedQualityLabel}" quality not available. Switching to "${nextOption.label}"...`);
          setTimeout(() => setQualityFailMsg(null), 4000);
          pendingSeek.current = lastKnownTime || v?.currentTime || 0;
          const newFallbackSrc = mapStreamUrl(nextOption.src);
          if (newFallbackSrc === currentSrc) {
            v.currentTime = pendingSeek.current;
            pendingSeek.current = null;
            v.load();
          } else {
            setCurrentSrc(newFallbackSrc);
          }
          setCurrentQuality(nextOption.label);
        } else {
          setVideoError(true);
        }
        return;
      }
      retryCount++;
      console.log(`Video error, retry ${retryCount}/${MAX_RETRIES}...`);
      // Exponential backoff: 500ms, 1000ms, 1500ms
      const delay = retryCount * 500;
      setTimeout(() => {
        if (v) {
          const savedTime = v.currentTime || lastKnownTime;
          // For MKV files, try removing the src attribute and re-setting it
          v.src = currentSrc;
          v.load();
          v.addEventListener('loadedmetadata', () => {
            if (savedTime > 0) v.currentTime = savedTime;
            v.play().catch(() => {});
          }, { once: true });
          // Also listen for canplay as fallback for MKV
          v.addEventListener('canplay', () => {
            if (savedTime > 0 && Math.abs(v.currentTime - savedTime) > 2) {
              v.currentTime = savedTime;
            }
            v.play().catch(() => {});
          }, { once: true });
        }
      }, delay);
    };
    const onCanPlay = () => {
      setVideoError(false);
      setIsBuffering(false);
      // Also apply pending seek here in case loadedmetadata didn't fire
      if (pendingSeek.current !== null && v.duration > 0) {
        v.currentTime = pendingSeek.current;
        pendingSeek.current = null;
      }
      if (v.paused && !adGateActive) v.play().catch(() => {});
    };
    const onCanPlayThrough = () => {
      setIsBuffering(false);
    };
    // Debounce waiting to avoid flashing loader on brief buffers
    let waitingTimer: ReturnType<typeof setTimeout> | null = null;
    const onWaiting = () => {
      if (waitingTimer) clearTimeout(waitingTimer);
      waitingTimer = setTimeout(() => setIsBuffering(true), 300);
    };
    const onPlaying = () => {
      if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = null; }
      setIsBuffering(false);
    };
    const onSeeked = () => {
      // Only clear buffering if video has enough data to play
      if (v.readyState >= 3) {
        if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = null; }
        setIsBuffering(false);
      }
    };

    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("canplaythrough", onCanPlayThrough);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("seeked", onSeeked);
    setIsBuffering(true);
    v.load();

    return () => {
      cancelAnimationFrame(rafId.current);
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("canplaythrough", onCanPlayThrough);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("seeked", onSeeked);
    };
  }, [currentSrc, adGateActive, availableQualities, currentQuality, mapStreamUrl]);

  useEffect(() => {
    const onFs = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) {
        try { (screen.orientation as any).unlock?.(); } catch {}
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
    resetHideTimer();
  }, [resetHideTimer]);

  const seek = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(v.currentTime + seconds, 0), v.duration);
    setSkipIndicator({ side: seconds > 0 ? "right" : "left", text: `${Math.abs(seconds)}s` });
    setTimeout(() => setSkipIndicator(null), 600);
    resetHideTimer();
  }, [resetHideTimer]);

  const toggleFullscreen = useCallback(async () => {
    const el = videoContainerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        // Exit fullscreen and unlock orientation
        try { (screen.orientation as any).unlock?.(); } catch {}
        await document.exitFullscreen();
      } else {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
        // Lock to landscape on mobile
        try { await (screen.orientation as any).lock?.("landscape"); } catch {}
      }
    } catch (e) { console.log('Fullscreen not supported'); }
  }, []);

  const setSpeed = useCallback((rate: number) => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettings(false);
  }, []);

  const switchQuality = useCallback((option: QualityOption) => {
    if (option.label === currentQuality) { setShowSettings(false); return; }
    const newSrc = mapStreamUrl(option.src);
    // If same URL (e.g. Auto and 4K share same link), just update label - no reload
    if (newSrc === currentSrc) {
      setCurrentQuality(option.label);
      setShowSettings(false);
      return;
    }
    const v = videoRef.current;
    pendingSeek.current = v?.currentTime || 0;
    setIsBuffering(true);
    setCurrentSrc(newSrc);
    setCurrentQuality(option.label);
    setShowSettings(false);
  }, [currentQuality, currentSrc, mapStreamUrl]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * v.duration;
    resetHideTimer();
  }, [resetHideTimer]);

  const lastTap = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  const handleVideoClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (locked) return;
    const now = Date.now();
    const clientX = "touches" in e ? e.changedTouches[0].clientX : e.clientX;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;

    if (now - lastTap.current.time < 300) {
      // Double tap
      if (relX < 0.33) seek(-10);
      else if (relX > 0.66) seek(10);
      else {
        togglePlay();
        setSkipIndicator({ side: "center", text: playing ? "⏸" : "▶" });
        setTimeout(() => setSkipIndicator(null), 600);
      }
      lastTap.current = { time: 0, x: 0 };
    } else {
      lastTap.current = { time: now, x: clientX };
      setTimeout(() => {
        if (lastTap.current.time === now) {
          // Single tap - toggle controls
          setShowControls(prev => {
            const next = !prev;
            if (hideTimer.current) clearTimeout(hideTimer.current);
            if (next) {
              hideTimer.current = setTimeout(() => setShowControls(false), 3000);
            }
            return next;
          });
        }
      }, 300);
    }
  }, [locked, seek, togglePlay, playing]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    setSwipeState({ startX: t.clientX, startY: t.clientY, type: null });
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeState || locked) return;
    const t = e.touches[0];
    const dy = t.clientY - swipeState.startY;
    if (!swipeState.type && Math.abs(dy) > 20) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const relX = (swipeState.startX - rect.left) / rect.width;
      setSwipeState({ ...swipeState, type: relX > 0.5 ? "volume" : "brightness" });
    }
    if (swipeState.type === "volume") {
      const newVol = Math.min(1, Math.max(0, volume - dy * 0.003));
      setVolume(newVol);
      if (videoRef.current) videoRef.current.volume = newVol;
      setSwipeState({ ...swipeState, startY: t.clientY });
    } else if (swipeState.type === "brightness") {
      const newBr = Math.min(1.5, Math.max(0.3, brightness - dy * 0.003));
      setBrightness(newBr);
      setSwipeState({ ...swipeState, startY: t.clientY });
    }
  }, [swipeState, locked, volume, brightness]);

  const handleTouchEnd = useCallback(() => setSwipeState(null), []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`fixed inset-0 z-[300] bg-background/[0.98] flex flex-col items-center ${isFullscreen ? '' : 'overflow-y-auto'}`} ref={containerRef}>
      {/* Close button */}
      {!isFullscreen && (
        <button onClick={onClose} className="absolute top-5 right-5 z-[310] w-10 h-10 rounded-full gradient-primary flex items-center justify-center btn-glow transition-all hover:rotate-90">
          <X className="w-5 h-5" />
        </button>
      )}

      <div className={`w-full ${isFullscreen ? 'h-full p-0' : 'max-w-full p-5'}`}>
        {!isFullscreen && (
          <div className="text-center mb-2.5">
            <h1 className="text-2xl font-extrabold text-primary text-glow tracking-wider">{uiConfig.appName} PLAYER</h1>
          </div>
        )}

        {!isFullscreen && (
          <div className="text-center mb-5">
            <p className="text-lg font-semibold">{title}</p>
            {subtitle && <p className="text-sm text-secondary-foreground">{subtitle}</p>}
          </div>
        )}

        {/* Video Container - will-change for GPU compositing */}
        <div
          ref={videoContainerRef}
          className={`relative bg-black overflow-hidden select-none ${
            isFullscreen 
              ? "w-screen h-screen rounded-none" 
              : "w-full rounded-xl aspect-video"
          }`}
          style={{ filter: `brightness(${brightness})`, willChange: "transform", margin: isFullscreen ? 0 : undefined, touchAction: isFullscreen ? "none" : "pan-y", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}
          onClick={handleVideoClick}
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={isFullscreen ? handleTouchStart : undefined}
          onTouchMove={isFullscreen ? handleTouchMove : undefined}
          onTouchEnd={isFullscreen ? handleTouchEnd : undefined}
        >
          <video
            ref={videoRef}
            src={currentSrc}
            className="w-full h-full"
            style={{ objectFit: cropModes[cropIndex], willChange: "transform" }}
            playsInline
            preload="auto"
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
            {...(isProxied ? { crossOrigin: "anonymous" } : {})}
          >
            {/* MKV/MP4 codec hints for better browser compatibility */}
            <source src={currentSrc} type={currentSrc.toLowerCase().endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4'} />
            <source src={currentSrc} type="video/webm" />
          </video>

          {/* Video Error Overlay */}
          {videoError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
              <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mb-4">
                <X className="w-8 h-8 text-destructive" />
              </div>
              <p className="text-base font-semibold text-foreground mb-1">Video Unavailable</p>
              <p className="text-xs text-muted-foreground mb-4 text-center px-6">Server is not responding. Try another episode or quality.</p>
              <button onClick={(e) => { e.stopPropagation(); setVideoError(false); setIsBuffering(true); const v = videoRef.current; if (v) { v.load(); } }} className="px-4 py-2 rounded-lg gradient-primary text-sm font-semibold btn-glow">
                Retry
              </button>
            </div>
          )}

          {/* Loading/Buffering Overlay */}
          {isBuffering && !videoError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-15 pointer-events-none">
              <div className="flex flex-col items-center gap-2">
                {/* Anime TV with logo */}
                <div className="relative" style={{ width: 72, height: 64 }}>
                  <svg viewBox="0 0 64 56" width="72" height="64" fill="none">
                    {/* Antenna */}
                    <line x1="24" y1="8" x2="32" y2="0" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="40" y1="8" x2="32" y2="0" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="32" cy="0" r="2" fill="hsl(var(--accent))">
                      <animate attributeName="fill-opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite"/>
                    </circle>
                    {/* TV frame */}
                    <rect x="6" y="8" width="52" height="38" rx="6" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="2"/>
                    {/* Screen bg */}
                    <rect x="10" y="12" width="44" height="30" rx="3" fill="hsl(var(--background))"/>
                    {/* Glow ring */}
                    <rect x="4" y="6" width="56" height="42" rx="8" fill="none" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.4">
                      <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2s" repeatCount="indefinite"/>
                    </rect>
                    {/* TV legs */}
                    <line x1="22" y1="46" x2="18" y2="54" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="42" y1="46" x2="46" y2="54" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  {/* Logo inside TV screen - using fixed pixel positioning */}
                  <img 
                    src={uiConfig.appLogo || logoImg}
                    alt={uiConfig.appName}
                    className="absolute animate-pulse"
                    style={{ top: 16, left: 14, width: 44, height: 28, objectFit: 'contain' }}
                  />
                </div>

                {/* Running anime character */}
                <div className="relative w-24 h-6 overflow-hidden">
                  <div className="absolute animate-[runAcross_2s_linear_infinite] flex items-end">
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                      {/* Stick figure running */}
                      <circle cx="12" cy="4" r="3" fill="hsl(var(--accent))"/>
                      <path d="M12 7 L12 14 M12 10 L8 13 M12 10 L16 8 M12 14 L8 19 M12 14 L16 19" stroke="hsl(var(--accent))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <animate attributeName="d" values="M12 7 L12 14 M12 10 L8 13 M12 10 L16 8 M12 14 L8 19 M12 14 L16 19;M12 7 L12 14 M12 10 L16 13 M12 10 L8 8 M12 14 L16 19 M12 14 L8 19;M12 7 L12 14 M12 10 L8 13 M12 10 L16 8 M12 14 L8 19 M12 14 L16 19" dur="0.4s" repeatCount="indefinite"/>
                      </path>
                    </svg>
                  </div>
                  {/* Dust particles */}
                  <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent"/>
                </div>

                {/* Loading text with dots animation */}
                <p className="text-sm font-semibold tracking-widest" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                  <span className="text-primary">L</span>
                  <span className="text-accent">O</span>
                  <span className="text-primary">A</span>
                  <span className="text-accent">D</span>
                  <span className="text-primary">I</span>
                  <span className="text-accent">N</span>
                  <span className="text-primary">G</span>
                  <span className="animate-pulse text-accent">...</span>
                </p>
              </div>
            </div>
          )}

          {skipIndicator && (
            <div className={`absolute top-1/2 -translate-y-1/2 skip-indicator w-16 h-16 flex items-center justify-center text-foreground text-xl font-bold ${
              skipIndicator.side === "left" ? "left-[15%]" :
              skipIndicator.side === "right" ? "right-[15%]" : "left-1/2 -translate-x-1/2"
            }`}>
              {skipIndicator.side === "left" ? <Rewind className="w-6 h-6" /> :
               skipIndicator.side === "right" ? <FastForward className="w-6 h-6" /> :
               <span className="text-2xl">{skipIndicator.text}</span>}
              {skipIndicator.side !== "center" && <span className="text-xs mt-1 absolute -bottom-5">{skipIndicator.text}</span>}
            </div>
          )}

          {/* Quality fallback message */}
          {qualityFailMsg && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 player-glass px-4 py-2.5 rounded-xl text-center max-w-[85%] animate-in fade-in slide-in-from-top-2 duration-300">
              <p className="text-xs font-semibold text-accent">⚠ {qualityFailMsg}</p>
            </div>
          )}

          {swipeState?.type && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 player-glass px-6 py-3 rounded-xl text-center">
              {swipeState.type === "volume" ? (
                <div className="flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-primary" />
                  <span className="text-sm font-semibold">{Math.round(volume * 100)}%</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-primary text-lg">☀</span>
                  <span className="text-sm font-semibold">{Math.round(brightness * 100)}%</span>
                </div>
              )}
            </div>
          )}

          {/* Controls Overlay */}
          {showControls && !locked && (
            <div className="absolute inset-0 player-controls-overlay flex flex-col justify-between" style={{ willChange: "opacity" }}>
              {/* Top controls */}
              <div className="flex justify-end gap-2 p-3">
                <button onClick={(e) => { e.stopPropagation(); setCropIndex((cropIndex + 1) % 3); }} className="player-glass h-7 px-2.5 rounded-full flex items-center justify-center gap-1">
                  <Crop className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-medium">{cropLabels[cropIndex]}</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); setLocked(true); resetHideTimer(); }} className="player-glass w-8 h-8 rounded-full flex items-center justify-center">
                  <Lock className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Center play */}
              <div className="flex items-center justify-center gap-8">
                <button onClick={(e) => { e.stopPropagation(); seek(-10); }} className="w-10 h-10 rounded-full bg-foreground/20 flex items-center justify-center backdrop-blur">
                  <SkipBack className="w-5 h-5" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center btn-glow">
                  {playing ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); seek(10); }} className="w-10 h-10 rounded-full bg-foreground/20 flex items-center justify-center backdrop-blur">
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              {/* Bottom controls */}
              <div className="px-3 pb-3">
                {/* Progress bar - GPU accelerated with will-change */}
                <div className="w-full h-1.5 bg-foreground/20 rounded-full cursor-pointer mb-2 relative" onClick={(e) => { e.stopPropagation(); handleProgressClick(e); }}>
                  <div
                    ref={progressRef}
                    className="h-full gradient-primary rounded-full relative"
                    style={{ width: `${progress}%`, willChange: "width" }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow-[0_0_10px_hsla(355,85%,55%,0.6)]" />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span ref={timeDisplayRef} className="text-[11px] font-medium">{formatTime(currentTime)} / {formatTime(duration)}</span>
                    <button onClick={(e) => { e.stopPropagation(); setMuted(!muted); if (videoRef.current) videoRef.current.muted = !muted; }} className="w-6 h-6 flex items-center justify-center">
                      {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-foreground/20 px-2 py-0.5 rounded">{playbackRate}x</span>
                    {availableQualities.length > 1 && (
                      <div className="relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowQualityPanel(!showQualityPanel); }}
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-all ${
                            currentQuality !== "Auto" ? "gradient-primary text-white" : "bg-foreground/20"
                          }`}
                        >
                          {currentQuality}
                        </button>
                        {showQualityPanel && (
                          <div className="absolute bottom-8 right-0 player-glass rounded-xl p-2 z-30 min-w-[120px] shadow-lg" onClick={(e) => e.stopPropagation()}>
                            <p className="text-[9px] text-muted-foreground mb-1.5 px-2 uppercase tracking-wider font-medium">Quality</p>
                            {availableQualities.map((opt) => (
                              <button key={opt.label} onClick={() => { switchQuality(opt); setShowQualityPanel(false); }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-between ${
                                  currentQuality === opt.label ? "gradient-primary font-bold text-white" : "hover:bg-foreground/10"
                                }`}>
                                <span>{opt.label}</span>
                                {currentQuality === opt.label && <Check className="w-3 h-3" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {onNextEpisode && (
                      <button onClick={(e) => { e.stopPropagation(); onNextEpisode(); }} className="text-[10px] bg-primary/30 px-2 py-0.5 rounded flex items-center gap-1">
                        Next <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); setSettingsTab("speed"); }} className="player-glass w-7 h-7 rounded-full flex items-center justify-center">
                      <Settings className="w-3 h-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="player-glass w-7 h-7 rounded-full flex items-center justify-center">
                      {isFullscreen ? <Minimize className="w-3 h-3" /> : <Maximize className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Locked indicator */}
          {locked && showControls && (
            <div className="absolute top-3 right-3 z-20" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { setLocked(false); resetHideTimer(); }} className="player-glass w-10 h-10 rounded-full flex items-center justify-center">
                <Unlock className="w-4 h-4 text-primary" />
              </button>
            </div>
          )}
          {locked && !showControls && (
            <div className="absolute inset-0" onClick={(e) => { e.stopPropagation(); resetHideTimer(); }} />
          )}

          {/* Settings panel */}
          {showSettings && (
            <div className="absolute bottom-16 right-3 player-glass rounded-xl p-3 z-20 min-w-[180px] max-h-[250px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowSettings(false)} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-foreground/20 flex items-center justify-center hover:bg-foreground/30 transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="flex gap-1.5 mb-3 pr-7">
                <button onClick={() => setSettingsTab("speed")} className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-all ${settingsTab === "speed" ? "gradient-primary text-white" : "bg-foreground/10 hover:bg-foreground/20"}`}>
                  Speed
                </button>
                <button onClick={() => setSettingsTab("quality")} className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-all ${settingsTab === "quality" ? "gradient-primary text-white" : "bg-foreground/10 hover:bg-foreground/20"}`}>
                  Quality
                </button>
              </div>

              {settingsTab === "speed" && (
                <div className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-medium">Playback Speed</p>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                    <button key={r} onClick={() => setSpeed(r)}
                      className={`block w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${playbackRate === r ? "gradient-primary font-bold text-white" : "hover:bg-foreground/10"}`}>
                      {r}x {r === 1 && "(Normal)"}
                    </button>
                  ))}
                </div>
              )}

              {settingsTab === "quality" && (
                <div className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-medium">Video Quality</p>
                  {availableQualities.map((opt) => (
                    <button key={opt.label} onClick={() => switchQuality(opt)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-between ${
                        currentQuality === opt.label ? "gradient-primary font-bold text-white" : "hover:bg-foreground/10"
                      }`}>
                      <span>{opt.label}</span>
                      {currentQuality === opt.label && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                  {availableQualities.length <= 1 && (
                    <p className="text-[10px] text-muted-foreground/60 text-center py-2">No additional qualities available</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ad Gate Overlay */}
        {adGateActive && (
          <div className="fixed inset-0 z-[400] bg-black/90 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-card rounded-2xl p-6 max-w-sm w-[90%] text-center space-y-4 shadow-2xl border border-border">
              <h3 className="text-lg font-bold text-foreground">Unlock {arolinkConfig.accessHours} Hours Access</h3>
              <p className="text-sm text-muted-foreground">Click the link below to get {arolinkConfig.accessHours} hours of free access to all videos</p>
              {shortenLoading ? (
                <div className="flex items-center justify-center gap-2 py-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Preparing link...</span>
                </div>
              ) : (
                <button onClick={handleOpenAdLink} className="w-full py-3 rounded-xl gradient-primary text-white font-semibold flex items-center justify-center gap-2 btn-glow transition-all hover:scale-105">
                  <ExternalLink className="w-4 h-4" />
                  Unlock Now
                </button>
              )}
              <button
                onClick={() => {
                  if (tutorialLink) {
                    setShowTutorialVideo(true);
                  } else {
                    alert("Tutorial video not available yet. Please contact admin.");
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-secondary text-secondary-foreground font-medium flex items-center justify-center gap-2 transition-all hover:scale-105 text-sm"
              >
                <Play className="w-3.5 h-3.5" />
                How to open my link
              </button>
            </div>
          </div>
        )}

        {/* Tutorial Video Modal */}
        {showTutorialVideo && tutorialLink && (
          <div className="fixed inset-0 z-[500] bg-black/95 flex items-center justify-center backdrop-blur-sm" onClick={() => setShowTutorialVideo(false)}>
            <div className="w-full max-w-xs mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-foreground">📖 How to open my link</h3>
                <button onClick={() => setShowTutorialVideo(false)} className="w-8 h-8 rounded-full bg-foreground/20 flex items-center justify-center hover:bg-foreground/30 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '9/16' }}>
                <video
                  src={mapStreamUrl(tutorialLink)}
                  className="w-full h-full"
                  controls
                  autoPlay
                  playsInline
                  style={{ objectFit: 'contain' }}
                  crossOrigin={tutorialLink.startsWith("http://") ? "anonymous" : undefined}
                />
              </div>
            </div>
          </div>
        )}

        {/* Download Button with Progress */}
        {!isFullscreen && !adGateActive && (() => {
          const normalizeKeyPart = (value: string) =>
            value
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "");

          const createUrlHash = (value: string) => {
            let hash = 0;
            for (let i = 0; i < value.length; i++) {
              hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
            }
            return hash.toString(36);
          };

          const createDownloadId = (videoTitle: string, videoSubtitle: string | undefined, quality: string, url: string) => {
            const base = [videoTitle, videoSubtitle].filter(Boolean).map((part) => normalizeKeyPart(part as string)).join("__") || "video";
            const qualityPart = normalizeKeyPart(quality || "Auto") || "auto";
            return `${base}__${qualityPart}__${createUrlHash(url)}`;
          };

          const relatedDownloads = Array.from(activeDownloads.values()).filter((item: any) => (
            item.title === title && (!subtitle || item.subtitle === subtitle)
          ));

          const dl = relatedDownloads.find((item: any) => item.status === "downloading")
            ?? relatedDownloads.find((item: any) => item.status === "complete");

          const isDownloading = dl?.status === "downloading";
          const isPaused = dl?.status === "paused";
          const isComplete = dl?.status === "complete";
          const downloadId = createDownloadId(title, subtitle, currentQuality, currentSrc);

          return (
            <div className="mt-5 w-full max-w-md mx-auto">
              <div className="relative">
                <button
                  onClick={async () => {
                    if (isDownloading || isComplete) return;
                    const { downloadManager } = await import("@/lib/downloadManager");
                    if (isPaused) {
                      downloadManager.resumeDownload(dl!.id);
                      const { toast } = await import("sonner");
                      toast.info("Download resumed");
                      return;
                    }
                    downloadManager.startDownload({
                      id: downloadId,
                      url: currentSrc,
                      title,
                      subtitle,
                      poster,
                      quality: currentQuality,
                    });
                    const { toast } = await import("sonner");
                    toast.info("Download started");
                  }}
                  disabled={isDownloading || isComplete}
                  className={`relative w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all overflow-hidden ${
                    isComplete
                      ? "bg-primary text-primary-foreground"
                      : isDownloading
                        ? "bg-secondary text-foreground border border-primary/30"
                        : isPaused
                          ? "bg-secondary text-foreground border border-accent/30"
                          : "gradient-primary text-primary-foreground btn-glow hover:scale-[1.02]"
                  }`}
                >
                  {isDownloading && dl && (
                    <div
                      className="absolute inset-0 gradient-primary opacity-80 transition-all duration-300 ease-linear"
                      style={{ width: `${dl.percent}%` }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    {isComplete ? (
                      <><Check className="w-4 h-4" /> Downloaded</>
                    ) : isDownloading && dl ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="font-mono">{dl.percent}%</span>
                        <span className="text-xs opacity-80">
                          {dl.loadedMB.toFixed(1)}/{dl.totalMB > 0 ? dl.totalMB.toFixed(1) : "??"} MB
                        </span>
                        {dl.quality !== "Auto" && <span className="text-[10px] opacity-80">• {dl.quality}</span>}
                      </>
                    ) : isPaused && dl ? (
                      <>
                        <PlayCircle className="w-4 h-4" />
                        <span>Resume</span>
                        <span className="font-mono text-xs opacity-80">{dl.percent}%</span>
                      </>
                    ) : (
                      <><Download className="w-4 h-4" /> Download Episode</>
                    )}
                  </span>
                </button>
                {/* Pause & Cancel buttons */}
                {isDownloading && dl && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const { downloadManager } = await import("@/lib/downloadManager");
                        downloadManager.pauseDownload(dl.id);
                        const { toast } = await import("sonner");
                        toast.info("Download paused");
                      }}
                      className="w-8 h-8 rounded-full bg-accent/80 hover:bg-accent flex items-center justify-center transition-all"
                    >
                      <PauseCircle className="w-4 h-4 text-white" />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const { downloadManager } = await import("@/lib/downloadManager");
                        downloadManager.cancelDownload(dl.id);
                        const { toast } = await import("sonner");
                        toast.info("Download cancelled");
                      }}
                      className="w-8 h-8 rounded-full bg-destructive/80 hover:bg-destructive flex items-center justify-center transition-all"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Episode List */}
        {episodeList && episodeList.length > 0 && (
          <div className="mt-4 bg-background rounded-xl p-4 max-h-[300px] overflow-y-auto">
            <h3 className="text-base font-semibold mb-3 text-center">Episodes</h3>
            <div className="grid grid-cols-3 gap-2">
              {episodeList.map((ep) => (
                <button
                  key={ep.number}
                  onClick={ep.onClick}
                  className={`rounded-lg py-3 px-2 flex flex-col items-center transition-all border-2 ${
                    ep.active
                      ? "gradient-primary border-foreground shadow-[0_0_20px_hsla(355,85%,55%,0.4)]"
                      : "bg-secondary border-transparent hover:bg-primary hover:-translate-y-0.5 hover:shadow-[0_5px_15px_hsla(355,85%,55%,0.4)]"
                  }`}
                >
                  <span className="text-lg font-bold">{ep.number}</span>
                  <span className="text-[10px] text-secondary-foreground">Episode</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(VideoPlayer);
