import { useState, useRef, useEffect, forwardRef, lazy, Suspense } from "react";
import { User, LogOut, History, Bookmark, Settings, ChevronRight, ArrowLeft, Camera, X, Save, Globe, Monitor, Bell, Info, Crown, Gift, Check, Lock, Eye, EyeOff, KeyRound, Clock, Download, Play, Trash2, Loader2, PauseCircle, PlayCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { db, ref, onValue, set, remove, get, update, query, orderByChild, equalTo } from "@/lib/firebase";
import type { AnimeItem } from "@/data/animeData";
import { toast } from "sonner";
import { registerFCMToken } from "@/lib/fcm";
import { useUiConfig } from "@/hooks/useUiConfig";

const VideoPlayer = lazy(() => import("@/components/VideoPlayer"));

const DownloadVideoPlayer = ({ src, title, subtitle, poster, onClose }: {
  src: string; title: string; subtitle?: string; poster?: string; onClose: () => void;
}) => (
  <div className="fixed inset-0 z-[300]">
    <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <VideoPlayer src={src} title={title} subtitle={subtitle} poster={poster} onClose={onClose} />
    </Suspense>
  </div>
);

interface ProfilePageProps {
  onClose: () => void;
  allAnime?: AnimeItem[];
  onCardClick?: (anime: AnimeItem) => void;
  onLogout?: () => void;
}

const MAX_PHOTO_SIZE = 2 * 1024 * 1024;

const AccessTimer = () => {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [paused, setPaused] = useState(false);
  const [globalFree, setGlobalFree] = useState<{ active: boolean; expiresAt: number } | null>(null);

  // Check maintenance status and pause/extend timer
  useEffect(() => {
    const unsub = onValue(ref(db, "maintenance"), (snap) => {
      const maint = snap.val();
      if (maint?.active) {
        setPaused(true);
      } else {
        setPaused(false);
        if (maint?.lastPauseDuration && maint?.lastResumedAt) {
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
      }
    });
    return () => unsub();
  }, []);

  // Listen for global free access
  useEffect(() => {
    const unsub = onValue(ref(db, "globalFreeAccess"), (snap) => {
      const data = snap.val();
      if (data?.active && data?.expiresAt > Date.now()) {
        setGlobalFree(data);
      } else {
        setGlobalFree(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const tick = () => {
      // Check global free access first
      if (globalFree?.active && globalFree.expiresAt > Date.now()) {
        setHasAccess(true);
        const diff = globalFree.expiresAt - Date.now();
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
        return;
      }
      const expiry = localStorage.getItem("rsanime_ad_access");
      if (!expiry) { setHasAccess(false); setTimeLeft(null); return; }
      const diff = parseInt(expiry) - Date.now();
      if (diff <= 0) { setHasAccess(false); setTimeLeft(null); return; }
      setHasAccess(true);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [globalFree]);

  return (
    <div className="mb-5">
      <div className={`glass-card p-4 rounded-xl flex items-center gap-3 ${hasAccess ? "border-primary/30 bg-primary/5" : "border-accent/30 bg-accent/5"}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasAccess ? "gradient-primary" : "bg-muted"}`}>
          <Clock className={`w-5 h-5 ${hasAccess ? "text-primary-foreground" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">
            {paused ? "⏸ Timer Paused (Maintenance)" : hasAccess ? "Free Access Remaining" : "No Active Access"}
          </p>
          {paused && hasAccess ? (
            <p className="text-lg font-bold font-mono text-yellow-400 tracking-wider">{timeLeft} ⏸</p>
          ) : hasAccess && timeLeft ? (
            <p className="text-lg font-bold font-mono text-primary tracking-wider">{timeLeft}</p>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">Watch a video to unlock 24h access</p>
          )}
        </div>
      </div>
    </div>
  );
};

// Downloads Panel Component
const DownloadsPanel = ({ onBack }: { onBack: () => void }) => {
  const [downloads, setDownloads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const videoPlayRef = useRef<HTMLVideoElement>(null);
  const [activeDownloads, setActiveDownloads] = useState<Map<string, any>>(new Map());

  const loadDownloads = async () => {
    try {
      const { getAllDownloads } = await import("@/lib/downloadStore");
      const items = await getAllDownloads();
      setDownloads(items);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadDownloads(); }, []);

  // Subscribe to global download manager
  useEffect(() => {
    let unsub: (() => void) | undefined;
    import("@/lib/downloadManager").then(({ downloadManager }) => {
      unsub = downloadManager.subscribe((map) => {
        setActiveDownloads(new Map(map));
        // Refresh completed downloads list
        const hasComplete = Array.from(map.values()).some(d => d.status === "complete");
        if (hasComplete) loadDownloads();
      });
    });
    return () => { unsub?.(); };
  }, []);

  useEffect(() => {
    return () => { if (playingUrl) URL.revokeObjectURL(playingUrl); };
  }, [playingUrl]);

  const handlePlay = async (id: string) => {
    try {
      const { getVideoBlob } = await import("@/lib/downloadStore");
      const blob = await getVideoBlob(id);
      if (!blob) { toast.error("Video file not found"); return; }
      if (playingUrl) URL.revokeObjectURL(playingUrl);
      const url = URL.createObjectURL(blob);
      setPlayingUrl(url);
      setPlayingVideo(id);
    } catch { toast.error("Failed to load video"); }
  };

  const handleDelete = async (id: string) => {
    try {
      const { deleteDownload } = await import("@/lib/downloadStore");
      await deleteDownload(id);
      setDownloads(prev => prev.filter(d => d.id !== id));
      if (playingVideo === id) {
        setPlayingVideo(null);
        if (playingUrl) URL.revokeObjectURL(playingUrl);
        setPlayingUrl(null);
      }
      toast.success("Download deleted");
    } catch {
      toast.error("Failed to delete download");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Merge active downloads with saved downloads
  const activeList = Array.from(activeDownloads.values())
    .filter((d: any) => d.status === "downloading" || d.status === "paused")
    .sort((a: any) => a.status === "downloading" ? -1 : 1);

  return (
    <motion.div className="fixed inset-0 z-[200] bg-background overflow-y-auto pt-[70px] px-4 pb-24"
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "tween", duration: 0.3 }}>
      <button onClick={onBack} className="flex items-center gap-2 mb-5 text-sm text-secondary-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Downloads</span>
      </button>

      {playingVideo && playingUrl && (
        <DownloadVideoPlayer
          src={playingUrl}
          title={downloads.find(d => d.id === playingVideo)?.title || "Video"}
          subtitle={downloads.find(d => d.id === playingVideo)?.subtitle}
          poster={downloads.find(d => d.id === playingVideo)?.poster}
          onClose={() => {
            setPlayingVideo(null);
            if (playingUrl) URL.revokeObjectURL(playingUrl);
            setPlayingUrl(null);
          }}
        />
      )}

      {/* Active Downloads Section */}
      {activeList.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Downloading now</p>
          {activeList.map((dl: any) => {
            const isDlPaused = dl.status === "paused";
            return (
            <div key={dl.id} className={`glass-card rounded-xl p-3 border ${isDlPaused ? "border-accent/20" : "border-primary/20"}`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isDlPaused ? "bg-accent/20" : "bg-primary/20"}`}>
                  {isDlPaused ? <PauseCircle className="w-5 h-5 text-accent" /> : <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{dl.title}</p>
                  {dl.subtitle && <p className="text-xs text-primary truncate">{dl.subtitle}</p>}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs font-mono ${isDlPaused ? "text-accent" : "text-primary"}`}>{dl.percent}% {isDlPaused ? "⏸" : ""}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {dl.loadedMB.toFixed(1)}/{dl.totalMB > 0 ? dl.totalMB.toFixed(1) : "??"} MB
                    </span>
                    {dl.quality !== "Auto" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{dl.quality}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isDlPaused ? (
                    <button
                      onClick={async () => {
                        const { downloadManager } = await import("@/lib/downloadManager");
                        downloadManager.resumeDownload(dl.id);
                        toast.info("Download resumed");
                      }}
                      className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center hover:bg-primary/40 transition-colors"
                    >
                      <PlayCircle className="w-3.5 h-3.5 text-primary" />
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        const { downloadManager } = await import("@/lib/downloadManager");
                        downloadManager.pauseDownload(dl.id);
                        toast.info("Download paused");
                      }}
                      className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center hover:bg-accent/40 transition-colors"
                    >
                      <PauseCircle className="w-3.5 h-3.5 text-accent" />
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      const { downloadManager } = await import("@/lib/downloadManager");
                      downloadManager.cancelDownload(dl.id);
                      toast.info("Download cancelled");
                    }}
                    className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center hover:bg-destructive/40 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                <div className="h-full rounded-full gradient-primary transition-all duration-300 ease-linear" style={{ width: `${dl.percent}%` }} />
              </div>
            </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading downloads...</p>
        </div>
      ) : downloads.length === 0 && activeList.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Download className="w-14 h-14 mx-auto mb-3 opacity-30" />
          <h3 className="text-base font-semibold mb-2 text-foreground">No downloads yet</h3>
          <p className="text-sm px-4">Open the video player and tap Download Episode to save videos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {downloads.length > 0 && (
            <p className="text-xs text-muted-foreground">{downloads.length} videos saved</p>
          )}
          {downloads.map((item) => (
            <div key={item.id} className="glass-card rounded-xl p-3 flex items-center gap-3">
              <button onClick={() => handlePlay(item.id)}
                className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 relative">
                {item.poster ? (
                  <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full gradient-primary flex items-center justify-center">
                    <Play className="w-5 h-5 text-primary-foreground" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <Play className="w-4 h-4 text-white" />
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{item.title}</p>
                {item.subtitle && <p className="text-xs text-primary truncate">{item.subtitle}</p>}
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatSize(item.size)}
                  {item.quality ? ` • ${item.quality}` : ""}
                  {` • ${new Date(item.downloadedAt).toLocaleDateString("en-US")}`}
                </p>
              </div>
              <button onClick={() => handleDelete(item.id)}
                className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0 hover:bg-destructive/40 transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

const ProfilePageInner = ({ onClose, allAnime = [], onCardClick, onLogout }: ProfilePageProps) => {
  const uiConfig = useUiConfig();
  const [activePanel, setActivePanel] = useState<"main" | "settings" | "edit" | "language" | "quality" | "notification-settings" | "premium" | "change-password" | "downloads">("main");
  const [profilePhoto, setProfilePhoto] = useState<string | null>(() => {
    try { return localStorage.getItem("rs_profile_photo"); } catch { return null; }
  });
  const [displayName, setDisplayName] = useState(() => {
    try { return localStorage.getItem("rs_display_name") || "Guest User"; } catch { return "Guest User"; }
  });
  const [tempName, setTempName] = useState(displayName);
  const fileRef = useRef<HTMLInputElement>(null);

  // Settings state
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    try { return localStorage.getItem("rs_language") || "English"; } catch { return "English"; }
  });
  const [selectedQuality, setSelectedQuality] = useState(() => {
    try { return localStorage.getItem("rs_quality") || "Auto"; } catch { return "Auto"; }
  });

  // Watchlist & History from Firebase
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [watchHistory, setWatchHistory] = useState<any[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumExpiry, setPremiumExpiry] = useState<number | null>(null);
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);

  const getUserDbKey = (): string | null => {
    try {
      const user = localStorage.getItem("rsanime_user");
      if (user) {
        const parsed = JSON.parse(user);
        return parsed.dbKey || parsed.id || null;
      }
    } catch {}
    return null;
  };

  const userId = getUserDbKey();

  useEffect(() => {
    if (!userId) return;
    const wlRef = ref(db, `users/${userId}/watchlist`);
    const unsub1 = onValue(wlRef, (snapshot) => {
      const data = snapshot.val() || {};
      setWatchlist(Object.values(data));
    });
    const whRef = ref(db, `users/${userId}/watchHistory`);
    const unsub2 = onValue(whRef, (snapshot) => {
      const data = snapshot.val() || {};
      const items = Object.values(data) as any[];
      items.sort((a: any, b: any) => (b.watchedAt || 0) - (a.watchedAt || 0));
      setWatchHistory(items);
    });
    const premRef = ref(db, `users/${userId}/premium`);
    const unsub3 = onValue(premRef, (snap) => {
      const data = snap.val();
      if (data && data.expiresAt > Date.now()) {
        setIsPremium(true);
        setPremiumExpiry(data.expiresAt);
      } else {
        setIsPremium(false);
        setPremiumExpiry(null);
      }
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [userId]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_SIZE) { alert("Image must be under 2MB!"); return; }
    if (!file.type.startsWith("image/")) { alert("Please select an image file."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setProfilePhoto(result);
      localStorage.setItem("rs_profile_photo", result);
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setProfilePhoto(null);
    localStorage.removeItem("rs_profile_photo");
  };

  const saveName = () => {
    setDisplayName(tempName);
    localStorage.setItem("rs_display_name", tempName);
    setActivePanel("main");
  };

  const saveLanguage = (lang: string) => {
    setSelectedLanguage(lang);
    localStorage.setItem("rs_language", lang);
  };

  const saveQuality = (q: string) => {
    setSelectedQuality(q);
    localStorage.setItem("rs_quality", q);
  };

  const initial = displayName.charAt(0).toUpperCase();

  const languages = ["English", "Bangla", "Hindi", "Japanese", "Korean", "Arabic"];
  const qualities = ["Auto", "1080p", "720p", "480p", "360p"];

  const handleAnimeClick = (item: any) => {
    if (!onCardClick) return;
    const anime = allAnime.find(a => a.id === item.id);
    if (anime) {
      onClose();
      setTimeout(() => onCardClick(anime), 100);
    }
  };

  const removeFromWatchlist = (itemId: string) => {
    if (!userId) return;
    remove(ref(db, `users/${userId}/watchlist/${itemId}`));
  };

  const redeemCode = async () => {
    if (!userId || !redeemInput.trim()) { toast.error("Please enter a redeem code"); return; }
    setRedeemLoading(true);
    try {
      const codesSnap = await get(ref(db, "redeemCodes"));
      const codes = codesSnap.val() || {};
      let found = false;
      for (const [codeId, codeData] of Object.entries(codes) as any[]) {
        if (codeData.code === redeemInput.trim().toUpperCase() && !codeData.used) {
          found = true;
          const days = codeData.days || 30;
          const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
          await set(ref(db, `users/${userId}/premium`), {
            active: true, expiresAt, redeemedAt: Date.now(), code: codeData.code
          });
          await update(ref(db, `redeemCodes/${codeId}`), {
            used: true, usedBy: userId, usedAt: Date.now()
          });
          toast.success(`Premium activated for ${days} days!`);
          setRedeemInput("");
          setActivePanel("main");
          break;
        }
      }
      if (!found) toast.error("Invalid or already used code");
    } catch (err: any) { toast.error("Error: " + err.message); }
    finally { setRedeemLoading(false); }
  };

  // Settings Panel
  if (activePanel === "settings") {
    return (
      <motion.div className="fixed inset-0 z-[200] bg-background overflow-y-auto pt-[70px] px-4 pb-24"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.3 }}>
        <button onClick={() => setActivePanel("main")} className="flex items-center gap-2 mb-5 text-sm text-secondary-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Settings</span>
        </button>
        <div className="space-y-3">
          <div onClick={() => setActivePanel("notification-settings")} className="glass-card px-4 py-4 rounded-xl cursor-pointer transition-all hover:border-primary flex items-center gap-3">
            <Bell className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Notifications</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Manage notification preferences</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
          <div onClick={() => setActivePanel("quality")} className="glass-card px-4 py-4 rounded-xl cursor-pointer transition-all hover:border-primary flex items-center gap-3">
            <Monitor className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Video Quality</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Current: {selectedQuality}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
          <div onClick={() => setActivePanel("language")} className="glass-card px-4 py-4 rounded-xl cursor-pointer transition-all hover:border-primary flex items-center gap-3">
            <Globe className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Language</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Current: {selectedLanguage}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="glass-card px-4 py-4 rounded-xl flex items-center gap-3">
            <Info className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">About ICF ANIME</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Version 2.0</p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Language Panel
  if (activePanel === "language") {
    return (
      <motion.div className="fixed inset-0 z-[200] bg-background overflow-y-auto pt-[70px] px-4 pb-24"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.3 }}>
        <button onClick={() => setActivePanel("settings")} className="flex items-center gap-2 mb-5 text-sm text-secondary-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Language</span>
        </button>
        <div className="space-y-2">
          {languages.map((lang) => (
            <div key={lang} onClick={() => saveLanguage(lang)}
              className={`glass-card px-4 py-4 rounded-xl cursor-pointer transition-all flex items-center justify-between ${selectedLanguage === lang ? "border-primary bg-primary/10" : "hover:border-primary/50"}`}>
              <span className="text-sm font-medium">{lang}</span>
              {selectedLanguage === lang && <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"><Check className="w-3 h-3 text-primary-foreground" /></span>}
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  // Quality Panel
  if (activePanel === "quality") {
    return (
      <motion.div className="fixed inset-0 z-[200] bg-background overflow-y-auto pt-[70px] px-4 pb-24"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.3 }}>
        <button onClick={() => setActivePanel("settings")} className="flex items-center gap-2 mb-5 text-sm text-secondary-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Video Quality</span>
        </button>
        <p className="text-xs text-muted-foreground mb-4">Select default streaming quality. Higher quality uses more data.</p>
        <div className="space-y-2">
          {qualities.map((q) => (
            <div key={q} onClick={() => saveQuality(q)}
              className={`glass-card px-4 py-4 rounded-xl cursor-pointer transition-all flex items-center justify-between ${selectedQuality === q ? "border-primary bg-primary/10" : "hover:border-primary/50"}`}>
              <div>
                <span className="text-sm font-medium">{q}</span>
                {q === "Auto" && <p className="text-[10px] text-muted-foreground">Adjusts based on your connection</p>}
              </div>
              {selectedQuality === q && <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"><Check className="w-3 h-3 text-primary-foreground" /></span>}
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  // Notification Settings
  if (activePanel === "notification-settings") {
    return (
      <motion.div className="fixed inset-0 z-[200] bg-background overflow-y-auto pt-[70px] px-4 pb-24"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.3 }}>
        <button onClick={() => setActivePanel("settings")} className="flex items-center gap-2 mb-5 text-sm text-secondary-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Notifications</span>
        </button>
        <div className="space-y-3">
          <NotificationToggle label="Push Notifications" desc="Show browser popup notifications" defaultOn={true} storageKey="rs_notif_push" />
          <NotificationToggle label="New Episode Alerts" desc="Get notified for new episodes" defaultOn={true} storageKey="rs_notif_episodes" />
          <NotificationToggle label="Recommendations" desc="Personalized anime suggestions" defaultOn={true} storageKey="rs_notif_recs" />
          <NotificationToggle label="App Updates" desc="New features and improvements" defaultOn={false} storageKey="rs_notif_updates" />
        </div>

        {/* Push Debug Info */}
        <PushDebugInfo />
      </motion.div>
    );
  }

  // Premium Panel
  if (activePanel === "premium") {
    return (
      <motion.div className="fixed inset-0 z-[200] bg-background overflow-y-auto pt-[70px] px-4 pb-24"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.3 }}>
        <button onClick={() => setActivePanel("main")} className="flex items-center gap-2 mb-5 text-sm text-secondary-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Get Premium</span>
        </button>

        {isPremium ? (
          <div className="glass-card p-6 rounded-2xl text-center mb-5 border-primary/30 bg-primary/5">
            <Crown className="w-12 h-12 text-primary mx-auto mb-3" />
            <h3 className="text-lg font-bold text-primary mb-1">Premium Active ✨</h3>
            <p className="text-sm text-secondary-foreground">
              Expires: {premiumExpiry ? new Date(premiumExpiry).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A"}
            </p>
            <p className="text-xs text-muted-foreground mt-2">Ad-free experience enabled</p>
          </div>
        ) : (
          <>
            <div className="glass-card p-6 rounded-2xl text-center mb-5">
              <Crown className="w-14 h-14 text-primary mx-auto mb-3" />
              <h3 className="text-xl font-bold mb-2">{uiConfig.appName} Premium</h3>
              <p className="text-3xl font-extrabold text-primary mb-1">{uiConfig.premiumPrice}</p>
              <p className="text-xs text-muted-foreground">{uiConfig.premiumDuration}</p>
              <div className="mt-4 space-y-2 text-left">
                {["No ads while watching", "Uninterrupted streaming", "Support the creators"].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center"><Check className="w-3 h-3 text-primary" /></span>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card p-4 rounded-2xl mb-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Gift className="w-4 h-4 text-primary" /> Enter Redeem Code
              </h4>
              <input
                value={redeemInput}
                onChange={e => setRedeemInput(e.target.value.toUpperCase())}
                placeholder="ICF-XXXXXX-XXXX"
                className="w-full py-3 px-4 rounded-xl bg-foreground/10 border border-foreground/10 text-foreground text-sm font-mono tracking-widest focus:border-primary focus:outline-none focus:shadow-[0_0_20px_hsla(355,85%,55%,0.3)] transition-all mb-3 text-center"
              />
              <button onClick={redeemCode} disabled={redeemLoading}
                className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 btn-glow disabled:opacity-50">
                {redeemLoading ? "Verifying..." : "Activate Premium"}
              </button>
            </div>

            <a href={uiConfig.contactLink} target="_blank" rel="noopener noreferrer"
              className="block w-full py-3 rounded-xl bg-[#0088cc] text-white font-semibold text-center text-sm transition-all hover:opacity-90">
              📩 Get Redeem Code - Contact Owner
            </a>
          </>
        )}
      </motion.div>
    );
  }

  // Downloads Panel
  if (activePanel === "downloads") {
    return <DownloadsPanel onBack={() => setActivePanel("main")} />;
  }

  // Change Password Panel
  if (activePanel === "change-password") {
    return <ChangePasswordPanel onBack={() => setActivePanel("edit")} />;
  }

  // Edit Profile Panel
  if (activePanel === "edit") {
    const isGoogleUser = (() => {
      try {
        const u = JSON.parse(localStorage.getItem("rsanime_user") || "{}");
        // Check if user logged in via Google (no password in appUsers)
        return !!u.email && !localStorage.getItem("rs_has_password");
      } catch { return false; }
    })();

    // Check if user has password (email login user)
    const hasPassword = (() => {
      try {
        const u = JSON.parse(localStorage.getItem("rsanime_user") || "{}");
        return !!u.email;
      } catch { return false; }
    })();

    return (
      <motion.div className="fixed inset-0 z-[200] bg-background overflow-y-auto pt-[70px] px-4 pb-24"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.3 }}>
        <button onClick={() => setActivePanel("main")} className="flex items-center gap-2 mb-5 text-sm text-secondary-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Edit Profile</span>
        </button>
        <div className="text-center mb-8">
          <div className="relative inline-block">
            {profilePhoto ? (
              <div className="relative">
                <img src={profilePhoto} alt="Profile" className="w-[100px] h-[100px] rounded-full object-cover border-4 border-primary/30 shadow-[0_10px_40px_hsla(355,85%,55%,0.3)]" />
                <button onClick={removePhoto} className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-destructive flex items-center justify-center">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ) : (
              <div className="w-[100px] h-[100px] rounded-full gradient-primary flex items-center justify-center text-[42px] font-extrabold shadow-[0_10px_40px_hsla(355,85%,55%,0.4)] border-4 border-foreground/10">
                {initial}
              </div>
            )}
            <button onClick={() => fileRef.current?.click()} className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <Camera className="w-4 h-4 text-primary-foreground" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Max 2MB • JPG, PNG, WebP</p>
        </div>
        <div className="mb-6">
          <label className="text-xs text-muted-foreground mb-2 block">Display Name</label>
          <input type="text" value={tempName} onChange={(e) => setTempName(e.target.value)} maxLength={30}
            className="w-full py-3 px-4 rounded-xl bg-foreground/10 border border-foreground/10 text-foreground text-sm focus:border-primary focus:outline-none focus:shadow-[0_0_20px_hsla(355,85%,55%,0.3)] transition-all" />
        </div>
        <button onClick={saveName} className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 mb-4">
          <Save className="w-4 h-4" /> Save Changes
        </button>

        {/* Change Password Button - only for email users */}
        {hasPassword && (
          <button onClick={() => setActivePanel("change-password")}
            className="w-full py-3 rounded-xl bg-foreground/10 border border-foreground/10 text-foreground font-medium flex items-center justify-center gap-2 transition-all hover:border-primary text-sm">
            <Lock className="w-4 h-4 text-primary" /> Change Password
          </button>
        )}
      </motion.div>
    );
  }

  // Main Profile
  return (
    <motion.div className="fixed inset-0 z-[200] bg-background overflow-y-auto pt-[70px] px-4 pb-24"
      initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
      transition={{ type: "tween", duration: 0.4 }}>
      <button onClick={onClose} className="flex items-center gap-2 mb-5 text-sm text-secondary-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Back</span>
      </button>

      {/* Avatar */}
      <div className="text-center mb-7">
        <div className="relative inline-block">
          {profilePhoto ? (
            <img src={profilePhoto} alt="Profile" className={`w-[100px] h-[100px] rounded-full object-cover mx-auto mb-4 border-4 shadow-[0_10px_40px_hsla(355,85%,55%,0.4)] ${isPremium ? "border-yellow-500/60" : "border-foreground/10"}`} />
          ) : (
            <div className={`w-[100px] h-[100px] rounded-full mx-auto mb-4 flex items-center justify-center text-[42px] font-extrabold border-4 ${isPremium ? "bg-gradient-to-br from-yellow-500 to-orange-600 border-yellow-400/60 shadow-[0_10px_40px_rgba(234,179,8,0.4)]" : "gradient-primary border-foreground/10 shadow-[0_10px_40px_hsla(355,85%,55%,0.4)]"}`}>
              {initial}
            </div>
          )}
          {isPremium && (
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg border-2 border-background">
              <Crown className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
        <h2 className="text-2xl font-bold mb-1">{displayName}</h2>
        {isPremium && <span className="inline-flex items-center gap-1 text-xs font-bold text-yellow-400 bg-yellow-500/10 px-3 py-1 rounded-full mb-1"><Crown className="w-3 h-3" /> Premium Member</span>}
        <p className="text-sm text-secondary-foreground">
          {(() => { try { const u = JSON.parse(localStorage.getItem("rsanime_user") || "{}"); return u.email || "guest@icfanime.com"; } catch { return "guest@icfanime.com"; } })()}
        </p>
      </div>

      {/* Access Timer */}
      {!isPremium && <AccessTimer />}

      {/* Watch History */}
      <div className="mb-7">
        <h3 className="text-base font-bold mb-3 flex items-center category-bar">Watch History</h3>
        {watchHistory.length === 0 ? (
          <div className="text-center py-8">
            <History className="w-10 h-10 text-muted-foreground/50 mx-auto mb-2.5" />
            <p className="text-sm text-secondary-foreground">No watch history yet</p>
          </div>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
            {watchHistory.slice(0, 20).map((item: any) => (
              <div key={item.id} onClick={() => handleAnimeClick(item)}
                className="flex-shrink-0 w-[100px] cursor-pointer">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-card mb-1">
                  <img src={item.poster} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 50%)" }} />
                  <div className="absolute bottom-1 left-1 right-1">
                    <p className="text-[9px] font-semibold leading-tight line-clamp-2">{item.title}</p>
                    {item.episodeInfo && (
                      <p className="text-[8px] text-primary mt-0.5">
                        S{item.episodeInfo.season} E{item.episodeInfo.episodeNumber || item.episodeInfo.episode}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Watchlist */}
      <div className="mb-7">
        <h3 className="text-base font-bold mb-3 flex items-center category-bar">My Watchlist</h3>
        {watchlist.length === 0 ? (
          <div className="text-center py-8">
            <Bookmark className="w-10 h-10 text-muted-foreground/50 mx-auto mb-2.5" />
            <p className="text-sm text-secondary-foreground">No items in watchlist</p>
          </div>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
            {watchlist.map((item: any) => (
              <div key={item.id} onClick={() => handleAnimeClick(item)}
                className="flex-shrink-0 w-[100px] cursor-pointer relative">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-card mb-1">
                  <img src={item.poster} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 50%)" }} />
                  <button onClick={(e) => { e.stopPropagation(); removeFromWatchlist(item.id); }}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive/80 flex items-center justify-center">
                    <X className="w-3 h-3 text-white" />
                  </button>
                  <div className="absolute bottom-1 left-1 right-1">
                    <p className="text-[9px] font-semibold leading-tight line-clamp-2">{item.title}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Menu Items */}
      <div className="flex flex-col gap-2">
        <div onClick={() => setActivePanel("premium")}
          className={`glass-card flex items-center gap-3.5 px-4 py-4 cursor-pointer transition-all hover:translate-x-1 rounded-xl ${isPremium ? "border-primary/40 bg-primary/5" : "border-primary/20 bg-gradient-to-r from-primary/10 to-transparent hover:border-primary"}`}>
          <Crown className={`w-5 h-5 ${isPremium ? "text-primary" : "text-primary"}`} />
          <div className="flex-1">
            <span className="text-[13px] font-medium">{isPremium ? "Premium Active ✨" : "Get Premium"}</span>
            {isPremium && premiumExpiry && (
              <p className="text-[10px] text-muted-foreground">Expires: {new Date(premiumExpiry).toLocaleDateString()}</p>
            )}
            {!isPremium && <p className="text-[10px] text-muted-foreground">Ad-free for {uiConfig.premiumPrice}</p>}
          </div>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </div>
        <div onClick={() => setActivePanel("settings")}
          className="glass-card flex items-center gap-3.5 px-4 py-4 cursor-pointer transition-all hover:border-primary hover:translate-x-1 rounded-xl">
          <Settings className="w-5 h-5 text-primary" />
          <span className="flex-1 text-[13px] font-medium">Settings</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </div>
        <div onClick={() => setActivePanel("downloads")}
          className="glass-card flex items-center gap-3.5 px-4 py-4 cursor-pointer transition-all hover:border-primary hover:translate-x-1 rounded-xl">
          <Download className="w-5 h-5 text-primary" />
          <span className="flex-1 text-[13px] font-medium">Downloads</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </div>
        <div onClick={() => { setTempName(displayName); setActivePanel("edit"); }}
          className="glass-card flex items-center gap-3.5 px-4 py-4 cursor-pointer transition-all hover:border-primary hover:translate-x-1 rounded-xl">
          <User className="w-5 h-5 text-primary" />
          <span className="flex-1 text-[13px] font-medium">Edit Profile</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </div>
        <div onClick={() => { if (onLogout) onLogout(); onClose(); }}
          className="glass-card flex items-center gap-3.5 px-4 py-4 cursor-pointer transition-all hover:bg-accent/20 border-accent/30 bg-accent/15 rounded-xl">
          <LogOut className="w-5 h-5" />
          <span className="flex-1 text-[13px] font-medium">Logout</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </div>

        {/* Telegram Join Button */}
        <a
          href={uiConfig.contactLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl font-semibold text-sm transition-all mt-2"
          style={{ background: 'linear-gradient(135deg, #0088cc, #00aaee)', color: '#fff' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          Contact Owner
        </a>
        <p className="text-[10px] text-muted-foreground text-center mt-1 mb-2">Get all updates, news & details about {uiConfig.appName}</p>
      </div>
    </motion.div>
  );
};

// Change Password sub-component
const ChangePasswordPanel = ({ onBack }: { onBack: () => void }) => {
  const uiConfig = useUiConfig();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!oldPassword.trim() || !newPassword.trim()) { toast.error("Please fill in all fields"); return; }
    if (newPassword.length < 4) { toast.error("New password must be at least 4 characters"); return; }
    if (oldPassword === newPassword) { toast.error("New password cannot be the same as old password"); return; }

    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem("rsanime_user") || "{}");
      if (!user.email) { toast.error("User not found"); setLoading(false); return; }

      const emailKey = user.email.toLowerCase().replace(/\./g, ",").replace(/[^a-z0-9@,_-]/g, "_");
      const legacyKey = user.email.toLowerCase().replace(/[^a-z0-9]/g, "_");

      // Check appUsers for password
      let foundKey = "";
      let userData: any = null;
      for (const key of [emailKey, legacyKey]) {
        const snap = await get(ref(db, `appUsers/${key}`));
        if (snap.exists()) {
          const data = snap.val();
          if (data.password) { foundKey = key; userData = data; break; }
        }
      }

      if (!userData || !userData.password) {
        toast.error("Password not found. This feature is not available for Google login users.");
        setLoading(false); return;
      }

      if (userData.password !== oldPassword) {
        toast.error("Old password is incorrect!");
        setLoading(false); return;
      }

      // Update password
      await update(ref(db, `appUsers/${foundKey}`), { password: newPassword });
      toast.success("Password changed successfully! ✅");
      setOldPassword(""); setNewPassword("");
      onBack();
    } catch (err: any) { toast.error("Error: " + err.message); }
    setLoading(false);
  };

  return (
    <motion.div className="fixed inset-0 z-[200] bg-background overflow-y-auto pt-[70px] px-4 pb-24"
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "tween", duration: 0.3 }}>
      <button onClick={onBack} className="flex items-center gap-2 mb-5 text-sm text-secondary-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Change Password</span>
      </button>

      <div className="glass-card p-5 rounded-2xl mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold">Change Password</h3>
            <p className="text-[10px] text-muted-foreground">Enter your old password to set a new one</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Old Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type={showOld ? "text" : "password"} value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                placeholder="Enter old password"
                className="w-full py-3 pl-10 pr-10 rounded-xl bg-foreground/10 border border-foreground/10 text-foreground text-sm focus:border-primary focus:outline-none focus:shadow-[0_0_20px_hsla(355,85%,55%,0.3)] transition-all placeholder:text-muted-foreground" />
              <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2">
                {showOld ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-2 block">New Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type={showNew ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full py-3 pl-10 pr-10 rounded-xl bg-foreground/10 border border-foreground/10 text-foreground text-sm focus:border-primary focus:outline-none focus:shadow-[0_0_20px_hsla(355,85%,55%,0.3)] transition-all placeholder:text-muted-foreground" />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2">
                {showNew ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleChangePassword} disabled={loading}
        className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 mb-3">
        {loading ? <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> : <><Save className="w-4 h-4" /> Change Password</>}
      </button>

      <a href={uiConfig.contactLink} target="_blank" rel="noopener noreferrer"
        className="w-full py-3 rounded-xl bg-[#0088cc] text-white font-medium flex items-center justify-center gap-2 text-sm transition-all hover:opacity-90">
        📩 Forgot Password? Contact Owner
      </a>
    </motion.div>
  );
};

// Push Debug Info sub-component
const PushDebugInfo = () => {
  const [debugInfo, setDebugInfo] = useState<Record<string, string>>({});
  const [reregistering, setReregistering] = useState(false);

  const loadDebugInfo = () => {
    const info: Record<string, string> = {};
    info["Origin"] = window.location.origin;
    info["Permission"] = "Notification" in window ? Notification.permission : "unsupported";
    info["Device ID"] = localStorage.getItem("rs_fcm_device_id") || "not set";
    
    try {
      const u = JSON.parse(localStorage.getItem("rsanime_user") || "{}");
      info["User ID"] = u.id || "none";
    } catch { info["User ID"] = "error"; }

    info["Push Pref"] = localStorage.getItem("rs_notif_push") || "default (true)";
    info["SW Support"] = "serviceWorker" in navigator ? "yes" : "no";
    
    // Check SW registration
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        const fcmSw = regs.find(r => r.active?.scriptURL?.includes("firebase-messaging-sw"));
        info["FCM SW"] = fcmSw ? `active (scope: ${fcmSw.scope})` : "not registered";
        info["Total SWs"] = String(regs.length);
        setDebugInfo({ ...info });
      });
    }

    // Load token count from Firebase
    try {
      const u = JSON.parse(localStorage.getItem("rsanime_user") || "{}");
      if (u.id) {
        import("@/lib/firebase").then(({ db, ref, get }) => {
          get(ref(db, `fcmTokens/${u.id}`)).then((snap: any) => {
            const tokens = snap.val() || {};
            const entries = Object.values(tokens) as any[];
            info["Token Count"] = String(entries.length);
            if (entries.length > 0) {
              const latest = entries.reduce((a: any, b: any) => (a.updatedAt || 0) > (b.updatedAt || 0) ? a : b);
              info["Last Token"] = latest.updatedAt ? new Date(latest.updatedAt).toLocaleString() : "unknown";
              // Check if current origin has a token
              const originMatch = entries.find((e: any) => e.origin === window.location.origin);
              info["This Origin"] = originMatch ? "✅ has token" : "❌ no token";
            }
            setDebugInfo({ ...info });
          }).catch(() => {});
        });
      }
    } catch {}
    
    setDebugInfo(info);
  };

  useEffect(() => { loadDebugInfo(); }, []);

  const handleForceReregister = async () => {
    setReregistering(true);
    try {
      const u = JSON.parse(localStorage.getItem("rsanime_user") || "{}");
      if (!u.id) {
        toast.error("No user ID found");
        setReregistering(false);
        return;
      }
      await registerFCMToken(u.id, true);
      // Reload debug info after re-register
      setTimeout(() => loadDebugInfo(), 1500);
    } catch (err: any) {
      toast.error("Re-register failed: " + err.message);
    }
    setReregistering(false);
  };

  return (
    <div className="mt-6 glass-card p-4 rounded-xl">
      <h4 className="text-xs font-bold text-primary mb-3 flex items-center gap-2">
        <Info className="w-3.5 h-3.5" /> Push Debug Info
      </h4>
      <div className="space-y-1.5">
        {Object.entries(debugInfo).map(([key, val]) => (
          <div key={key} className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">{key}:</span>
            <span className="text-foreground font-mono text-right max-w-[60%] truncate">{val}</span>
          </div>
        ))}
      </div>
      <button 
        onClick={handleForceReregister} 
        disabled={reregistering}
        className="w-full mt-3 py-2.5 rounded-xl bg-primary/20 text-primary text-xs font-semibold flex items-center justify-center gap-2 transition-all hover:bg-primary/30 disabled:opacity-50"
      >
        {reregistering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
        Force Re-register Push Token
      </button>
    </div>
  );
};


const NotificationToggle = ({ label, desc, defaultOn, storageKey }: { label: string; desc: string; defaultOn: boolean; storageKey: string }) => {
  const [enabled, setEnabled] = useState(() => {
    try { const v = localStorage.getItem(storageKey); return v !== null ? v === "true" : defaultOn; } catch { return defaultOn; }
  });
  const toggle = async () => {
    const next = !enabled;

    if (storageKey === "rs_notif_push" && next) {
      try {
        // Force browser permission prompt first
        if ("Notification" in window && Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            toast.error("নোটিফিকেশন অনুমতি দেওয়া হয়নি। ব্রাউজার সেটিংস থেকে Allow করুন।");
            return; // Don't toggle on if not granted
          }
        } else if ("Notification" in window && Notification.permission === "denied") {
          toast.error("❌ নোটিফিকেশন ব্লক করা আছে! ব্রাউজার Settings → Notifications → Allow করুন।");
          return;
        }
        setEnabled(next);
        localStorage.setItem(storageKey, String(next));
        const u = JSON.parse(localStorage.getItem("rsanime_user") || "{}");
        if (u?.id) await registerFCMToken(u.id, true);
      } catch {
        setEnabled(!next);
      }
    } else {
      setEnabled(next);
      localStorage.setItem(storageKey, String(next));
    }
  };
  return (
    <div onClick={() => { void toggle(); }} className="glass-card px-4 py-4 rounded-xl cursor-pointer transition-all hover:border-primary flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <div className={`w-11 h-6 rounded-full transition-all relative ${enabled ? "bg-primary" : "bg-foreground/20"}`}>
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
      </div>
    </div>
  );
};

const ProfilePage = forwardRef<HTMLDivElement, ProfilePageProps>((props, _ref) => {
  return <ProfilePageInner {...props} />;
});

ProfilePage.displayName = "ProfilePage";

export default ProfilePage;
