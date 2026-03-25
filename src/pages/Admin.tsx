import { useState, useEffect, useRef, useCallback } from "react";
import { db, ref, onValue, push, set, remove, update, get, auth, signInWithEmailAndPassword, signOut } from "@/lib/firebase";
import { sendPushToUsers, type PushProgress } from "@/lib/fcm";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useUiConfig } from "@/hooks/useUiConfig";
import {
  LayoutDashboard, FolderOpen, Film, Video, Users, Bell, Zap, PlusCircle, CloudDownload,
  Menu, X, MoreVertical, RefreshCw, Plus, Download, Trash2, Edit, Eye, EyeOff,
  Shield, LogOut, Search, Save, ChevronDown, Send, Link, ChevronLeft, ChevronRight,
  Lock, KeyRound, AlertTriangle, Power, Settings, MessageCircle, Reply, BarChart3, Activity, TrendingUp,
  Monitor, Crown, Image, Type, Palette
} from "lucide-react";

const TMDB_API_KEY = "37f4b185e3dc487e4fd3e56e2fab2307";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/";

const SUPABASE_BASE_URL = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const HAS_SUPABASE_BASE_URL = !!SUPABASE_BASE_URL && !SUPABASE_BASE_URL.includes("placeholder.supabase.co");
const DEFAULT_VIDEO_PROXY_ENDPOINT = HAS_SUPABASE_BASE_URL
  ? `${SUPABASE_BASE_URL.replace(/\/$/, "")}/functions/v1/video-proxy`
  : "";
const DEFAULT_FCM_ENDPOINT = HAS_SUPABASE_BASE_URL
  ? `${SUPABASE_BASE_URL.replace(/\/$/, "")}/functions/v1/send-fcm`
  : "";

type Section = "dashboard" | "categories" | "webseries" | "movies" | "users" | "notifications" | "new-releases" | "tmdb-fetch" | "add-content" | "redeem-codes" | "maintenance" | "free-access" | "settings" | "comments" | "analytics" | "premium-users" | "ui-control" | "fcm-config" | "arolink";

interface CastMember {
  name: string;
  character?: string;
  photo: string;
}

interface Episode {
  episodeNumber: number;
  title: string;
  link: string;
  link480?: string;
  link720?: string;
  link1080?: string;
  link4k?: string;
}

interface Season {
  name: string;
  seasonNumber: number;
  episodes: Episode[];
}

const DEFAULT_ADMIN_EMAIL = "tamimlegendaryboy@gmail.com";

const Admin = () => {
  const uiCfg = useUiConfig();
  // Auth states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [adminEmails, setAdminEmails] = useState<string[]>([DEFAULT_ADMIN_EMAIL]);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [savedPin, setSavedPin] = useState("");
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPinInput, setNewPinInput] = useState("");

  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [fetchingOverlay, setFetchingOverlay] = useState(false);

  // Data state
  const [categoriesData, setCategoriesData] = useState<Record<string, any>>({});
  const [webseriesData, setWebseriesData] = useState<any[]>([]);
  const [moviesData, setMoviesData] = useState<any[]>([]);
  const [usersData, setUsersData] = useState<any[]>([]);
  const [notificationsData, setNotificationsData] = useState<any[]>([]);
  const [releasesData, setReleasesData] = useState<any[]>([]);
  const [commentsData, setCommentsData] = useState<any[]>([]);

  // Form states
  const [categoryInput, setCategoryInput] = useState("");
  const [seriesTab, setSeriesTab] = useState<"ws-list" | "ws-add">("ws-list");
  const [moviesTab, setMoviesTab] = useState<"mv-list" | "mv-add">("mv-list");
  const [fetchType, setFetchType] = useState<"movie" | "tv">("movie");
  const [quickTmdbId, setQuickTmdbId] = useState("");

  // Series form
  const [seriesForm, setSeriesForm] = useState<any>(null);
  const [seriesCast, setSeriesCast] = useState<CastMember[]>([]);
  const [seasonsData, setSeasonsData] = useState<Season[]>([]);
  const [seriesSearch, setSeriesSearch] = useState("");
  const [seriesResults, setSeriesResults] = useState<any[]>([]);
  const [seriesEditId, setSeriesEditId] = useState("");

  // Movie form
  const [movieForm, setMovieForm] = useState<any>(null);
  const [movieCast, setMovieCast] = useState<CastMember[]>([]);
  const [movieSearch, setMovieSearch] = useState("");
  const [movieResults, setMovieResults] = useState<any[]>([]);
  const [wsListSearch, setWsListSearch] = useState("");
  const [mvListSearch, setMvListSearch] = useState("");
  const [movieEditId, setMovieEditId] = useState("");

  // Notification form
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [notifContent, setNotifContent] = useState("");
  const [notifType, setNotifType] = useState("info");
  const [notifTarget, setNotifTarget] = useState("all");
  const [contentOptions, setContentOptions] = useState<{ value: string; label: string; poster: string }[]>([]);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [releaseDropdownOpen, setReleaseDropdownOpen] = useState(false);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const releaseDropdownRef = useRef<HTMLDivElement>(null);

  // New release form
  const [releaseContent, setReleaseContent] = useState("");
  const [releaseSeason, setReleaseSeason] = useState("");
  const [releaseEpisode, setReleaseEpisode] = useState("");
  const [releaseSeasons, setReleaseSeasons] = useState<any[]>([]);
  const [releaseEpisodes, setReleaseEpisodes] = useState<any[]>([]);
  const [showSeasonEpisode, setShowSeasonEpisode] = useState(false);

  // Redeem code state
  const [redeemCodesData, setRedeemCodesData] = useState<any[]>([]);
  const [newCodeDays, setNewCodeDays] = useState("30");
  const [newCodeNote, setNewCodeNote] = useState("");

  // Free access users state
  const [freeAccessUsers, setFreeAccessUsers] = useState<any[]>([]);

  // Settings state
  const [tutorialLink, setTutorialLink] = useState("");
  const [tutorialLinkInput, setTutorialLinkInput] = useState("");
  const [streamProxyEnabled, setStreamProxyEnabled] = useState(true);
  const [streamProxyUrl, setStreamProxyUrl] = useState(DEFAULT_VIDEO_PROXY_ENDPOINT);
  const [streamCdnEnabled, setStreamCdnEnabled] = useState(true);
  const [streamCdnUrl, setStreamCdnUrl] = useState("https://rs-anime-3.rahatsarker224.workers.dev");
  const [streamPingUrl, setStreamPingUrl] = useState("http://fi3.bot-hosting.net:22854/6389/6621572366_1774364535_1.mp4?hash=AgAD5R");
  const [streamTesting, setStreamTesting] = useState<"proxy" | "cdn" | null>(null);
  const [streamPingResult, setStreamPingResult] = useState<{ type: "idle" | "ok" | "error"; text: string }>({
    type: "idle",
    text: "",
  });

  // Maintenance state
  const [maintenanceActive, setMaintenanceActive] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("Server is under maintenance. Please wait.");
  const [maintenanceResumeDate, setMaintenanceResumeDate] = useState("");
  const [currentMaintenance, setCurrentMaintenance] = useState<any>(null);

  // Global free access state
  const [globalFreeAccess, setGlobalFreeAccess] = useState<any>(null);
  const [globalFreeHours, setGlobalFreeHours] = useState("2");
  const [globalFreeMinutes, setGlobalFreeMinutes] = useState("0");

  // Premium users state
  const [premiumUsers, setPremiumUsers] = useState<any[]>([]);
  const [editingPremium, setEditingPremium] = useState<string | null>(null);
  const [editPremiumDays, setEditPremiumDays] = useState("");

  // Arolink state
  const [arolinkApiKey, setArolinkApiKey] = useState("");
  const [arolinkAccessHours, setArolinkAccessHours] = useState("24");
  const [arolinkEnabled, setArolinkEnabled] = useState(true);

  // UI Control state
  const [uiConfig, setUiConfig] = useState<Record<string, string>>({});
  const [uiConfigInputs, setUiConfigInputs] = useState<Record<string, string>>({});

  // FCM Config state
  const [fcmVapidKey, setFcmVapidKey] = useState("");
  const [fcmSendEndpoint, setFcmSendEndpoint] = useState("");

  // Analytics state
  const [analyticsViews, setAnalyticsViews] = useState<Record<string, any>>({});
  const [activeViewers, setActiveViewers] = useState<Record<string, any>>({});
  const [dailyActiveUsers, setDailyActiveUsers] = useState<Record<string, any>>({});

  // Push progress state
  const [pushProgress, setPushProgress] = useState<PushProgress | null>(null);
  const [pushSending, setPushSending] = useState(false);
  const [fcmTokenStats, setFcmTokenStats] = useState<{ totalTokens: number; totalUsers: number; lastUpdated: number }>({
    totalTokens: 0,
    totalUsers: 0,
    lastUpdated: 0,
  });

  // Expanded episodes
  const [expandedSeasons, setExpandedSeasons] = useState<Record<number, boolean>>({});

  // Firebase connection check
  useEffect(() => {
    const connRef = ref(db, ".info/connected");
    const unsub = onValue(connRef, (snap) => {
      setFirebaseConnected(snap.val() === true);
    });
    return () => unsub();
  }, []);

  // Load admin emails from Firebase
  useEffect(() => {
    const unsub = onValue(ref(db, "admin/emails"), (snap) => {
      const data = snap.val();
      if (data && typeof data === "object") {
        const emails = Object.values(data).map((e: any) => String(e).trim().toLowerCase()).filter(Boolean);
        if (emails.length > 0) {
          setAdminEmails(emails);
        } else {
          setAdminEmails([DEFAULT_ADMIN_EMAIL]);
        }
      } else {
        setAdminEmails([DEFAULT_ADMIN_EMAIL]);
      }
    });
    return () => unsub();
  }, []);

  // Check Firebase Auth state
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user && user.email && adminEmails.includes(user.email.toLowerCase())) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    });
    return () => unsub();
  }, [adminEmails]);

  // Load PIN settings
  useEffect(() => {
    const unsub = onValue(ref(db, "admin/pin"), (snap) => {
      const data = snap.val();
      if (data && data.enabled && data.code) {
        setPinEnabled(true);
        setSavedPin(data.code);
      } else {
        setPinEnabled(false);
        setSavedPin("");
        setIsPinVerified(true); // No pin = auto verified
      }
    });
    return () => unsub();
  }, []);

  // Load all data
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onValue(ref(db, "categories"), (snap) => {
      setCategoriesData(snap.val() || {});
    }));

    unsubs.push(onValue(ref(db, "webseries"), (snap) => {
      const data = snap.val() || {};
      setWebseriesData(Object.entries(data).map(([id, item]: any) => ({ id, ...item })));
    }));

    unsubs.push(onValue(ref(db, "movies"), (snap) => {
      const data = snap.val() || {};
      setMoviesData(Object.entries(data).map(([id, item]: any) => ({ id, ...item })));
    }));

    unsubs.push(onValue(ref(db, "users"), (snap) => {
      const data = snap.val() || {};
      setUsersData(Object.entries(data).map(([id, user]: any) => ({ id, ...user })));
    }));

    unsubs.push(onValue(ref(db, "fcmTokens"), (snap) => {
      const data = snap.val() || {};
      let totalTokens = 0;
      Object.values(data).forEach((userTokens: any) => {
        totalTokens += Object.keys(userTokens || {}).length;
      });
      setFcmTokenStats({
        totalTokens,
        totalUsers: Object.keys(data).length,
        lastUpdated: Date.now(),
      });
    }));

    unsubs.push(onValue(ref(db, "notifications"), (snap) => {
      const data = snap.val() || {};
      const allNotifs: any[] = [];
      Object.entries(data).forEach(([uid, userNotifs]: any) => {
        Object.entries(userNotifs || {}).forEach(([notifId, notif]: any) => {
          allNotifs.push({ ...notif, id: notifId, oderId: uid, userId: uid });
        });
      });
      allNotifs.sort((a, b) => b.timestamp - a.timestamp);
      setNotificationsData(allNotifs);
    }));

    unsubs.push(onValue(ref(db, "newEpisodeReleases"), (snap) => {
      const data = snap.val() || {};
      const arr = Object.entries(data).map(([id, r]: any) => ({ id, ...r }));
      arr.sort((a, b) => b.timestamp - a.timestamp);
      setReleasesData(arr);
    }));

    unsubs.push(onValue(ref(db, "redeemCodes"), (snap) => {
      const data = snap.val() || {};
      setRedeemCodesData(Object.entries(data).map(([id, item]: any) => ({ id, ...item })));
    }));

    unsubs.push(onValue(ref(db, "maintenance"), (snap) => {
      setCurrentMaintenance(snap.val());
      if (snap.val()?.active) setMaintenanceActive(true);
      else setMaintenanceActive(false);
    }));

    unsubs.push(onValue(ref(db, "freeAccessUsers"), (snap) => {
      const data = snap.val() || {};
      const now = Date.now();
      const activeUsers: any[] = [];
      Object.entries(data).forEach(([id, user]: [string, any]) => {
        if (user.expiresAt > now) {
          activeUsers.push({ id, ...user });
        } else {
          // Auto-cleanup expired entries
          remove(ref(db, `freeAccessUsers/${id}`)).catch(() => {});
        }
      });
      activeUsers.sort((a, b) => b.unlockedAt - a.unlockedAt);
      setFreeAccessUsers(activeUsers);
    }));

    unsubs.push(onValue(ref(db, "globalFreeAccess"), (snap) => {
      setGlobalFreeAccess(snap.val() || null);
    }));

    unsubs.push(onValue(ref(db, "settings/tutorialLink"), (snap) => {
      const val = snap.val() || "";
      setTutorialLink(val);
      setTutorialLinkInput(val);
    }));

    // Load premium users (users with active premium - stored as nested object)
    unsubs.push(onValue(ref(db, "users"), (snap) => {
      const data = snap.val() || {};
      const now = Date.now();
      const premium: any[] = [];
      Object.entries(data).forEach(([id, user]: [string, any]) => {
        const prem = user.premium;
        if (prem && typeof prem === "object" && prem.active && prem.expiresAt && prem.expiresAt > now) {
          premium.push({ id, ...user, _premiumData: prem });
        }
      });
      premium.sort((a, b) => ((b._premiumData?.expiresAt || 0) - (a._premiumData?.expiresAt || 0)));
      setPremiumUsers(premium);
    }));

    // Load Arolink config
    unsubs.push(onValue(ref(db, "settings/arolink"), (snap) => {
      const data = snap.val() || {};
      setArolinkApiKey(data.apiKey || "");
      setArolinkAccessHours(String(data.accessHours || 24));
      setArolinkEnabled(data.enabled !== false);
    }));

    // Load UI config
    unsubs.push(onValue(ref(db, "settings/uiConfig"), (snap) => {
      const data = snap.val() || {};
      setUiConfig(data);
      setUiConfigInputs(data);
    }));

    // Load FCM config
    unsubs.push(onValue(ref(db, "settings/fcmConfig"), (snap) => {
      const data = snap.val() || {};
      setFcmVapidKey(data.vapidKey || "");
      setFcmSendEndpoint(data.sendEndpoint || DEFAULT_FCM_ENDPOINT);
    }));

    // Load stream routing config
    unsubs.push(onValue(ref(db, "settings/streamConfig"), (snap) => {
      const data = snap.val() || {};
      setStreamProxyEnabled(data.proxyEnabled !== false);
      setStreamProxyUrl((data.proxyUrl || DEFAULT_VIDEO_PROXY_ENDPOINT).trim());
      setStreamCdnEnabled(data.cdnEnabled !== false);
      setStreamCdnUrl((data.cdnUrl || "").trim() || "https://rs-anime-3.rahatsarker224.workers.dev");
      if (typeof data.pingUrl === "string" && data.pingUrl.trim()) {
        setStreamPingUrl(data.pingUrl.trim());
      }
    }));

    // Load all comments
    unsubs.push(onValue(ref(db, "comments"), (snap) => {
      const data = snap.val() || {};
      const allComments: any[] = [];
      Object.entries(data).forEach(([animeId, comments]: any) => {
        Object.entries(comments || {}).forEach(([commentId, comment]: any) => {
          const replies = comment.replies ? Object.entries(comment.replies).map(([rId, r]: any) => ({
            id: rId, ...r
          })) : [];
          allComments.push({
            id: commentId, animeId, ...comment, replies,
          });
        });
      });
      allComments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setCommentsData(allComments);
    }));
    // Load analytics data
    unsubs.push(onValue(ref(db, "analytics/views"), (snap) => {
      setAnalyticsViews(snap.val() || {});
    }));
    unsubs.push(onValue(ref(db, "analytics/activeViewers"), (snap) => {
      setActiveViewers(snap.val() || {});
    }));
    unsubs.push(onValue(ref(db, "analytics/dailyActive"), (snap) => {
      setDailyActiveUsers(snap.val() || {});
    }));

    return () => unsubs.forEach(u => u());
  }, []);

  // Build content options for notifications/releases (newest first by createdAt)
  useEffect(() => {
    const options: { value: string; label: string; poster: string; createdAt: number }[] = [];
    webseriesData.forEach(s => options.push({ value: `${s.id}|webseries`, label: `Series: ${s.title}`, poster: s.poster || "", createdAt: s.createdAt || 0 }));
    moviesData.forEach(m => options.push({ value: `${m.id}|movie`, label: `Movie: ${m.title}`, poster: m.poster || "", createdAt: m.createdAt || 0 }));
    // Sort by createdAt descending so newest added items appear first
    options.sort((a, b) => b.createdAt - a.createdAt);
    setContentOptions(options);
  }, [webseriesData, moviesData]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) setNotifDropdownOpen(false);
      if (releaseDropdownRef.current && !releaseDropdownRef.current.contains(e.target as Node)) setReleaseDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const showSection = (section: Section) => {
    setActiveSection(section);
    setSidebarOpen(false);
    setDropdownOpen(false);
  };

  const formatTime = (ts: number) => {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const sectionTitles: Record<Section, string> = {
    dashboard: "Dashboard",
    categories: "Categories",
    webseries: "Web Series",
    movies: "Movies",
    users: "Users",
    notifications: "Notifications",
    "new-releases": "New Releases",
    "tmdb-fetch": "TMDB Fetch",
    "add-content": "Add Content",
    "redeem-codes": "Redeem Codes",
    maintenance: "Server Maintenance",
    "free-access": "Free Access Users",
    settings: "Settings",
    comments: "Comments",
    analytics: "Analytics & Views",
    "premium-users": "Premium Users",
    "ui-control": "USR & ADM UI",
    "fcm-config": "FCM Config",
    arolink: "Arolink Ads",
  };

  // ==================== CATEGORIES ====================
  const saveCategory = () => {
    if (!categoryInput.trim()) { toast.error("Please enter category name"); return; }
    push(ref(db, "categories"), { name: categoryInput.trim(), createdAt: Date.now() })
      .then(() => { toast.success("Category saved!"); setCategoryInput(""); })
      .catch(err => toast.error("Error: " + err.message));
  };

  const editCategory = (id: string, oldName: string) => {
    const newName = prompt("Edit category name:", oldName);
    if (newName && newName.trim() && newName !== oldName) {
      update(ref(db, `categories/${id}`), { name: newName.trim(), updatedAt: Date.now() })
        .then(() => toast.success("Category updated!"))
        .catch(err => toast.error("Error: " + err.message));
    }
  };

  const deleteCategory = (id: string) => {
    if (confirm("Delete this category?")) {
      remove(ref(db, `categories/${id}`))
        .then(() => toast.success("Category deleted!"))
        .catch(err => toast.error("Error: " + err.message));
    }
  };

  // ==================== TMDB SEARCH ====================
  const searchTMDBSeries = async () => {
    if (!seriesSearch.trim()) { toast.error("Please enter search query"); return; }
    setFetchingOverlay(true);
    try {
      const res = await fetch(`${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(seriesSearch)}`);
      const data = await res.json();
      if (data.results?.length > 0) {
        setSeriesResults(data.results.slice(0, 9));
      } else {
        toast.error("No results found");
      }
    } catch { toast.error("Error searching TMDB"); }
    finally { setFetchingOverlay(false); }
  };

  const fetchSeriesDetails = async (id: number) => {
    // Check if this TMDB ID already exists
    const existing = webseriesData.find(s => s.tmdbId === id || s.tmdbId === String(id));
    if (existing) {
      toast.warning(`"${existing.title}" আগে থেকেই আছে!`, { duration: 5000 });
      // On second click (confirm), load existing data for editing
      if (seriesForm?.tmdbId === id || seriesForm?.tmdbId === String(id)) {
        editSeries(existing.id);
        setSeriesResults([]);
        return;
      }
      // Set form with TMDB ID so next click loads existing
      setSeriesForm({ tmdbId: id });
      return;
    }

    setFetchingOverlay(true);
    try {
      const res = await fetch(`${TMDB_BASE_URL}/tv/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits,videos,images`);
      const data = await res.json();
      if (data.success === false) throw new Error("Not found");

      let trailerUrl = "";
      if (data.videos?.results) {
        const trailer = data.videos.results.find((v: any) => v.type === "Trailer" && v.site === "YouTube");
        if (trailer) trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
      }
      let logoUrl = "";
      if (data.images?.logos?.length > 0) {
        const logo = data.images.logos.find((l: any) => l.iso_639_1 === "en") || data.images.logos[0];
        logoUrl = TMDB_IMG_BASE + "w500" + logo.file_path;
      }
      const cast = data.credits?.cast?.slice(0, 10).map((c: any) => ({
        name: c.name, character: c.character, photo: c.profile_path ? TMDB_IMG_BASE + "w185" + c.profile_path : ""
      })) || [];

      setSeriesForm({
        tmdbId: data.id, title: data.name || "", logo: logoUrl, poster: data.poster_path ? TMDB_IMG_BASE + "original" + data.poster_path : "",
        backdrop: data.backdrop_path ? TMDB_IMG_BASE + "original" + data.backdrop_path : "", trailer: trailerUrl,
        year: data.first_air_date?.split("-")[0] || "", rating: data.vote_average?.toFixed(1) || "",
        language: "English", category: "", storyline: data.overview || ""
      });
      setSeriesCast(cast);
      setSeriesResults([]);
      setSeriesEditId("");

      // Set seasons
      const newSeasons: Season[] = [];
      if (data.seasons) {
        data.seasons.filter((s: any) => s.season_number > 0).forEach((season: any) => {
          newSeasons.push({
            name: season.name, seasonNumber: season.season_number,
            episodes: Array(season.episode_count).fill(null).map((_, i) => ({
              episodeNumber: i + 1, title: `Episode ${i + 1}`, link: ""
            }))
          });
        });
      }
      setSeasonsData(newSeasons);
      toast.success("Series details fetched!");
    } catch (err: any) { toast.error("Error: " + err.message); }
    finally { setFetchingOverlay(false); }
  };

  const saveSeries = () => {
    if (!seriesForm) return;
    if (!seriesForm.title) { toast.error("Please enter title"); return; }
    if (!seriesForm.category) { toast.error("Please select category"); return; }

    const data = { ...seriesForm, cast: seriesCast, seasons: seasonsData, type: "webseries", updatedAt: Date.now() };
    let saveRef;
    if (seriesEditId) {
      saveRef = ref(db, `webseries/${seriesEditId}`);
    } else {
      saveRef = push(ref(db, "webseries"));
      data.createdAt = Date.now();
    }
    set(saveRef, data)
      .then(() => {
        toast.success(seriesEditId ? "Series updated!" : "Series saved!");
        setSeriesForm(null); setSeasonsData([]); setSeriesCast([]); setSeriesEditId(""); setSeriesTab("ws-list");
      })
      .catch(err => toast.error("Error: " + err.message));
  };

  const editSeries = async (id: string) => {
    const snap = await get(ref(db, `webseries/${id}`));
    const data = snap.val();
    if (!data) return;
    setSeriesForm({
      tmdbId: data.tmdbId || "", title: data.title || "", logo: data.logo || "", poster: data.poster || "",
      backdrop: data.backdrop || "", trailer: data.trailer || "", year: data.year || "", rating: data.rating || "",
      language: data.language || "English", category: data.category || "", storyline: data.storyline || ""
    });
    setSeriesCast(data.cast || []);
    setSeasonsData(data.seasons || []);
    setSeriesEditId(id);
    setActiveSection("webseries");
    setSeriesTab("ws-add");
    toast.info("Editing: " + data.title);
  };

  const deleteSeries = (id: string) => {
    if (confirm("Delete this series?")) {
      remove(ref(db, `webseries/${id}`)).then(() => toast.success("Deleted!")).catch(err => toast.error("Error: " + err.message));
    }
  };

  // ==================== MOVIES ====================
  const searchTMDBMovies = async () => {
    if (!movieSearch.trim()) { toast.error("Please enter search query"); return; }
    setFetchingOverlay(true);
    try {
      const res = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movieSearch)}`);
      const data = await res.json();
      if (data.results?.length > 0) { setMovieResults(data.results.slice(0, 9)); }
      else { toast.error("No results found"); }
    } catch { toast.error("Error searching TMDB"); }
    finally { setFetchingOverlay(false); }
  };

  const fetchMovieDetails = async (id: number) => {
    // Check if this TMDB ID already exists
    const existing = moviesData.find(m => m.tmdbId === id || m.tmdbId === String(id));
    if (existing) {
      toast.warning(`"${existing.title}" আগে থেকেই আছে!`, { duration: 5000 });
      // On second click (confirm), load existing data for editing
      if (movieForm?.tmdbId === id || movieForm?.tmdbId === String(id)) {
        editMovie(existing.id);
        setMovieResults([]);
        return;
      }
      // Set form with TMDB ID so next click loads existing
      setMovieForm({ tmdbId: id });
      return;
    }

    setFetchingOverlay(true);
    try {
      const res = await fetch(`${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits,videos,images`);
      const data = await res.json();
      if (data.success === false) throw new Error("Not found");

      let trailerUrl = "";
      if (data.videos?.results) {
        const trailer = data.videos.results.find((v: any) => v.type === "Trailer" && v.site === "YouTube");
        if (trailer) trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
      }
      let logoUrl = "";
      if (data.images?.logos?.length > 0) {
        const logo = data.images.logos.find((l: any) => l.iso_639_1 === "en") || data.images.logos[0];
        logoUrl = TMDB_IMG_BASE + "w500" + logo.file_path;
      }
      const cast = data.credits?.cast?.slice(0, 10).map((c: any) => ({
        name: c.name, character: c.character, photo: c.profile_path ? TMDB_IMG_BASE + "w185" + c.profile_path : ""
      })) || [];

      setMovieForm({
        tmdbId: data.id, title: data.title || "", logo: logoUrl, poster: data.poster_path ? TMDB_IMG_BASE + "original" + data.poster_path : "",
        backdrop: data.backdrop_path ? TMDB_IMG_BASE + "original" + data.backdrop_path : "", trailer: trailerUrl,
        year: data.release_date?.split("-")[0] || "", rating: data.vote_average?.toFixed(1) || "",
        language: "English", category: "", storyline: data.overview || "", movieLink: "", downloadLink: ""
      });
      setMovieCast(cast);
      setMovieResults([]);
      setMovieEditId("");
      toast.success("Movie details fetched!");
    } catch (err: any) { toast.error("Error: " + err.message); }
    finally { setFetchingOverlay(false); }
  };

  const saveMovie = () => {
    if (!movieForm) return;
    if (!movieForm.title) { toast.error("Please enter title"); return; }
    if (!movieForm.category) { toast.error("Please select category"); return; }
    if (!movieForm.movieLink) { toast.error("Please enter movie link"); return; }

    const data = { ...movieForm, cast: movieCast, type: "movie", updatedAt: Date.now() };
    let saveRef;
    if (movieEditId) {
      saveRef = ref(db, `movies/${movieEditId}`);
    } else {
      saveRef = push(ref(db, "movies"));
      data.createdAt = Date.now();
    }
    set(saveRef, data)
      .then(() => {
        toast.success(movieEditId ? "Movie updated!" : "Movie saved!");
        setMovieForm(null); setMovieCast([]); setMovieEditId(""); setMoviesTab("mv-list");
      })
      .catch(err => toast.error("Error: " + err.message));
  };

  const editMovie = async (id: string) => {
    const snap = await get(ref(db, `movies/${id}`));
    const data = snap.val();
    if (!data) return;
    setMovieForm({
      tmdbId: data.tmdbId || "", title: data.title || "", logo: data.logo || "", poster: data.poster || "",
      backdrop: data.backdrop || "", trailer: data.trailer || "", year: data.year || "", rating: data.rating || "",
      language: data.language || "English", category: data.category || "", storyline: data.storyline || "",
      movieLink: data.movieLink || "", downloadLink: data.downloadLink || "",
      movieLink480: data.movieLink480 || "", movieLink720: data.movieLink720 || "",
      movieLink1080: data.movieLink1080 || "", movieLink4k: data.movieLink4k || ""
    });
    setMovieCast(data.cast || []);
    setMovieEditId(id);
    setActiveSection("movies");
    setMoviesTab("mv-add");
    toast.info("Editing: " + data.title);
  };

  const deleteMovie = (id: string) => {
    if (confirm("Delete this movie?")) {
      remove(ref(db, `movies/${id}`)).then(() => toast.success("Deleted!")).catch(err => toast.error("Error: " + err.message));
    }
  };

  // ==================== NOTIFICATIONS ====================
  const sendNotification = async () => {
    if (!notifTitle || !notifMessage) { toast.error("Please enter title and message"); return; }
    const savedTitle = notifTitle;
    const savedMessage = notifMessage;

    setPushSending(true);
    setPushProgress({ phase: "tokens", totalTokens: 0, sent: 0, success: 0, failed: 0, invalidRemoved: 0 });

    try {
      let contentId = "", contentType = "", contentPoster = "";
      if (notifContent) {
        const parts = notifContent.split("|");
        contentId = parts[0]; contentType = parts[1];
        contentPoster = contentOptions.find((o) => o.value === notifContent)?.poster || "";
      }

      const usersSnap = await get(ref(db, "users"));
      const users = usersSnap.val() || {};
      const targetUserIds: string[] = [];
      const userNotifUpdates: Record<string, any> = {};
      const seenUserIds = new Set<string>();

      Object.entries(users).forEach(([userKey, userData]: any) => {
        const effectiveUserId = String(userData?.id || userKey || "").trim();
        if (!effectiveUserId || seenUserIds.has(effectiveUserId)) return;
        if (notifTarget === "online" && !userData?.online) return;

        seenUserIds.add(effectiveUserId);
        targetUserIds.push(effectiveUserId);

        const notifKey = push(ref(db, `notifications/${effectiveUserId}`)).key;
        if (!notifKey) return;

        userNotifUpdates[`notifications/${effectiveUserId}/${notifKey}`] = {
          title: savedTitle,
          message: savedMessage,
          type: notifType,
          contentId,
          contentType,
          image: contentPoster,
          poster: contentPoster,
          timestamp: Date.now(),
          read: false,
        };
      });

      if (Object.keys(userNotifUpdates).length > 0) {
        await update(ref(db), userNotifUpdates);
      }
      toast.success(`In-app notification sent to ${targetUserIds.length} users`);
      setNotifTitle("");
      setNotifMessage("");

      if (targetUserIds.length === 0) {
        setPushSending(false); setPushProgress(null);
        return;
      }

      const pushPayload = {
        title: savedTitle || "ICF ANIME",
        body: savedMessage,
        image: contentPoster || undefined,
        url: contentId ? `/?anime=${contentId}` : "/",
        data: { url: contentId ? `/?anime=${contentId}` : "/", type: notifType || "info", contentId },
      };

      const result = await sendPushToUsers(targetUserIds, pushPayload, (p) => setPushProgress({ ...p }));
      console.log("FCM result:", result);
      if ((result?.total || 0) === 0) {
        const reason = result?.reason ? ` [${result.reason}]` : "";
        toast.warning(`Push token পাওয়া যায়নি${reason} — শুধু in-app notification গেছে`);
      } else {
        toast.success(`Push: ${result?.success || 0} delivered, ${result?.failed || 0} failed`);
      }
    } catch (err: any) {
      console.warn("Notification send failed:", err);
      toast.error("Error: " + err.message);
    } finally {
      setTimeout(() => { setPushSending(false); setPushProgress(null); }, 6000);
    }
  };

  const deleteNotification = async (title: string, message: string, timestamp: number) => {
    if (!confirm("Delete this notification for all users?")) return;
    try {
      const snap = await get(ref(db, "notifications"));
      const allData = snap.val() || {};
      const deleteUpdates: Record<string, null> = {};

      Object.entries(allData).forEach(([uid, userNotifs]: any) => {
        Object.entries(userNotifs || {}).forEach(([nid, notif]: any) => {
          if (notif.title === title && notif.message === message) {
            deleteUpdates[`notifications/${uid}/${nid}`] = null;
          }
        });
      });

      const deleteCount = Object.keys(deleteUpdates).length;
      if (deleteCount > 0) {
        await update(ref(db), deleteUpdates);
        toast.success(`Deleted ${deleteCount} notifications`);
      } else {
        toast.error("Notification not found");
      }
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error("Error deleting notification");
    }
  };

  // ==================== NEW RELEASES ====================
  const handleReleaseContentChange = (value: string) => {
    setReleaseContent(value);
    setReleaseSeason(""); setReleaseEpisode(""); setReleaseSeasons([]); setReleaseEpisodes([]);
    if (!value) { setShowSeasonEpisode(false); return; }
    const [contentId, contentType] = value.split("|");
    if (contentType === "webseries") {
      const series = webseriesData.find(s => s.id === contentId);
      if (series?.seasons?.length > 0) {
        setReleaseSeasons(series.seasons.map((s: any, i: number) => ({ index: i, name: s.name || `Season ${i + 1}` })));
        setShowSeasonEpisode(true);
      } else { toast.error("This series has no seasons"); setShowSeasonEpisode(false); }
    } else if (contentType === "movie") {
      setReleaseSeasons([{ index: 0, name: "Movie" }]);
      setReleaseEpisodes([{ index: 0, name: "Complete Movie" }]);
      setReleaseSeason("0"); setReleaseEpisode("0");
      setShowSeasonEpisode(true);
    }
  };

  const handleReleaseSeasonChange = (value: string) => {
    setReleaseSeason(value); setReleaseEpisode(""); setReleaseEpisodes([]);
    if (!releaseContent || value === "") return;
    const [contentId, contentType] = releaseContent.split("|");
    if (contentType === "webseries") {
      const series = webseriesData.find(s => s.id === contentId);
      if (series?.seasons?.[parseInt(value)]) {
        const season = series.seasons[parseInt(value)];
        if (season.episodes?.length > 0) {
          setReleaseEpisodes(season.episodes.map((ep: any, i: number) => ({ index: i, name: `Episode ${ep.episodeNumber || i + 1}` })));
        } else { toast.error("No episodes in this season"); }
      }
    } else if (contentType === "movie") {
      setReleaseEpisodes([{ index: 0, name: "Complete Movie" }]);
      setReleaseEpisode("0");
    }
  };

  const addNewRelease = async () => {
    if (!releaseContent || releaseSeason === "" || releaseEpisode === "") {
      toast.error("Please select content, season and episode"); return;
    }
    const [contentId, contentType] = releaseContent.split("|");
    let content: any; let episodeInfo: any = {};
    if (contentType === "webseries") {
      content = webseriesData.find(s => s.id === contentId);
      if (content?.seasons?.[parseInt(releaseSeason)]) {
        const season = content.seasons[parseInt(releaseSeason)];
        const episode = season.episodes?.[parseInt(releaseEpisode)];
        episodeInfo = {
          seasonNumber: parseInt(releaseSeason) + 1,
          episodeNumber: episode?.episodeNumber || parseInt(releaseEpisode) + 1,
          seasonName: season.name || `Season ${parseInt(releaseSeason) + 1}`
        };
      }
    } else {
      content = moviesData.find(m => m.id === contentId);
      episodeInfo = { type: "movie", seasonName: "Movie" };
    }
    if (!content) { toast.error("Content not found"); return; }

    const newRelease = {
      contentId, contentType, title: content.title, poster: content.poster || "",
      year: content.year || "N/A", rating: content.rating || "N/A",
      episodeInfo, timestamp: Date.now(), active: true
    };
    try {
      await set(push(ref(db, "newEpisodeReleases")), newRelease);
      toast.success("Added as New Release");
      // Send notification
      const usersSnap = await get(ref(db, "users"));
      const users = usersSnap.val() || {};
      const releaseNotifTitle = contentType === "webseries" ? `New Episode: ${content.title}` : `New Movie: ${content.title}`;
      const releaseNotifMsg = contentType === "webseries"
        ? `${episodeInfo.seasonName} - Episode ${episodeInfo.episodeNumber} is now available!`
        : `${content.title} (${content.year}) is now available!`;

      const userNotifUpdates: Record<string, any> = {};
      const seenUserIds = new Set<string>();
      Object.entries(users).forEach(([userKey, userData]: any) => {
        const effectiveUserId = String(userData?.id || userKey || "").trim();
        if (!effectiveUserId || seenUserIds.has(effectiveUserId)) return;
        seenUserIds.add(effectiveUserId);

        const notifKey = push(ref(db, `notifications/${effectiveUserId}`)).key;
        if (!notifKey) return;

        userNotifUpdates[`notifications/${effectiveUserId}/${notifKey}`] = {
          title: releaseNotifTitle,
          message: releaseNotifMsg,
          type: "new_episode",
          contentId,
          contentType,
          image: content.poster || "",
          poster: content.poster || "",
          timestamp: Date.now(),
          read: false,
        };
      });

      if (Object.keys(userNotifUpdates).length > 0) {
        await update(ref(db), userNotifUpdates);
      }
      toast.success("In-app notification sent to users");
      setReleaseContent(""); setShowSeasonEpisode(false);
      
      // Send FCM push WITH progress (foreground)
      const pushPayload = {
        title: releaseNotifTitle,
        body: releaseNotifMsg,
        image: content.poster || undefined,
        url: contentId ? `/?anime=${contentId}` : "/",
        data: { url: contentId ? `/?anime=${contentId}` : "/", type: "new_episode", contentId },
      };

      setPushSending(true);
      setPushProgress({ phase: "tokens", totalTokens: 0, sent: 0, success: 0, failed: 0, invalidRemoved: 0 });

      try {
        const targetUserIds = Array.from(new Set(
          Object.entries(users)
            .map(([userKey, userData]: any) => String(userData?.id || userKey || "").trim())
            .filter(Boolean)
        ));
        const result = await sendPushToUsers(targetUserIds, pushPayload, (p) => setPushProgress({ ...p }));
        console.log("FCM new release result:", result);
        if ((result?.total || 0) === 0) {
          const reason = result?.reason ? ` [${result.reason}]` : "";
          toast.warning(`Push token পাওয়া যায়নি${reason} — শুধু in-app notification গেছে`);
        } else {
          toast.success(`Push: ${result?.success || 0} delivered, ${result?.failed || 0} failed`);
        }
      } catch (err) {
        console.warn("FCM push failed:", err);
        toast.error("Push delivery failed");
      } finally {
        setTimeout(() => { setPushSending(false); setPushProgress(null); }, 6000);
      }
    } catch (err: any) { toast.error("Error: " + err.message); }
  };

  const toggleReleaseStatus = (id: string, current: boolean) => {
    set(ref(db, `newEpisodeReleases/${id}/active`), !current)
      .then(() => toast.success(!current ? "Activated" : "Deactivated"))
      .catch(() => toast.error("Error updating"));
  };

  const deleteRelease = (id: string) => {
    if (confirm("Delete this release?")) {
      remove(ref(db, `newEpisodeReleases/${id}`))
        .then(() => toast.success("Deleted"))
        .catch(() => toast.error("Error deleting"));
    }
  };

  // ==================== QUICK FETCH ====================
  const quickFetch = async () => {
    if (!quickTmdbId.trim()) { toast.error("Please enter TMDB ID"); return; }
    if (fetchType === "tv") {
      await fetchSeriesDetails(parseInt(quickTmdbId));
      setActiveSection("webseries"); setSeriesTab("ws-add");
    } else {
      await fetchMovieDetails(parseInt(quickTmdbId));
      setActiveSection("movies"); setMoviesTab("mv-add");
    }
  };

  // ==================== EXPORT / REFRESH ====================
  const refreshData = () => {
    toast.info("Data is auto-synced with Firebase!");
    setDropdownOpen(false);
  };

  const exportData = async () => {
    try {
      const [ws, mv, cat, us, rel, not] = await Promise.all([
        get(ref(db, "webseries")), get(ref(db, "movies")), get(ref(db, "categories")),
        get(ref(db, "users")), get(ref(db, "newEpisodeReleases")), get(ref(db, "notifications"))
      ]);
      const data = {
        webseries: ws.val(), movies: mv.val(), categories: cat.val(),
        users: us.val(), newEpisodeReleases: rel.val(), notifications: not.val(),
        exportedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `zk-movie-backup-${Date.now()}.json`; a.click();
      toast.success("Data exported!");
    } catch (err: any) { toast.error("Error: " + err.message); }
    setDropdownOpen(false);
  };

  // Computed stats
  const totalCategories = Object.keys(categoriesData).length;
  const onlineUsers = usersData.filter(u => u.online).length;
  const offlineUsers = usersData.length - onlineUsers;
  const recentContent = [...webseriesData, ...moviesData].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 3);
  const categoryList = Object.entries(categoriesData).map(([id, cat]: any) => ({ id, name: cat.name }));
  const languageOptions = ["English", "Hindi", "Tamil", "Telugu", "Korean", "Japanese", "Spanish", "Multi"];

  // Season/Episode helpers
  const addSeason = (name = "", episodeCount = 1) => {
    setSeasonsData(prev => [...prev, {
      name: name || `Season ${prev.length + 1}`, seasonNumber: prev.length + 1,
      episodes: Array(episodeCount).fill(null).map((_, i) => ({ episodeNumber: i + 1, title: `Episode ${i + 1}`, link: "" }))
    }]);
  };

  const removeSeason = (idx: number) => {
    if (confirm("Remove this season?")) setSeasonsData(prev => prev.filter((_, i) => i !== idx));
  };

  const addEpisode = (sIdx: number) => {
    setSeasonsData(prev => {
      const copy = [...prev];
      const s = { ...copy[sIdx], episodes: [...copy[sIdx].episodes] };
      const num = s.episodes.length + 1;
      s.episodes.push({ episodeNumber: num, title: `Episode ${num}`, link: "", link480: "", link720: "", link1080: "", link4k: "" });
      copy[sIdx] = s;
      return copy;
    });
  };

  const removeEpisode = (sIdx: number, eIdx: number) => {
    if (!confirm("Remove this episode?")) return;
    setSeasonsData(prev => {
      const copy = [...prev];
      const s = { ...copy[sIdx], episodes: copy[sIdx].episodes.filter((_, i) => i !== eIdx) };
      // Re-number episodes
      s.episodes = s.episodes.map((ep, i) => ({ ...ep, episodeNumber: i + 1 }));
      copy[sIdx] = s;
      return copy;
    });
  };

  const updateSeasonName = (sIdx: number, name: string) => {
    setSeasonsData(prev => {
      const copy = [...prev]; copy[sIdx] = { ...copy[sIdx], name }; return copy;
    });
  };

  const updateEpisodeLink = (sIdx: number, eIdx: number, link: string) => {
    setSeasonsData(prev => {
      const copy = [...prev];
      const s = { ...copy[sIdx], episodes: [...copy[sIdx].episodes] };
      s.episodes[eIdx] = { ...s.episodes[eIdx], link };
      copy[sIdx] = s;
      return copy;
    });
  };

  const updateEpisodeQualityLink = (sIdx: number, eIdx: number, quality: string, link: string) => {
    setSeasonsData(prev => {
      const copy = [...prev];
      const s = { ...copy[sIdx], episodes: [...copy[sIdx].episodes] };
      s.episodes[eIdx] = { ...s.episodes[eIdx], [quality]: link };
      copy[sIdx] = s;
      return copy;
    });
  };

  // ==================== AUTH HANDLERS ====================
  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) { toast.error("Enter email and password"); return; }
    setLoginLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      if (!cred.user.email || !adminEmails.includes(cred.user.email.toLowerCase())) {
        await signOut(auth);
        toast.error("Unauthorized admin account");
      } else {
        toast.success("Logged in!");
      }
    } catch (err: any) {
      toast.error("Login failed: " + (err.code === "auth/invalid-credential" ? "Wrong email or password" : err.message));
    }
    setLoginLoading(false);
  };

  const handlePinVerify = () => {
    if (pinInput === savedPin) {
      setIsPinVerified(true);
      toast.success("PIN verified!");
    } else {
      toast.error("Wrong PIN");
    }
    setPinInput("");
  };

  const handleSetPin = () => {
    if (newPinInput.length < 4) { toast.error("PIN must be at least 4 digits"); return; }
    set(ref(db, "admin/pin"), { enabled: true, code: newPinInput })
      .then(() => { toast.success("PIN set!"); setNewPinInput(""); setShowPinSetup(false); });
  };

  const handleDisablePin = () => {
    if (confirm("Disable PIN security?")) {
      set(ref(db, "admin/pin"), { enabled: false, code: "" })
        .then(() => { toast.success("PIN disabled"); setIsPinVerified(true); });
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setIsAuthenticated(false);
    setIsPinVerified(false);
    toast.success("Logged out");
  };

  const buildRouteUrl = (baseUrl: string, targetUrl: string) => {
    const cleanBase = baseUrl.trim();
    if (!cleanBase) return "";
    if (cleanBase.includes("{url}")) {
      return cleanBase.replace("{url}", encodeURIComponent(targetUrl));
    }
    return `${cleanBase}${cleanBase.includes("?") ? "&" : "?"}url=${encodeURIComponent(targetUrl)}`;
  };

  const testRouteEndpoint = async (target: "proxy" | "cdn") => {
    const endpoint = target === "proxy" ? streamProxyUrl.trim() : streamCdnUrl.trim();
    const pingSource = streamPingUrl.trim();

    if (!endpoint) {
      toast.error(target === "proxy" ? "প্রক্সি URL দিন" : "CDN URL দিন");
      return;
    }
    if (!/^https?:\/\//i.test(pingSource)) {
      toast.error("Ping URL অবশ্যই http/https হতে হবে");
      return;
    }

    const testUrl = buildRouteUrl(endpoint, pingSource);
    const startedAt = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    setStreamTesting(target);
    setStreamPingResult({ type: "idle", text: "" });

    try {
      let response: Response | null = null;
      try {
        response = await fetch(testUrl, {
          method: "GET",
          headers: { Range: "bytes=0-1" },
          signal: controller.signal,
        });
      } catch {
        await fetch(testUrl, {
          method: "GET",
          mode: "no-cors",
          signal: controller.signal,
        });
      }

      const elapsed = Math.round(performance.now() - startedAt);
      if (response && !response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const statusText = response
        ? `${target.toUpperCase()} OK (${response.status}) • ${elapsed}ms`
        : `${target.toUpperCase()} Reachable • ${elapsed}ms`;
      setStreamPingResult({ type: "ok", text: statusText });
      toast.success(statusText);
    } catch (err: any) {
      const msg = `${target.toUpperCase()} failed: ${err?.message || "Network error"}`;
      setStreamPingResult({ type: "error", text: msg });
      toast.error(msg);
    } finally {
      clearTimeout(timer);
      setStreamTesting(null);
    }
  };

  // ==================== RENDER HELPERS ====================
  const inputClass = "w-full px-4 py-3 bg-[#1A1A2E] border border-white/10 rounded-xl text-white text-sm focus:border-purple-500 focus:outline-none focus:shadow-[0_0_15px_rgba(157,78,221,0.2)] transition-all placeholder:text-[#957DAD]";
  const selectClass = inputClass + " cursor-pointer";
  const btnPrimary = "bg-gradient-to-r from-purple-600 to-purple-800 text-white font-semibold rounded-xl shadow-[0_4px_15px_rgba(157,78,221,0.3)] hover:shadow-[0_6px_25px_rgba(157,78,221,0.5)] hover:-translate-y-0.5 transition-all cursor-pointer border-none";
  const btnSecondary = "bg-gradient-to-r from-[#1A1A2E] to-[#151521] border border-purple-500/30 text-white rounded-xl hover:border-purple-500 transition-all cursor-pointer";
  const glassCard = "bg-gradient-to-br from-[rgba(26,26,46,0.9)] to-[rgba(21,21,33,0.95)] backdrop-blur-xl border border-purple-500/20 rounded-2xl";
  const appInitial = (uiCfg.appName?.trim()?.charAt(0) || "A").toUpperCase();
  const adminBadgeLabel = (uiCfg.adminTitle?.trim()?.split(/\s+/)?.[0] || uiCfg.appName?.trim()?.split(/\s+/)?.[0] || "APP").toUpperCase();

  const menuItems: { section: Section; icon: React.ReactNode; label: string; group?: string }[] = [
    { section: "dashboard", icon: <LayoutDashboard size={16} />, label: "Dashboard", group: "Main Menu" },
    { section: "categories", icon: <FolderOpen size={16} />, label: "Categories" },
    { section: "webseries", icon: <Film size={16} />, label: "Web Series" },
    { section: "movies", icon: <Video size={16} />, label: "Movies" },
    { section: "users", icon: <Users size={16} />, label: "Users" },
    { section: "comments", icon: <MessageCircle size={16} />, label: "Comments", group: "New Features" },
    { section: "notifications", icon: <Bell size={16} />, label: "Notifications" },
    { section: "new-releases", icon: <Zap size={16} />, label: "New Releases" },
    { section: "add-content", icon: <PlusCircle size={16} />, label: "Add Content", group: "Quick Actions" },
    { section: "tmdb-fetch", icon: <CloudDownload size={16} />, label: "TMDB Fetch" },
    { section: "redeem-codes", icon: <Shield size={16} />, label: "Redeem Codes" },
    { section: "free-access", icon: <Eye size={16} />, label: "Free Access", group: "Tracking" },
    { section: "premium-users", icon: <Shield size={16} />, label: "Premium Users" },
    { section: "analytics", icon: <BarChart3 size={16} />, label: "Analytics & Views" },
    { section: "arolink", icon: <Link size={16} />, label: "Arolink Ads" },
    { section: "ui-control", icon: <Monitor size={16} />, label: "USR & ADM UI", group: "Customization" },
    { section: "fcm-config", icon: <Bell size={16} />, label: "FCM Config" },
    { section: "maintenance", icon: <Power size={16} />, label: "Maintenance", group: "Server" },
    { section: "settings", icon: <Settings size={16} />, label: "Settings" },
  ];

  // ==================== LOGIN SCREEN ====================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0F0F1A] flex items-center justify-center p-4">
        <div className={`${glassCard} p-8 w-full max-w-[400px]`}>
          <div className="text-center mb-8">
            {uiCfg.appLogo ? (
              <img src={uiCfg.appLogo} alt="" className="w-16 h-16 rounded-2xl object-cover mx-auto mb-4 shadow-[0_5px_30px_rgba(157,78,221,0.5)]" />
            ) : (
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-800 rounded-2xl flex items-center justify-center text-3xl font-black mx-auto mb-4 shadow-[0_5px_30px_rgba(157,78,221,0.5)]">{appInitial}</div>
            )}
            <h1 className="text-xl font-bold text-white">{uiCfg.adminTitle || "Admin Login"}</h1>
            <p className="text-sm text-[#957DAD] mt-1">{uiCfg.adminSubtitle || "ICF Control Panel"}</p>
          </div>
          <div className="space-y-4">
            <input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className={inputClass} placeholder="Email" type="email" />
            <input value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className={inputClass} placeholder="Password" type="password"
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
            <button onClick={handleLogin} disabled={loginLoading}
              className={`${btnPrimary} w-full py-3.5 flex items-center justify-center gap-2`}>
              <Lock size={16} />
              {loginLoading ? "Logging in..." : "Login"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== PIN SCREEN ====================
  if (pinEnabled && !isPinVerified) {
    return (
      <div className="min-h-screen bg-[#0F0F1A] flex items-center justify-center p-4">
        <div className={`${glassCard} p-8 w-full max-w-[400px]`}>
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-800 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_5px_30px_rgba(157,78,221,0.5)]">
              <KeyRound size={28} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">Enter PIN</h1>
            <p className="text-sm text-[#957DAD] mt-1">Security verification required</p>
          </div>
          <div className="space-y-4">
            <input value={pinInput} onChange={e => setPinInput(e.target.value)} className={`${inputClass} text-center text-2xl tracking-[10px] font-bold`}
              placeholder="••••" type="password" maxLength={8} onKeyDown={e => e.key === "Enter" && handlePinVerify()} />
            <button onClick={handlePinVerify} className={`${btnPrimary} w-full py-3.5`}>
              Verify PIN
            </button>
            <button onClick={handleLogout} className="w-full text-center text-sm text-[#957DAD] hover:text-red-400 transition-colors">
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F1A] text-white font-['Poppins',sans-serif]">
      {/* Fetching Overlay */}
      {fetchingOverlay && (
        <div className="fixed inset-0 bg-black/95 z-[5000] flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-[#151521] border-t-purple-500 rounded-full animate-spin" />
          <p className="mt-5 text-sm text-[#D1C4E9]">Fetching data from TMDB...</p>
        </div>
      )}

      {/* Push Progress Overlay */}
      {pushSending && pushProgress && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[400px] z-[6000]">
          <div className="bg-gradient-to-br from-[rgba(26,26,46,0.98)] to-[rgba(21,21,33,0.99)] backdrop-blur-xl border border-purple-500/30 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white flex items-center gap-2">
                <Send size={14} className="text-purple-400" />
                Push Notification Delivery
              </span>
              {pushProgress.phase === "done" ? (
                <span className={`text-xs px-2 py-0.5 rounded-full ${pushProgress.totalTokens > 0 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-300"}`}>
                  {pushProgress.totalTokens > 0 ? "Complete" : "No tokens"}
                </span>
              ) : (
                <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full animate-pulse">
                  {pushProgress.phase === "tokens" ? "Fetching tokens..." : pushProgress.phase === "cleanup" ? "Cleanup..." : "Sending..."}
                </span>
              )}
            </div>
            
            {/* Progress bar */}
            <div className="w-full h-2.5 bg-[#1A1A2E] rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  pushProgress.phase === "done" ? "bg-gradient-to-r from-green-500 to-emerald-400" : "bg-gradient-to-r from-purple-600 to-purple-400"
                }`}
                style={{ width: `${pushProgress.phase === "done" ? 100 : pushProgress.phase === "sending" && pushProgress.totalTokens > 0 ? Math.min(100, (pushProgress.sent / pushProgress.totalTokens) * 100) : pushProgress.phase === "tokens" ? 0 : 50}%` }}
              />
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between text-xs text-[#957DAD] gap-2 flex-wrap">
              {typeof pushProgress.totalUsers === "number" && pushProgress.totalUsers > 0 && <span>👥 {pushProgress.totalUsers} users</span>}
              <span>📡 {pushProgress.phase === "done" ? pushProgress.totalTokens : (pushProgress.totalTokens || fcmTokenStats.totalTokens)} tokens</span>
              {pushProgress.phase === "done" && (
                <>
                  <span className="text-green-400">✓ {pushProgress.success} sent</span>
                  {pushProgress.failed > 0 && <span className="text-red-400">✗ {pushProgress.failed} failed</span>}
                  {pushProgress.invalidRemoved > 0 && <span className="text-yellow-400">🗑 {pushProgress.invalidRemoved} removed</span>}
                </>
              )}
              {pushProgress.phase === "sending" && (
                <span className="text-purple-400 animate-pulse">Processing on server...</span>
              )}
              {pushProgress.phase === "tokens" && (
                <span className="text-purple-400 animate-pulse">Loading tokens...</span>
              )}
            </div>

            {pushProgress.phase === "done" && pushProgress.failReasons && pushProgress.failed > 0 && (
              <div className="mt-2 flex items-center gap-3 text-[11px] flex-wrap">
                {pushProgress.failReasons.invalid > 0 && <span className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">Invalid: {pushProgress.failReasons.invalid}</span>}
                {pushProgress.failReasons.transient > 0 && <span className="text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full">Transient: {pushProgress.failReasons.transient}</span>}
                {pushProgress.failReasons.other > 0 && <span className="text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">Other: {pushProgress.failReasons.other}</span>}
              </div>
            )}
            {pushProgress.phase === "done" && (
              <div className={`mt-2 text-xs text-center ${pushProgress.totalTokens > 0 ? "text-green-400/80" : "text-yellow-300"}`}>
                {pushProgress.totalTokens > 0
                  ? `Delivery: ${pushProgress.success} sent${pushProgress.failed > 0 ? `, ${pushProgress.failed} failed` : ""}${pushProgress.invalidRemoved > 0 ? `, ${pushProgress.invalidRemoved} invalid removed` : ""}`
                  : "No active push tokens found"}
              </div>
            )}
          </div>
        </div>
      )}

      {showPinSetup && (
        <div className="fixed inset-0 bg-black/80 z-[5000] flex items-center justify-center p-4" onClick={() => setShowPinSetup(false)}>
          <div className={`${glassCard} p-6 w-full max-w-[350px]`} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <KeyRound size={18} className="text-purple-500" /> {pinEnabled ? "Change PIN" : "Set PIN"}
            </h3>
            <input value={newPinInput} onChange={e => setNewPinInput(e.target.value.replace(/\D/g, ""))}
              className={`${inputClass} text-center text-xl tracking-[8px] font-bold mb-4`}
              placeholder="Enter PIN" type="password" maxLength={8} onKeyDown={e => e.key === "Enter" && handleSetPin()} />
            <div className="flex gap-2">
              <button onClick={() => setShowPinSetup(false)} className={`${btnSecondary} flex-1 py-3 text-sm`}>Cancel</button>
              <button onClick={handleSetPin} className={`${btnPrimary} flex-1 py-3 text-sm`}>Save PIN</button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/70 z-[999] backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <div className={`fixed top-0 ${sidebarOpen ? "left-0" : "-left-[280px]"} w-[280px] h-screen bg-gradient-to-b from-[#151521] to-[#0F0F1A] z-[1000] transition-all duration-300 border-r border-purple-500/20 flex flex-col`}>
        <div className="p-5 border-b border-purple-500/20">
            <div className="flex items-center gap-3">
                  {uiCfg.appLogo ? (
                    <img src={uiCfg.appLogo} alt="" className="w-12 h-12 rounded-[14px] object-cover shadow-[0_5px_20px_rgba(157,78,221,0.4)]" />
                  ) : (
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-800 rounded-[14px] flex items-center justify-center text-2xl font-black shadow-[0_5px_20px_rgba(157,78,221,0.4)]">{appInitial}</div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold"><span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">{uiCfg.adminTitle || "ICF Admin"}</span></h2>
                    <p className="text-[11px] text-[#D1C4E9]">{uiCfg.adminSubtitle || "ICF Control Panel"}</p>
                  </div>
                </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item, i) => (
            <div key={item.section}>
              {item.group && <p className="px-5 py-2 text-[10px] text-[#957DAD] uppercase tracking-[2px] font-semibold">{item.group}</p>}
              <div
                onClick={() => showSection(item.section)}
                className={`px-5 py-3.5 flex items-center gap-3.5 cursor-pointer border-l-[3px] transition-all mx-0 my-0.5 ${
                  activeSection === item.section ? "bg-purple-500/15 border-l-purple-500" : "border-l-transparent hover:bg-purple-500/10"
                }`}
              >
                <span className="text-purple-500">{item.icon}</span>
                <span className="text-sm">{item.label}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-purple-500/20">
          <div className="flex items-center gap-2.5 p-3 bg-black/30 rounded-[10px] mb-2.5">
            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${firebaseConnected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-xs" style={{ color: firebaseConnected ? "#4ade80" : "#D1C4E9" }}>
              Firebase: {firebaseConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-[60px] bg-gradient-to-b from-[rgba(15,15,26,0.98)] to-[rgba(15,15,26,0.9)] z-[100] flex items-center justify-between px-4 border-b border-purple-500/20">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="w-10 h-10 rounded-[10px] bg-white/10 flex items-center justify-center hover:bg-purple-500 transition-all">
            <Menu size={18} />
          </button>
          {uiCfg.appLogo ? (
            <img src={uiCfg.appLogo} alt="" className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <span className="text-2xl font-black text-purple-500" style={{ textShadow: "0 0 20px rgba(157,78,221,0.4)" }}>{appInitial}</span>
          )}
          <h1 className="text-sm font-semibold truncate max-w-[140px]">{sectionTitles[activeSection]}</h1>
        </div>
        <div className="flex items-center gap-2.5 relative">
          <div className="bg-gradient-to-r from-purple-500 to-purple-800 px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5">
            <Shield size={12} />
            <span className="bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent font-extrabold">{adminBadgeLabel}</span>
          </div>
          <button onClick={() => setDropdownOpen(!dropdownOpen)} className="w-10 h-10 rounded-[10px] bg-white/10 flex items-center justify-center hover:bg-purple-500 transition-all">
            <MoreVertical size={16} />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 top-[50px] w-[220px] bg-[#1A1A2E] border border-purple-500/30 rounded-xl overflow-hidden z-[200] shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
              <div onClick={refreshData} className="px-4 py-3.5 flex items-center gap-2.5 text-[13px] hover:bg-purple-500/20 cursor-pointer transition-all">
                <RefreshCw size={14} className="text-purple-500" /> Refresh Data
              </div>
              <div onClick={() => { showSection("add-content"); setDropdownOpen(false); }} className="px-4 py-3.5 flex items-center gap-2.5 text-[13px] hover:bg-purple-500/20 cursor-pointer transition-all">
                <Plus size={14} className="text-purple-500" /> Add Content
              </div>
              <div onClick={exportData} className="px-4 py-3.5 flex items-center gap-2.5 text-[13px] hover:bg-purple-500/20 cursor-pointer transition-all">
                <Download size={14} className="text-purple-500" /> Export Data
              </div>
              <div onClick={() => { setShowPinSetup(true); setDropdownOpen(false); }} className="px-4 py-3.5 flex items-center gap-2.5 text-[13px] hover:bg-purple-500/20 cursor-pointer transition-all">
                <KeyRound size={14} className="text-purple-500" /> {pinEnabled ? "Change PIN" : "Set PIN"}
              </div>
              {pinEnabled && (
                <div onClick={() => { handleDisablePin(); setDropdownOpen(false); }} className="px-4 py-3.5 flex items-center gap-2.5 text-[13px] hover:bg-purple-500/20 cursor-pointer transition-all text-yellow-400">
                  <Lock size={14} className="text-yellow-400" /> Disable PIN
                </div>
              )}
              <div onClick={() => { if (confirm("Clear cache?")) { localStorage.clear(); toast.success("Cache cleared!"); setTimeout(() => window.location.reload(), 1500); } setDropdownOpen(false); }}
                className="px-4 py-3.5 flex items-center gap-2.5 text-[13px] hover:bg-purple-500/20 cursor-pointer transition-all text-red-400">
                <Trash2 size={14} className="text-red-400" /> Clear Cache
              </div>
              <div onClick={() => { handleLogout(); setDropdownOpen(false); }}
                className="px-4 py-3.5 flex items-center gap-2.5 text-[13px] hover:bg-purple-500/20 cursor-pointer transition-all text-red-400 border-t border-purple-500/20">
                <LogOut size={14} className="text-red-400" /> Logout
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-[70px] px-4 pb-[100px] min-h-screen">
        {/* ==================== DASHBOARD ==================== */}
        {activeSection === "dashboard" && (
          <div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { icon: <Film size={18} />, value: webseriesData.length, label: "Web Series" },
                { icon: <Video size={18} />, value: moviesData.length, label: "Movies" },
                { icon: <FolderOpen size={18} />, value: totalCategories, label: "Categories" },
                { icon: <Users size={18} />, value: usersData.length, label: "Total Users" },
              ].map((stat, i) => (
                <div key={i} className="bg-gradient-to-br from-[#1A1A2E] to-[#151521] border border-white/5 rounded-2xl p-[18px] hover:border-purple-500/30 hover:-translate-y-0.5 transition-all">
                  <div className="w-[42px] h-[42px] bg-purple-500/15 rounded-xl flex items-center justify-center mb-3 text-purple-500">{stat.icon}</div>
                  <div className="text-[28px] font-extrabold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">{stat.value}</div>
                  <div className="text-xs text-[#D1C4E9] mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className={`${glassCard} p-4 mb-4`}>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold">User Activity</h3>
              </div>
              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[13px]">Online: <strong>{onlineUsers}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-[13px]">Offline: <strong>{offlineUsers}</strong></span>
                </div>
              </div>
            </div>

            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5">Recent Content</h3>
              {recentContent.length === 0 ? (
                <p className="text-[#957DAD] text-[13px] text-center py-5">No recent content</p>
              ) : (
                recentContent.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 bg-black/20 rounded-[10px] mb-2">
                    <img src={item.poster || ""} className="w-10 h-[55px] rounded-md object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/40x55/1A1A2E/9D4EDD?text=N"; }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{item.title || "Untitled"}</p>
                      <p className="text-[11px] text-[#D1C4E9]">{item.type || (item.seasons ? "Series" : "Movie")} • {item.year || "N/A"}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <button onClick={() => { showSection("webseries"); setSeriesTab("ws-add"); }} className={`${btnPrimary} py-5 px-4 flex flex-col items-center gap-2.5 text-[13px]`}>
                <Plus size={24} /> Add Series
              </button>
              <button onClick={() => { showSection("movies"); setMoviesTab("mv-add"); }} className={`${btnSecondary} py-5 px-4 flex flex-col items-center gap-2.5 text-[13px]`}>
                <Plus size={24} /> Add Movie
              </button>
            </div>
          </div>
        )}

        {/* ==================== CATEGORIES ==================== */}
        {activeSection === "categories" && (
          <div>
            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5">Add New Category</h3>
              <div className="flex gap-2.5">
                <input value={categoryInput} onChange={e => setCategoryInput(e.target.value)} onKeyDown={e => e.key === "Enter" && saveCategory()}
                  className={`${inputClass} flex-1`} placeholder="Category name" />
                <button onClick={saveCategory} className={`${btnPrimary} px-5 py-3.5`}><Plus size={18} /></button>
              </div>
            </div>
            <div className={`${glassCard} p-4`}>
              <h3 className="text-sm font-semibold mb-3.5">All Categories</h3>
              {categoryList.length === 0 ? (
                <p className="text-[#957DAD] text-[13px] text-center py-5">No categories yet</p>
              ) : categoryList.map(cat => (
                <div key={cat.id} className="bg-[#1A1A2E] border border-white/5 rounded-[14px] p-3.5 flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">{cat.name}</span>
                  <div className="flex gap-2">
                    <button onClick={() => editCategory(cat.id, cat.name)} className="bg-blue-500/20 text-blue-400 p-2 rounded-lg"><Edit size={14} /></button>
                    <button onClick={() => deleteCategory(cat.id)} className="bg-pink-500/20 text-pink-500 p-2 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== WEB SERIES ==================== */}
        {activeSection === "webseries" && (
          <div>
            <div className="flex gap-2 overflow-x-auto pb-2.5 mb-4 scrollbar-hide">
              <button onClick={() => setSeriesTab("ws-list")} className={`flex-shrink-0 px-5 py-2.5 rounded-full text-[13px] font-medium transition-all ${seriesTab === "ws-list" ? "bg-gradient-to-r from-purple-500 to-purple-800 text-white shadow-[0_4px_15px_rgba(157,78,221,0.4)]" : "bg-[#151521] border border-white/10 text-[#D1C4E9]"}`}>
                All Series
              </button>
              <button onClick={() => setSeriesTab("ws-add")} className={`flex-shrink-0 px-5 py-2.5 rounded-full text-[13px] font-medium transition-all ${seriesTab === "ws-add" ? "bg-gradient-to-r from-purple-500 to-purple-800 text-white shadow-[0_4px_15px_rgba(157,78,221,0.4)]" : "bg-[#151521] border border-white/10 text-[#D1C4E9]"}`}>
                Add New
              </button>
            </div>

            {seriesTab === "ws-list" && (
              <div>
                {/* Search bar */}
                <div className="mb-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-500" />
                    <input value={wsListSearch} onChange={e => setWsListSearch(e.target.value)}
                      className={`${inputClass} pl-9`} placeholder="Search series..." />
                  </div>
                </div>
                {(() => {
                  const filtered = wsListSearch.trim()
                    ? webseriesData.filter(item => item.title?.toLowerCase().includes(wsListSearch.toLowerCase()))
                    : webseriesData;
                  return filtered.length === 0 ? (
                    <p className="text-[#957DAD] text-[13px] text-center py-8">{wsListSearch.trim() ? "No matching series" : "No web series yet"}</p>
                  ) : filtered.map(item => (
                  <div key={item.id} className="bg-[#1A1A2E] border border-white/5 rounded-[14px] p-3.5 mb-3 hover:border-purple-500/30 transition-all">
                    <div className="flex gap-3.5">
                      <img src={item.poster || ""} className="w-20 h-[115px] rounded-[10px] object-cover flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/80x115/1A1A2E/9D4EDD?text=N"; }} />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold mb-1 truncate">{item.title || "Untitled"}</h4>
                        <p className="text-[11px] text-[#D1C4E9] mb-2">{item.year || "N/A"} • {item.rating || "N/A"}⭐ • {item.language || "N/A"}</p>
                        <p className="text-[11px] text-[#D1C4E9]">{item.seasons?.length || 0} Seasons • {item.category || "Uncategorized"}</p>
                        <div className="flex gap-2 mt-2.5">
                          <button onClick={() => editSeries(item.id)} className={`${btnSecondary} px-3.5 py-2 text-[11px] font-semibold flex items-center gap-1.5`}>
                            <Edit size={12} /> Edit
                          </button>
                          <button onClick={() => deleteSeries(item.id)} className="bg-red-500/20 border border-red-500/30 text-pink-500 px-3.5 py-2 rounded-xl text-[11px] font-semibold flex items-center gap-1.5">
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  ));
                })()}
              </div>
            )}

            {seriesTab === "ws-add" && (
              <div>
                <div className={`${glassCard} p-4 mb-4`}>
                  <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2"><Search size={14} className="text-purple-500" /> Search Web Series</h3>
                  <div className="flex gap-2.5 mb-3.5">
                    <input value={seriesSearch} onChange={e => setSeriesSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchTMDBSeries()}
                      className={`${inputClass} flex-1`} placeholder="Search series name..." />
                    <button onClick={searchTMDBSeries} className={`${btnPrimary} px-4 py-3.5`}><Search size={16} /></button>
                  </div>
                  {seriesResults.length > 0 && (
                    <div>
                      <p className="text-xs text-[#D1C4E9] mb-2.5">Click to fetch details:</p>
                      <div className="grid grid-cols-3 gap-3">
                        {seriesResults.map(item => (
                          <div key={item.id} onClick={() => fetchSeriesDetails(item.id)}
                            className="bg-[#1A1A2E] rounded-xl overflow-hidden cursor-pointer border-2 border-transparent hover:border-purple-500 hover:scale-[1.03] transition-all">
                            <img src={item.poster_path ? TMDB_IMG_BASE + "w342" + item.poster_path : ""} className="w-full aspect-[2/3] object-cover"
                              onError={e => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/200x300/1A1A2E/9D4EDD?text=No+Image"; }} />
                            <div className="p-2.5">
                              <p className="text-[11px] font-semibold leading-tight line-clamp-2">{item.name}</p>
                              <p className="text-[10px] text-purple-500 mt-1 font-semibold">{item.first_air_date?.split("-")[0] || "N/A"}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {seriesForm && (
                  <>
                    {seriesForm.backdrop && (
                      <div className="relative rounded-[14px] overflow-hidden mb-5">
                        <img src={seriesForm.backdrop || seriesForm.poster} className="w-full aspect-video object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4">
                          <div className="text-lg font-bold">{seriesForm.title}</div>
                          <div className="text-xs text-[#D1C4E9] mt-1">{seriesForm.year} • {seriesForm.rating} ⭐</div>
                        </div>
                      </div>
                    )}

                    <div className={`${glassCard} p-4 mb-4`}>
                      <div className="text-base font-semibold mb-4 flex items-center gap-2.5"><span className="text-purple-500">ℹ️</span> Series Details</div>
                      {["title", "logo", "poster", "backdrop", "trailer"].map(field => (
                        <div key={field} className="mb-4">
                          <label className="block text-xs text-[#D1C4E9] mb-2 font-medium capitalize">{field === "logo" ? "Title Logo URL" : field === "trailer" ? "Trailer (YouTube Link)" : field.charAt(0).toUpperCase() + field.slice(1) + " URL"}</label>
                          <input value={seriesForm[field] || ""} onChange={e => setSeriesForm({ ...seriesForm, [field]: e.target.value })}
                            className={inputClass} placeholder={`${field}...`} />
                        </div>
                      ))}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="mb-4">
                          <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Year</label>
                          <input value={seriesForm.year || ""} onChange={e => setSeriesForm({ ...seriesForm, year: e.target.value })} className={inputClass} placeholder="Year" />
                        </div>
                        <div className="mb-4">
                          <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Rating</label>
                          <input value={seriesForm.rating || ""} onChange={e => setSeriesForm({ ...seriesForm, rating: e.target.value })} className={inputClass} placeholder="Rating" />
                        </div>
                      </div>
                      <div className="mb-4">
                        <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Language</label>
                        <select value={seriesForm.language || "English"} onChange={e => setSeriesForm({ ...seriesForm, language: e.target.value })} className={selectClass}>
                          {languageOptions.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="mb-4">
                        <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Category</label>
                        <select value={seriesForm.category || ""} onChange={e => setSeriesForm({ ...seriesForm, category: e.target.value })} className={selectClass}>
                          <option value="">Select Category</option>
                          {categoryList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="mb-4">
                        <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Storyline</label>
                        <textarea value={seriesForm.storyline || ""} onChange={e => setSeriesForm({ ...seriesForm, storyline: e.target.value })}
                          className={`${inputClass} min-h-[100px] resize-y`} placeholder="Storyline" />
                      </div>
                      {seriesCast.length > 0 && (
                        <div className="mb-4">
                          <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Cast (Auto-fetched)</label>
                          <div className="flex gap-3 overflow-x-auto pb-2.5 scrollbar-hide">
                            {seriesCast.map((c, i) => (
                              <div key={i} className="flex-shrink-0 w-[70px] text-center">
                                <img src={c.photo || ""} className="w-[60px] h-[60px] rounded-[10px] object-cover mb-1.5 mx-auto"
                                  onError={e => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/60x60/1A1A2E/9D4EDD?text=N"; }} />
                                <p className="text-[10px] font-medium truncate">{c.name}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={`${glassCard} p-4 mb-4`}>
                      <div className="flex justify-between items-center mb-3.5">
                        <div className="text-base font-semibold flex items-center gap-2.5">📋 Seasons & Episodes</div>
                        <button onClick={() => addSeason()} className={`${btnSecondary} px-3.5 py-2 text-xs`}><Plus size={12} className="mr-1" /> Season</button>
                      </div>
                      {seasonsData.map((season, sIdx) => (
                        <div key={sIdx} className="bg-black/30 rounded-xl p-3.5 mb-3 border border-white/5">
                          <div className="flex items-center gap-2.5 mb-3">
                            <input value={season.name} onChange={e => updateSeasonName(sIdx, e.target.value)} className={`${inputClass} flex-1`} />
                            <button onClick={() => removeSeason(sIdx)} className="bg-red-500/20 text-pink-500 p-2.5 rounded-lg"><Trash2 size={14} /></button>
                          </div>
                          <div className="mb-2.5 flex justify-between items-center">
                            <span className="text-xs text-[#D1C4E9]">Episodes: {season.episodes.length}</span>
                            <button onClick={() => setExpandedSeasons(prev => ({ ...prev, [sIdx]: !prev[sIdx] }))}
                              className={`${btnSecondary} px-3 py-1.5 text-[11px]`}><ChevronDown size={12} className="mr-1" /> Episodes</button>
                          </div>
                          {expandedSeasons[sIdx] && (
                            <div>
                              {season.episodes.map((ep, eIdx) => (
                                <div key={eIdx} className="mb-3 bg-white/[0.03] px-3 py-3 rounded-lg border border-white/5">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-purple-400">Episode {ep.episodeNumber}</span>
                                    <button onClick={() => removeEpisode(sIdx, eIdx)} className="bg-red-500/20 text-pink-500 p-1.5 rounded-lg hover:bg-red-500/40 transition-all">
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-[#D1C4E9] w-12 flex-shrink-0">Default</span>
                                      <input value={ep.link} onChange={e => updateEpisodeLink(sIdx, eIdx, e.target.value)}
                                        className={`${inputClass} flex-1 !py-2 !text-xs`} placeholder="Default/480p link" />
                                    </div>
                                    {["link480", "link720", "link1080", "link4k"].map(q => (
                                      <div key={q} className="flex items-center gap-2">
                                        <span className="text-[10px] text-[#D1C4E9] w-12 flex-shrink-0">
                                          {q === "link480" ? "480p" : q === "link720" ? "720p" : q === "link1080" ? "1080p" : "4K"}
                                        </span>
                                        <input value={(ep as any)[q] || ""} onChange={e => updateEpisodeQualityLink(sIdx, eIdx, q, e.target.value)}
                                          className={`${inputClass} flex-1 !py-2 !text-xs`} placeholder={`${q === "link480" ? "480p" : q === "link720" ? "720p" : q === "link1080" ? "1080p" : "4K"} link (optional)`} />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                              <button onClick={() => addEpisode(sIdx)} className={`${btnSecondary} w-full py-2.5 text-xs mt-2`}><Plus size={12} className="mr-1" /> Add Episode</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <button onClick={saveSeries} className={`${btnPrimary} w-full py-4 text-[15px] font-semibold flex items-center justify-center gap-2`}>
                      <Save size={18} /> Save Web Series
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================== MOVIES ==================== */}
        {activeSection === "movies" && (
          <div>
            <div className="flex gap-2 overflow-x-auto pb-2.5 mb-4 scrollbar-hide">
              <button onClick={() => setMoviesTab("mv-list")} className={`flex-shrink-0 px-5 py-2.5 rounded-full text-[13px] font-medium transition-all ${moviesTab === "mv-list" ? "bg-gradient-to-r from-purple-500 to-purple-800 text-white shadow-[0_4px_15px_rgba(157,78,221,0.4)]" : "bg-[#151521] border border-white/10 text-[#D1C4E9]"}`}>
                All Movies
              </button>
              <button onClick={() => setMoviesTab("mv-add")} className={`flex-shrink-0 px-5 py-2.5 rounded-full text-[13px] font-medium transition-all ${moviesTab === "mv-add" ? "bg-gradient-to-r from-purple-500 to-purple-800 text-white shadow-[0_4px_15px_rgba(157,78,221,0.4)]" : "bg-[#151521] border border-white/10 text-[#D1C4E9]"}`}>
                Add New
              </button>
            </div>

            {moviesTab === "mv-list" && (
              <div>
                {/* Search bar */}
                <div className="mb-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-500" />
                    <input value={mvListSearch} onChange={e => setMvListSearch(e.target.value)}
                      className={`${inputClass} pl-9`} placeholder="Search movies..." />
                  </div>
                </div>
                {(() => {
                  const filtered = mvListSearch.trim()
                    ? moviesData.filter(item => item.title?.toLowerCase().includes(mvListSearch.toLowerCase()))
                    : moviesData;
                  return filtered.length === 0 ? (
                    <p className="text-[#957DAD] text-[13px] text-center py-8">{mvListSearch.trim() ? "No matching movies" : "No movies yet"}</p>
                  ) : filtered.map(item => (
                  <div key={item.id} className="bg-[#1A1A2E] border border-white/5 rounded-[14px] p-3.5 mb-3 hover:border-purple-500/30 transition-all">
                    <div className="flex gap-3.5">
                      <img src={item.poster || ""} className="w-20 h-[115px] rounded-[10px] object-cover flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/80x115/1A1A2E/9D4EDD?text=N"; }} />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold mb-1 truncate">{item.title || "Untitled"}</h4>
                        <p className="text-[11px] text-[#D1C4E9] mb-2">{item.year || "N/A"} • {item.rating || "N/A"}⭐ • {item.language || "N/A"}</p>
                        <p className="text-[11px] text-[#D1C4E9]">{item.category || "Uncategorized"}</p>
                        <div className="flex gap-2 mt-2.5">
                          <button onClick={() => editMovie(item.id)} className={`${btnSecondary} px-3.5 py-2 text-[11px] font-semibold flex items-center gap-1.5`}>
                            <Edit size={12} /> Edit
                          </button>
                          <button onClick={() => deleteMovie(item.id)} className="bg-red-500/20 border border-red-500/30 text-pink-500 px-3.5 py-2 rounded-xl text-[11px] font-semibold flex items-center gap-1.5">
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  ));
                })()}
              </div>
            )}

            {moviesTab === "mv-add" && (
              <div>
                <div className={`${glassCard} p-4 mb-4`}>
                  <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2"><Search size={14} className="text-purple-500" /> Search Movie</h3>
                  <div className="flex gap-2.5 mb-3.5">
                    <input value={movieSearch} onChange={e => setMovieSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchTMDBMovies()}
                      className={`${inputClass} flex-1`} placeholder="Search movie name..." />
                    <button onClick={searchTMDBMovies} className={`${btnPrimary} px-4 py-3.5`}><Search size={16} /></button>
                  </div>
                  {movieResults.length > 0 && (
                    <div>
                      <p className="text-xs text-[#D1C4E9] mb-2.5">Click to fetch details:</p>
                      <div className="grid grid-cols-3 gap-3">
                        {movieResults.map(item => (
                          <div key={item.id} onClick={() => fetchMovieDetails(item.id)}
                            className="bg-[#1A1A2E] rounded-xl overflow-hidden cursor-pointer border-2 border-transparent hover:border-purple-500 hover:scale-[1.03] transition-all">
                            <img src={item.poster_path ? TMDB_IMG_BASE + "w342" + item.poster_path : ""} className="w-full aspect-[2/3] object-cover"
                              onError={e => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/200x300/1A1A2E/9D4EDD?text=No+Image"; }} />
                            <div className="p-2.5">
                              <p className="text-[11px] font-semibold leading-tight line-clamp-2">{item.title}</p>
                              <p className="text-[10px] text-purple-500 mt-1 font-semibold">{item.release_date?.split("-")[0] || "N/A"}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {movieForm && (
                  <>
                    {movieForm.backdrop && (
                      <div className="relative rounded-[14px] overflow-hidden mb-5">
                        <img src={movieForm.backdrop || movieForm.poster} className="w-full aspect-video object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4">
                          <div className="text-lg font-bold">{movieForm.title}</div>
                          <div className="text-xs text-[#D1C4E9] mt-1">{movieForm.year} • {movieForm.rating} ⭐</div>
                        </div>
                      </div>
                    )}

                    <div className={`${glassCard} p-4 mb-4`}>
                      <div className="text-base font-semibold mb-4 flex items-center gap-2.5"><span className="text-purple-500">ℹ️</span> Movie Details</div>
                      {["title", "logo", "poster", "backdrop", "trailer"].map(field => (
                        <div key={field} className="mb-4">
                          <label className="block text-xs text-[#D1C4E9] mb-2 font-medium capitalize">{field === "logo" ? "Title Logo URL" : field === "trailer" ? "Trailer (YouTube Link)" : field.charAt(0).toUpperCase() + field.slice(1) + " URL"}</label>
                          <input value={movieForm[field] || ""} onChange={e => setMovieForm({ ...movieForm, [field]: e.target.value })}
                            className={inputClass} placeholder={`${field}...`} />
                        </div>
                      ))}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="mb-4">
                          <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Year</label>
                          <input value={movieForm.year || ""} onChange={e => setMovieForm({ ...movieForm, year: e.target.value })} className={inputClass} placeholder="Year" />
                        </div>
                        <div className="mb-4">
                          <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Rating</label>
                          <input value={movieForm.rating || ""} onChange={e => setMovieForm({ ...movieForm, rating: e.target.value })} className={inputClass} placeholder="Rating" />
                        </div>
                      </div>
                      <div className="mb-4">
                        <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Language</label>
                        <select value={movieForm.language || "English"} onChange={e => setMovieForm({ ...movieForm, language: e.target.value })} className={selectClass}>
                          {languageOptions.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="mb-4">
                        <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Category</label>
                        <select value={movieForm.category || ""} onChange={e => setMovieForm({ ...movieForm, category: e.target.value })} className={selectClass}>
                          <option value="">Select Category</option>
                          {categoryList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="mb-4">
                        <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Storyline</label>
                        <textarea value={movieForm.storyline || ""} onChange={e => setMovieForm({ ...movieForm, storyline: e.target.value })}
                          className={`${inputClass} min-h-[100px] resize-y`} placeholder="Storyline" />
                      </div>
                      {movieCast.length > 0 && (
                        <div className="mb-4">
                          <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Cast (Auto-fetched)</label>
                          <div className="flex gap-3 overflow-x-auto pb-2.5 scrollbar-hide">
                            {movieCast.map((c, i) => (
                              <div key={i} className="flex-shrink-0 w-[70px] text-center">
                                <img src={c.photo || ""} className="w-[60px] h-[60px] rounded-[10px] object-cover mb-1.5 mx-auto"
                                  onError={e => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/60x60/1A1A2E/9D4EDD?text=N"; }} />
                                <p className="text-[10px] font-medium truncate">{c.name}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mb-4">
                        <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Movie Link (Default) <span className="text-purple-500">*</span></label>
                        <input value={movieForm.movieLink || ""} onChange={e => setMovieForm({ ...movieForm, movieLink: e.target.value })}
                          className={inputClass} placeholder="Movie streaming/embed link" />
                      </div>
                      {/* Quality Links */}
                      <div className="mb-4 space-y-2">
                        <label className="block text-xs text-[#D1C4E9] mb-1 font-medium">Quality Links (Optional)</label>
                        {[
                          { key: "movieLink480", label: "480p" },
                          { key: "movieLink720", label: "720p" },
                          { key: "movieLink1080", label: "1080p" },
                          { key: "movieLink4k", label: "4K" },
                        ].map(q => (
                          <div key={q.key} className="flex items-center gap-2">
                            <span className="text-[10px] text-[#D1C4E9] w-12 flex-shrink-0">{q.label}</span>
                            <input value={movieForm[q.key] || ""} onChange={e => setMovieForm({ ...movieForm, [q.key]: e.target.value })}
                              className={`${inputClass} flex-1 !py-2 !text-xs`} placeholder={`${q.label} link (optional)`} />
                          </div>
                        ))}
                      </div>
                      <div className="mb-4">
                        <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Download Link (Manual)</label>
                        <input value={movieForm.downloadLink || ""} onChange={e => setMovieForm({ ...movieForm, downloadLink: e.target.value })}
                          className={inputClass} placeholder="Download link" />
                      </div>
                    </div>

                    <button onClick={saveMovie} className={`${btnPrimary} w-full py-4 text-[15px] font-semibold flex items-center justify-center gap-2`}>
                      <Save size={18} /> Save Movie
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================== USERS ==================== */}
        {activeSection === "users" && (
          <div>
            {/* Password Lookup */}
            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Search size={14} className="text-purple-500" /> 🔍 User Password Lookup
              </h3>
              <UserPasswordLookup inputClass={inputClass} btnPrimary={btnPrimary} />
            </div>

            <div className={`${glassCard} p-4 mb-4`}>
              <div className="flex justify-between items-center mb-3.5">
                <h3 className="text-sm font-semibold">User Statistics</h3>
                <button onClick={() => toast.info("Users auto-synced!")} className="text-purple-500"><RefreshCw size={16} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-500/10 p-4 rounded-xl border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs text-green-400">Online</span>
                  </div>
                  <div className="text-2xl font-bold">{onlineUsers}</div>
                </div>
                <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="text-xs text-red-400">Offline</span>
                  </div>
                  <div className="text-2xl font-bold">{offlineUsers}</div>
                </div>
              </div>
            </div>
            <div className={`${glassCard} p-4`}>
              <h3 className="text-sm font-semibold mb-3.5">All Users</h3>
              {usersData.length === 0 ? (
                <p className="text-[#957DAD] text-[13px] text-center py-5">No users found</p>
              ) : usersData.map(user => (
                <div key={user.id} className="bg-[#1A1A2E] rounded-xl p-3.5 flex items-center gap-3 mb-2.5 border border-white/5">
                  <div className="w-[45px] h-[45px] rounded-full bg-gradient-to-br from-purple-500 to-purple-800 flex items-center justify-center font-bold text-lg">
                    {(user.name || user.email || "U")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{user.name || "Anonymous"}</p>
                    <p className="text-[11px] text-[#D1C4E9] truncate">{user.email || user.id.substring(0, 20)}...</p>
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full ${user.online ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== NOTIFICATIONS ==================== */}
        {activeSection === "notifications" && (
          <div>
            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Bell size={14} className="text-purple-500" /> Send Notification to Users
              </h3>
              <div className="mb-4">
                <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Notification Title</label>
                <input value={notifTitle} onChange={e => setNotifTitle(e.target.value)} className={inputClass} placeholder="Enter notification title" />
              </div>
              <div className="mb-4">
                <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Notification Message</label>
                <textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)}
                  className={`${inputClass} min-h-[80px] resize-y`} placeholder="Enter notification message" rows={3} />
              </div>
              <div className="mb-4" ref={notifDropdownRef}>
                <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Select Content (Optional)</label>
                <div className="relative">
                  <button type="button" onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                    className={`${selectClass} w-full text-left flex items-center gap-2`}>
                    {notifContent ? (
                      <>
                        <img src={contentOptions.find(o => o.value === notifContent)?.poster} alt="" className="w-7 h-10 rounded object-cover flex-shrink-0" />
                        <span className="truncate text-sm">{contentOptions.find(o => o.value === notifContent)?.label}</span>
                      </>
                    ) : <span className="text-[#957DAD]">No specific content</span>}
                    <ChevronDown size={14} className="ml-auto flex-shrink-0" />
                  </button>
                  {notifDropdownOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1A1A2E] border border-purple-500/40 rounded-xl max-h-[280px] overflow-y-auto shadow-xl">
                      <div className="p-2 cursor-pointer hover:bg-purple-500/20 rounded-lg m-1 text-sm text-[#957DAD]"
                        onClick={() => { setNotifContent(""); setNotifDropdownOpen(false); }}>No specific content</div>
                      {contentOptions.map(o => (
                        <div key={o.value} className={`flex items-center gap-2.5 p-2 cursor-pointer hover:bg-purple-500/20 rounded-lg m-1 ${notifContent === o.value ? "bg-purple-500/30" : ""}`}
                          onClick={() => { setNotifContent(o.value); setNotifDropdownOpen(false); }}>
                          <img src={o.poster} alt="" className="w-8 h-11 rounded object-cover flex-shrink-0 bg-[#2A2A3E]" />
                          <span className="text-sm truncate">{o.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Notification Type</label>
                <select value={notifType} onChange={e => setNotifType(e.target.value)} className={selectClass}>
                  <option value="info">Info</option>
                  <option value="new_episode">New Episode</option>
                  <option value="update">Update</option>
                  <option value="announcement">Announcement</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Send to</label>
                <select value={notifTarget} onChange={e => setNotifTarget(e.target.value)} className={selectClass}>
                  <option value="all">All Users</option>
                  <option value="online">Online Users Only</option>
                </select>
              </div>
              <button onClick={sendNotification} className={`${btnPrimary} w-full py-4 text-[15px] font-semibold flex items-center justify-center gap-2 mt-2.5`}>
                <Send size={18} /> Send Notification
              </button>
            </div>

            <div className={`${glassCard} p-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <RefreshCw size={14} className="text-purple-500" /> Recent Notifications
              </h3>
              {(() => {
                // Deduplicate notifications - group by title+message, show unique ones only
                const seen = new Set<string>();
                const uniqueNotifs = notificationsData.filter(notif => {
                  const key = `${notif.title}||${notif.message}`;
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
                return uniqueNotifs.length === 0 ? (
                  <p className="text-[#957DAD] text-[13px] text-center py-5">No notifications sent yet</p>
                ) : uniqueNotifs.slice(0, 15).map((notif, idx) => (
                  <div key={`notif-${idx}-${notif.timestamp}`} className="bg-[#1A1A2E] border border-purple-500/30 rounded-xl p-4 mb-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="bg-gradient-to-r from-pink-500 to-pink-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-[10px] inline-flex items-center gap-1">
                          <Bell size={10} /> {notif.type}
                        </span>
                        <span className="text-[11px] text-[#957DAD] ml-2.5">{formatTime(notif.timestamp)}</span>
                      </div>
                      <button onClick={() => deleteNotification(notif.title, notif.message, notif.timestamp)} className="text-[#957DAD] hover:text-red-400 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                    <h4 className="text-[13px] font-semibold mb-1.5">{notif.title}</h4>
                    <p className="text-xs text-[#D1C4E9]">{notif.message}</p>
                    {notif.contentId && (
                      <div className="mt-2 text-[11px] text-purple-500 flex items-center gap-1">
                        <Link size={10} /> Linked to content
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* ==================== NEW RELEASES ==================== */}
        {activeSection === "new-releases" && (
          <div>
            <div className={`${glassCard} relative z-[120] overflow-visible p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Zap size={14} className="text-pink-500" /> Manage New Episode Releases
              </h3>
              <div className="mb-4" ref={releaseDropdownRef}>
                <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Select Content to Add as New Release</label>
                <div className="relative z-[130]">
                  <button type="button" onClick={() => setReleaseDropdownOpen(!releaseDropdownOpen)}
                    className={`${selectClass} w-full text-left flex items-center gap-2`}>
                    {releaseContent ? (
                      <>
                        <img src={contentOptions.find(o => o.value === releaseContent)?.poster} alt="" className="w-7 h-10 rounded object-cover flex-shrink-0" />
                        <span className="truncate text-sm">{contentOptions.find(o => o.value === releaseContent)?.label}</span>
                      </>
                    ) : <span className="text-[#957DAD]">Select Content</span>}
                    <ChevronDown size={14} className="ml-auto flex-shrink-0" />
                  </button>
                  {releaseDropdownOpen && (
                    <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-[#1A1A2E] border border-purple-500/40 rounded-xl max-h-[280px] overflow-y-auto shadow-xl">
                      {contentOptions.map(o => (
                        <div key={o.value} className={`flex items-center gap-2.5 p-2 cursor-pointer hover:bg-purple-500/20 rounded-lg m-1 ${releaseContent === o.value ? "bg-purple-500/30" : ""}`}
                          onClick={() => { handleReleaseContentChange(o.value); setReleaseDropdownOpen(false); }}>
                          <img src={o.poster} alt="" className="w-8 h-11 rounded object-cover flex-shrink-0 bg-[#2A2A3E]" />
                          <span className="text-sm truncate">{o.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {showSeasonEpisode && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="mb-4">
                      <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Season</label>
                      <select value={releaseSeason} onChange={e => handleReleaseSeasonChange(e.target.value)} className={selectClass}>
                        <option value="">Select Season</option>
                        {releaseSeasons.map(s => <option key={s.index} value={s.index}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="mb-4">
                      <label className="block text-xs text-[#D1C4E9] mb-2 font-medium">Episode</label>
                      <select value={releaseEpisode} onChange={e => setReleaseEpisode(e.target.value)} className={selectClass}>
                        <option value="">Select Episode</option>
                        {releaseEpisodes.map(ep => <option key={ep.index} value={ep.index}>{ep.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={addNewRelease} className={`${btnPrimary} w-full py-4 text-[15px] font-semibold flex items-center justify-center gap-2 mt-2.5`}>
                    <Plus size={18} /> Add as New Episode Release
                  </button>
                </>
              )}
            </div>

            <div className={`${glassCard} relative z-10 p-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                📋 Active New Releases
              </h3>
              {releasesData.length === 0 ? (
                <p className="text-[#957DAD] text-[13px] text-center py-5">No new releases yet</p>
              ) : releasesData.map(release => {
                let episodeText = "";
                if (release.episodeInfo) {
                  episodeText = release.episodeInfo.type === "movie" ? "Movie" : `${release.episodeInfo.seasonName} - Episode ${release.episodeInfo.episodeNumber}`;
                }
                return (
                  <div key={release.id} className="bg-[#1A1A2E] border border-purple-500/30 rounded-xl p-4 mb-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="bg-gradient-to-r from-pink-500 to-pink-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-[10px] inline-flex items-center gap-1">
                          <Zap size={10} /> NEW
                        </span>
                        <span className="text-[11px] text-[#957DAD] ml-2.5">{formatTime(release.timestamp)}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => toggleReleaseStatus(release.id, release.active)} className={`${release.active ? "text-purple-500" : "text-[#957DAD]"}`}>
                          {release.active ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button onClick={() => deleteRelease(release.id)} className="text-[#957DAD] hover:text-red-400 transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-3 items-center">
                      <img src={release.poster || ""} className="w-[50px] h-[75px] rounded-lg object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/50x75/1A1A2E/9D4EDD?text=N"; }} />
                      <div className="flex-1">
                        <h4 className="text-[13px] font-semibold mb-1">{release.title || "Untitled"}</h4>
                        <p className="text-[11px] text-[#D1C4E9]">{release.year || "N/A"} • {release.rating || "N/A"}★</p>
                        {episodeText && <p className="text-[11px] text-pink-500 mt-0.5">{episodeText}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================== TMDB FETCH ==================== */}
        {activeSection === "tmdb-fetch" && (
          <div>
            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <CloudDownload size={14} className="text-purple-500" /> Quick TMDB Fetch by ID
              </h3>
              <div className="flex gap-2 mb-3.5">
                <button onClick={() => setFetchType("movie")} className={`flex-shrink-0 px-5 py-2.5 rounded-full text-[13px] font-medium transition-all ${fetchType === "movie" ? "bg-gradient-to-r from-purple-500 to-purple-800 text-white" : "bg-[#151521] border border-white/10 text-[#D1C4E9]"}`}>
                  Movie
                </button>
                <button onClick={() => setFetchType("tv")} className={`flex-shrink-0 px-5 py-2.5 rounded-full text-[13px] font-medium transition-all ${fetchType === "tv" ? "bg-gradient-to-r from-purple-500 to-purple-800 text-white" : "bg-[#151521] border border-white/10 text-[#D1C4E9]"}`}>
                  TV Series
                </button>
              </div>
              <div className="flex gap-2.5">
                <input value={quickTmdbId} onChange={e => setQuickTmdbId(e.target.value)} onKeyDown={e => e.key === "Enter" && quickFetch()}
                  className={`${inputClass} flex-1`} placeholder="Enter TMDB ID" />
                <button onClick={quickFetch} className={`${btnPrimary} px-4 py-3.5`}><Download size={16} /></button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== ADD CONTENT ==================== */}
        {activeSection === "add-content" && (
          <div>
            <div className={`${glassCard} p-6 mb-4`}>
              <h3 className="text-base font-semibold text-center mb-6">What would you like to add?</h3>
              <div className="flex flex-col gap-3">
                {[
                  { icon: <Film size={20} />, label: "Web Series", desc: "Add TV shows with seasons & episodes", action: () => { showSection("webseries"); setSeriesTab("ws-add"); } },
                  { icon: <Video size={20} />, label: "Movie", desc: "Add movies with streaming links", action: () => { showSection("movies"); setMoviesTab("mv-add"); } },
                  { icon: <FolderOpen size={20} />, label: "Category", desc: "Manage content categories", action: () => showSection("categories") },
                ].map((item, i) => (
                  <button key={i} onClick={item.action} className={`${btnSecondary} p-5 rounded-[14px] flex items-center gap-4 text-left`}>
                    <div className="w-[50px] h-[50px] bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-500">{item.icon}</div>
                    <div>
                      <div className="text-[15px] font-semibold">{item.label}</div>
                      <div className="text-[11px] text-[#D1C4E9]">{item.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== REDEEM CODES ==================== */}
        {activeSection === "redeem-codes" && (
          <div>
            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Shield size={14} className="text-purple-500" /> Generate Redeem Code
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-[#D1C4E9] mb-1 block">Duration (Days)</label>
                  <input value={newCodeDays} onChange={e => setNewCodeDays(e.target.value)} className={inputClass} placeholder="30" type="number" />
                </div>
                <div>
                  <label className="text-[11px] text-[#D1C4E9] mb-1 block">Note (Optional)</label>
                  <input value={newCodeNote} onChange={e => setNewCodeNote(e.target.value)} className={inputClass} placeholder="e.g. For user XYZ" />
                </div>
                <button onClick={() => {
                  const days = parseInt(newCodeDays) || 30;
                  const code = "ZK-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
                  const codeData = {
                    code,
                    days,
                    note: newCodeNote,
                    used: false,
                    usedBy: null,
                    createdAt: Date.now(),
                  };
                  set(push(ref(db, "redeemCodes")), codeData)
                    .then(() => { toast.success(`Code generated: ${code}`); setNewCodeNote(""); })
                    .catch(err => toast.error("Error: " + err.message));
                }} className={`${btnPrimary} w-full py-3.5 flex items-center justify-center gap-2`}>
                  <PlusCircle size={16} /> Generate Code
                </button>
              </div>
            </div>

            <div className={`${glassCard} p-4`}>
              <h3 className="text-sm font-semibold mb-3.5">All Codes ({redeemCodesData.length})</h3>
              <div className="space-y-2.5">
                {redeemCodesData.length === 0 && <p className="text-center text-[#957DAD] text-sm py-6">No redeem codes yet</p>}
                {redeemCodesData.sort((a, b) => b.createdAt - a.createdAt).map(code => (
                  <div key={code.id} className={`p-3 rounded-xl border transition-all ${code.used ? "bg-red-500/10 border-red-500/30" : "bg-green-500/10 border-green-500/30"}`}>
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="text-sm font-mono font-bold tracking-wider">{code.code}</span>
                      <div className="flex gap-1.5">
                        <button onClick={() => { navigator.clipboard.writeText(code.code); toast.success("Copied!"); }}
                          className="text-[10px] bg-purple-500/20 px-2 py-1 rounded-full hover:bg-purple-500/40 transition-all">Copy</button>
                        <button onClick={() => { if (confirm("Delete this code?")) remove(ref(db, `redeemCodes/${code.id}`)).then(() => toast.success("Deleted")); }}
                          className="text-[10px] bg-red-500/20 px-2 py-1 rounded-full hover:bg-red-500/40 transition-all text-red-400">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                    <div className="text-[10px] text-[#D1C4E9] space-y-0.5">
                      <p>{code.days} days • {code.used ? `Used by ${code.usedBy}` : "Available"}</p>
                      {code.note && <p>Note: {code.note}</p>}
                      <p>{formatTime(code.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== FREE ACCESS USERS ==================== */}
        {activeSection === "free-access" && (
          <div>
            {/* Global Free Access for All */}
            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Zap size={14} className="text-yellow-500" /> Free Access for All Users
              </h3>
              <p className="text-[11px] text-[#D1C4E9] mb-4">
                সব ইউজারকে নির্দিষ্ট সময়ের জন্য ফ্রী এক্সেস দিন। এই সময়ের মধ্যে কোনো অ্যাড গেট থাকবে না।
              </p>

              {/* Current status */}
              {globalFreeAccess?.active && globalFreeAccess?.expiresAt > Date.now() ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-green-400 flex items-center gap-2">
                      <Zap size={14} /> গ্লোবাল ফ্রী এক্সেস অ্যাক্টিভ
                    </span>
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">LIVE</span>
                  </div>
                  <div className="text-[11px] text-[#D1C4E9] space-y-1">
                    <p>শুরু: {new Date(globalFreeAccess.activatedAt).toLocaleString("bn-BD", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    <p>শেষ: {new Date(globalFreeAccess.expiresAt).toLocaleString("bn-BD", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    {(() => {
                      const rem = globalFreeAccess.expiresAt - Date.now();
                      const h = Math.floor(rem / 3600000);
                      const m = Math.floor((rem % 3600000) / 60000);
                      return <p className="text-green-400 font-semibold">বাকি: {h}h {m}m</p>;
                    })()}
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("গ্লোবাল ফ্রী এক্সেস বন্ধ করতে চান?")) {
                        set(ref(db, "globalFreeAccess"), { active: false, expiresAt: 0, activatedAt: 0 })
                          .then(() => toast.success("গ্লোবাল ফ্রী এক্সেস বন্ধ করা হয়েছে"))
                          .catch((err) => toast.error("Error: " + err.message));
                      }
                    }}
                    className={`${btnSecondary} mt-3 w-full py-2.5 text-sm flex items-center justify-center gap-2 text-red-400 border-red-500/30 hover:border-red-500`}
                  >
                    <X size={14} /> ফ্রী এক্সেস বন্ধ করুন
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] text-[#957DAD] mb-1 block">ঘন্টা</label>
                      <input
                        type="number"
                        min="0"
                        max="720"
                        value={globalFreeHours}
                        onChange={(e) => setGlobalFreeHours(e.target.value)}
                        className={inputClass}
                        placeholder="2"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] text-[#957DAD] mb-1 block">মিনিট</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={globalFreeMinutes}
                        onChange={(e) => setGlobalFreeMinutes(e.target.value)}
                        className={inputClass}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const hours = parseInt(globalFreeHours) || 0;
                      const minutes = parseInt(globalFreeMinutes) || 0;
                      const totalMs = (hours * 3600000) + (minutes * 60000);
                      if (totalMs < 60000) {
                        toast.error("কমপক্ষে ১ মিনিট সময় দিন");
                        return;
                      }
                      if (!confirm(`সব ইউজারকে ${hours > 0 ? hours + " ঘন্টা " : ""}${minutes > 0 ? minutes + " মিনিট " : ""}ফ্রী এক্সেস দিতে চান?`)) return;
                      const now = Date.now();
                      set(ref(db, "globalFreeAccess"), {
                        active: true,
                        activatedAt: now,
                        expiresAt: now + totalMs,
                      })
                        .then(() => toast.success("গ্লোবাল ফ্রী এক্সেস চালু হয়েছে!"))
                        .catch((err) => toast.error("Error: " + err.message));
                    }}
                    className={`${btnPrimary} w-full py-3 text-sm flex items-center justify-center gap-2`}
                  >
                    <Zap size={14} /> সব ইউজারকে ফ্রী এক্সেস দিন
                  </button>
                </div>
              )}
            </div>

            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Eye size={14} className="text-green-500" /> Active Free Access Users ({freeAccessUsers.length})
              </h3>
              <p className="text-[11px] text-[#D1C4E9] mb-4">
                যারা ফ্রী এক্সেস নিয়েছে তাদের লিস্ট। এক্সেস শেষ হলে স্বয়ংক্রিয়ভাবে মুছে যাবে।
              </p>
              {freeAccessUsers.length === 0 ? (
                <p className="text-[#957DAD] text-[13px] text-center py-8">কোনো অ্যাক্টিভ ফ্রী এক্সেস ইউজার নেই</p>
              ) : (
                <div className="space-y-2.5">
                  {freeAccessUsers.map((user) => {
                    const remaining = user.expiresAt - Date.now();
                    const hours = Math.floor(remaining / 3600000);
                    const minutes = Math.floor((remaining % 3600000) / 60000);
                    return (
                      <div key={user.id} className="bg-[#1A1A2E] border border-green-500/20 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-[42px] h-[42px] rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center font-bold text-lg flex-shrink-0">
                            {(user.name || "U")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{user.name || "Unknown"}</p>
                            <p className="text-[11px] text-[#D1C4E9] truncate">{user.email || "No email"}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="bg-green-500/15 border border-green-500/30 px-2.5 py-1 rounded-full">
                              <span className="text-[11px] font-bold text-green-400">{hours}h {minutes}m</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2.5 flex justify-between items-center text-[10px] text-[#957DAD]">
                          <span>আনলক: {new Date(user.unlockedAt).toLocaleString("bn-BD", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          <span>শেষ: {new Date(user.expiresAt).toLocaleString("bn-BD", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== PREMIUM USERS ==================== */}
        {activeSection === "premium-users" && (
          <div>
            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Crown size={14} className="text-yellow-500" /> Premium Users ({premiumUsers.length})
              </h3>
              <p className="text-[11px] text-[#D1C4E9] mb-4 break-words">
                যারা প্রিমিয়াম নিয়েছে তাদের লিস্ট। এখান থেকে প্রিমিয়াম বাতিল, এডিট বা লিমিট সেট করতে পারবেন।
              </p>
              {premiumUsers.length === 0 ? (
                <p className="text-[#957DAD] text-[13px] text-center py-8">কোনো প্রিমিয়াম ইউজার নেই</p>
              ) : (
                <div className="space-y-3">
                  {premiumUsers.map((user) => {
                    const prem = user._premiumData || user.premium || {};
                    const expiresAt = prem.expiresAt || 0;
                    const remaining = expiresAt - Date.now();
                    const days = Math.floor(remaining / 86400000);
                    const hours = Math.floor((remaining % 86400000) / 3600000);
                    return (
                      <div key={user.id} className="bg-[#1A1A2E] border border-yellow-500/20 rounded-xl p-4 overflow-hidden">
                        <div className="flex items-center gap-3">
                          <div className="w-[42px] h-[42px] rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
                            {(user.name || "U")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{user.name || "Unknown"}</p>
                            <p className="text-[11px] text-[#D1C4E9] truncate">{user.email || "No email"}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="bg-yellow-500/15 border border-yellow-500/30 px-2.5 py-1 rounded-full">
                              <span className="text-[11px] font-bold text-yellow-400">{days}d {hours}h</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2.5 flex justify-between items-center text-[10px] text-[#957DAD] flex-wrap gap-1">
                          <span className="truncate">শুরু: {new Date(prem.redeemedAt || expiresAt - 30 * 86400000).toLocaleDateString("bn-BD", { day: "numeric", month: "short" })}</span>
                          <span className="truncate">শেষ: {new Date(expiresAt).toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" })}</span>
                        </div>
                        {prem.code && <p className="text-[10px] text-purple-400 mt-1 truncate">Code: {prem.code}</p>}

                        {/* Edit section */}
                        {editingPremium === user.id ? (
                          <div className="mt-3 bg-black/30 rounded-xl p-3 space-y-2.5">
                            <div>
                              <label className="text-[10px] text-[#D1C4E9] mb-1 block">নতুন মেয়াদ (দিন)</label>
                              <input value={editPremiumDays} onChange={e => setEditPremiumDays(e.target.value)}
                                className={`${inputClass} !py-2 !text-xs`} placeholder="30" type="number" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => {
                                const newDays = parseInt(editPremiumDays);
                                if (!newDays || newDays < 1) { toast.error("সঠিক দিন দিন"); return; }
                                const newExpiry = Date.now() + newDays * 86400000;
                                update(ref(db, `users/${user.id}/premium`), { expiresAt: newExpiry, active: true })
                                  .then(() => { toast.success("মেয়াদ আপডেট হয়েছে!"); setEditingPremium(null); })
                                  .catch(err => toast.error("Error: " + err.message));
                              }} className={`${btnPrimary} flex-1 py-2 text-xs`}>সেভ</button>
                              <button onClick={() => setEditingPremium(null)} className={`${btnSecondary} flex-1 py-2 text-xs`}>বাতিল</button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex gap-2">
                            <button onClick={() => { setEditingPremium(user.id); setEditPremiumDays(String(days > 0 ? days : 30)); }}
                              className={`${btnSecondary} flex-1 py-2.5 text-[11px] font-semibold flex items-center justify-center gap-1.5`}>
                              <Edit size={12} /> এডিট
                            </button>
                            <button onClick={() => {
                              if (confirm(`${user.name || user.email} এর প্রিমিয়াম বাতিল করবেন?`)) {
                                set(ref(db, `users/${user.id}/premium`), { active: false, expiresAt: 0 })
                                  .then(() => toast.success("প্রিমিয়াম বাতিল হয়েছে!"))
                                  .catch(err => toast.error("Error: " + err.message));
                              }
                            }} className="bg-red-500/20 border border-red-500/30 text-red-400 flex-1 py-2.5 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5">
                              <Trash2 size={12} /> বাতিল
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== AROLINK ADS ==================== */}
        {activeSection === "arolink" && (
          <div>
            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Link size={14} className="text-green-500" /> Arolink Ads Configuration
              </h3>
              <p className="text-[11px] text-[#D1C4E9] mb-4 break-words">
                Arolink Developer API key দিন এবং ফ্রী এক্সেস এর সময় সেট করুন। ইউজার Arolink লিংকে ক্লিক করলে সেট করা সময় অনুযায়ী এক্সেস পাবে।
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-[#D1C4E9] mb-1 block">Arolink এনাবল/ডিসেবল</label>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setArolinkEnabled(!arolinkEnabled)}
                      className={`w-12 h-6 rounded-full transition-all relative ${arolinkEnabled ? "bg-green-500" : "bg-gray-600"}`}>
                      <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${arolinkEnabled ? "left-6" : "left-0.5"}`} />
                    </button>
                    <span className={`text-xs font-semibold ${arolinkEnabled ? "text-green-400" : "text-red-400"}`}>
                      {arolinkEnabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-[#D1C4E9] mb-1 block">Arolink API Key</label>
                  <input value={arolinkApiKey} onChange={e => setArolinkApiKey(e.target.value)}
                    className={inputClass} placeholder="আপনার Arolink Developer API Key" />
                </div>
                <div>
                  <label className="text-[11px] text-[#D1C4E9] mb-1 block">ফ্রী এক্সেস সময় (ঘন্টা)</label>
                  <input value={arolinkAccessHours} onChange={e => setArolinkAccessHours(e.target.value)}
                    className={inputClass} placeholder="24" type="number" min="1" max="720" />
                  <p className="text-[10px] text-[#957DAD] mt-1">ইউজার লিংকে ক্লিক করলে কত ঘন্টা ফ্রী এক্সেস পাবে (ডিফল্ট: ২৪ ঘন্টা)</p>
                </div>
                <button onClick={() => {
                  set(ref(db, "settings/arolink"), {
                    apiKey: arolinkApiKey.trim(),
                    accessHours: parseInt(arolinkAccessHours) || 24,
                    enabled: arolinkEnabled,
                    updatedAt: Date.now(),
                  }).then(() => toast.success("Arolink কনফিগ সেভ হয়েছে!"))
                    .catch(err => toast.error("Error: " + err.message));
                }} className={`${btnPrimary} w-full py-3.5 flex items-center justify-center gap-2`}>
                  <Save size={16} /> Arolink কনফিগ সেভ করুন
                </button>
              </div>
            </div>
            {arolinkApiKey && (
              <div className={`${glassCard} p-4`}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-green-400">
                  {arolinkEnabled ? "✓ Arolink Active" : "✗ Arolink Disabled"}
                </h3>
                <div className="space-y-2 text-[11px] text-[#D1C4E9]">
                  <p>API Key: <span className="text-purple-400 font-mono">{arolinkApiKey.substring(0, 15)}...</span></p>
                  <p>ফ্রী এক্সেস: <span className="text-yellow-400 font-bold">{arolinkAccessHours} ঘন্টা</span></p>
                  <p>Status: <span className={arolinkEnabled ? "text-green-400" : "text-red-400"}>{arolinkEnabled ? "Enabled" : "Disabled"}</span></p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== UI CONTROL ==================== */}
        {activeSection === "ui-control" && (
          <div>
            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Palette size={14} className="text-pink-500" /> USR & ADM UI Control
              </h3>
              <p className="text-[11px] text-[#D1C4E9] mb-4 break-words">
                ইউজার প্যানেল ও এডমিন প্যানেলের সব টেক্সট, লোগো এখান থেকে পরিবর্তন করুন। প্রতিটি ফিল্ডের পাশে লেখা আছে কোন জায়গায় এটি ব্যবহৃত হয়।
              </p>
              <div className="space-y-4">
                {[
                  { key: "appName", label: "অ্যাপের নাম", desc: "হেডার, লগইন পেজ, টাইটেল", placeholder: "ZK Movie" },
                  { key: "appLogo", label: "অ্যাপ লোগো URL", desc: "হেডার এবং লগইন পেজের লোগো", placeholder: "https://..." },
                  { key: "adminTitle", label: "এডমিন প্যানেল টাইটেল", desc: "এডমিন হেডার এবং সাইডবার", placeholder: "ICF Admin" },
                  { key: "adminSubtitle", label: "এডমিন সাবটাইটেল", desc: "এডমিন লগইন পেজের নিচে", placeholder: "ICF Control Panel" },
                  { key: "loginTitle", label: "ইউজার লগইন টাইটেল", desc: "ইউজার লগইন পেজের টাইটেল", placeholder: "Welcome Back" },
                  { key: "loginSubtitle", label: "ইউজার লগইন সাবটাইটেল", desc: "ইউজার লগইন পেজের সাবটাইটেল", placeholder: "Sign in to continue" },
                  { key: "premiumPrice", label: "প্রিমিয়াম মূল্য", desc: "প্রিমিয়াম পেজে দেখানো দাম", placeholder: "৳100" },
                  { key: "premiumDuration", label: "প্রিমিয়াম সময়কাল টেক্সট", desc: "প্রিমিয়াম পেজে দেখানো সময়", placeholder: "30 Days Ad-Free Experience" },
                  { key: "contactLink", label: "যোগাযোগ লিংক", desc: "Get Redeem Code - Contact Owner বাটনের লিংক", placeholder: "https://t.me/..." },
                  { key: "footerText", label: "ফুটার টেক্সট", desc: "ওয়েবসাইটের নিচে দেখানো টেক্সট", placeholder: "© 2025 ZK Movie" },
                  { key: "heroTitle", label: "হিরো টাইটেল", desc: "হোম পেজের উপরের অংশ", placeholder: "Watch Movies & Series" },
                ].map(item => (
                  <div key={item.key} className="bg-[#1A1A2E] rounded-xl p-3 border border-white/5">
                    <div className="flex items-center gap-2 mb-1">
                      <Type size={12} className="text-purple-400 flex-shrink-0" />
                      <label className="text-xs font-semibold text-white truncate">{item.label}</label>
                    </div>
                    <p className="text-[10px] text-[#957DAD] mb-2 break-words">{item.desc}</p>
                    <div className="flex gap-2">
                      <input
                        value={uiConfigInputs[item.key] || ""}
                        onChange={e => setUiConfigInputs(prev => ({ ...prev, [item.key]: e.target.value }))}
                        className={`${inputClass} flex-1 !py-2 !text-xs`}
                        placeholder={item.placeholder}
                      />
                      <button onClick={() => {
                        set(ref(db, `settings/uiConfig/${item.key}`), uiConfigInputs[item.key]?.trim() || "")
                          .then(() => toast.success(`${item.label} সেভ হয়েছে!`))
                          .catch(err => toast.error("Error: " + err.message));
                      }} className={`${btnPrimary} !px-3 !py-2`}><Save size={12} /></button>
                    </div>
                    {uiConfig[item.key] && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-green-400 truncate flex-1">✓ {uiConfig[item.key]}</span>
                        <button onClick={() => {
                          set(ref(db, `settings/uiConfig/${item.key}`), "")
                            .then(() => { toast.success("রিসেট হয়েছে"); setUiConfigInputs(prev => ({ ...prev, [item.key]: "" })); });
                        }} className="text-red-400 flex-shrink-0"><Trash2 size={10} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== FCM CONFIG ==================== */}
        {activeSection === "fcm-config" && (
          <div>
            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Bell size={14} className="text-blue-500" /> FCM Push Notification Config
              </h3>
              <p className="text-[11px] text-[#D1C4E9] mb-4 break-words">
                Firebase Cloud Messaging (FCM) সেটিংস ম্যানেজ করুন। VAPID Key এবং Send Endpoint এডিট করুন যাতে নোটিফিকেশন ঠিকমতো পৌঁছায়।
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-[#D1C4E9] mb-1 block">VAPID Key</label>
                  <textarea value={fcmVapidKey} onChange={e => setFcmVapidKey(e.target.value)}
                    className={`${inputClass} min-h-[60px] resize-y font-mono text-xs`}
                    placeholder="BJVFgSOS28Yp..." />
                  <p className="text-[10px] text-[#957DAD] mt-1 break-words">Firebase Console → Cloud Messaging → Web Push certificates থেকে পাওয়া যায়</p>
                </div>
                <div>
                  <label className="text-[11px] text-[#D1C4E9] mb-1 block">FCM Send Endpoint URL</label>
                  <input value={fcmSendEndpoint} onChange={e => setFcmSendEndpoint(e.target.value)}
                    className={inputClass}
                    placeholder={DEFAULT_FCM_ENDPOINT || "https://your-project.supabase.co/functions/v1/send-fcm"} />
                  <p className="text-[10px] text-[#957DAD] mt-1 break-words">Use this format: {DEFAULT_FCM_ENDPOINT || "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-fcm"}</p>
                </div>
                <button onClick={() => {
                  set(ref(db, "settings/fcmConfig"), {
                    vapidKey: fcmVapidKey.trim(),
                    sendEndpoint: fcmSendEndpoint.trim(),
                    updatedAt: Date.now(),
                  }).then(() => toast.success("FCM কনফিগ সেভ হয়েছে!"))
                    .catch(err => toast.error("Error: " + err.message));
                }} className={`${btnPrimary} w-full py-3.5 flex items-center justify-center gap-2`}>
                  <Save size={16} /> FCM Config সেভ করুন
                </button>
              </div>
            </div>
            <div className={`${glassCard} p-4`}>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                📊 FCM Token Stats
              </h3>
              <div className="space-y-2 text-[11px] text-[#D1C4E9]">
                <div className="flex justify-between"><span>Total Tokens:</span><span className="text-purple-400 font-bold">{fcmTokenStats.totalTokens}</span></div>
                <div className="flex justify-between"><span>Total Users:</span><span className="text-purple-400 font-bold">{fcmTokenStats.totalUsers}</span></div>
              </div>
            </div>
          </div>
        )}

        {activeSection === "settings" && (
          <div>
            {/* Admin Management */}
            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Shield size={14} className="text-yellow-400" /> Admin Management
              </h3>
              <p className="text-[11px] text-[#D1C4E9] mb-3">
                অ্যাডমিন ইমেইল যোগ বা সরান। ডিফল্ট: {DEFAULT_ADMIN_EMAIL}
              </p>
              <div className="space-y-2 mb-3">
                {adminEmails.map((email, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-white flex-1 truncate">{email}</span>
                    {email !== DEFAULT_ADMIN_EMAIL && (
                      <button
                        onClick={async () => {
                          try {
                            const snap = await get(ref(db, "admin/emails"));
                            const data = snap.val() || {};
                            const keyToRemove = Object.entries(data).find(([, v]) => String(v).toLowerCase() === email.toLowerCase())?.[0];
                            if (keyToRemove) {
                              await remove(ref(db, `admin/emails/${keyToRemove}`));
                              toast.success(`Removed ${email}`);
                            }
                          } catch { toast.error("Failed to remove"); }
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  id="new-admin-email"
                  placeholder="new-admin@gmail.com"
                  className={`${inputClass} flex-1`}
                />
                <button
                  onClick={async () => {
                    const input = (document.getElementById("new-admin-email") as HTMLInputElement);
                    const val = input?.value?.trim().toLowerCase();
                    if (!val || !val.includes("@")) { toast.error("Enter valid email"); return; }
                    if (adminEmails.includes(val)) { toast.error("Already an admin"); return; }
                    try {
                      await push(ref(db, "admin/emails"), val);
                      input.value = "";
                      toast.success(`Added ${val} as admin`);
                    } catch { toast.error("Failed to add"); }
                  }}
                  className={`${btnPrimary} !px-4`}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Link size={14} className="text-purple-400" /> Tutorial Video URL
              </h3>
              <p className="text-[11px] text-[#D1C4E9] mb-4">
                ফ্রি ইউজারদের Unlock বাটনের নিচে "How to open my link" বাটনে এই ভিডিওটি প্লে হবে। ভিডিও URL দিন (MP4 বা embed link)।
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={tutorialLinkInput}
                  onChange={(e) => setTutorialLinkInput(e.target.value)}
                  placeholder="https://example.com/tutorial-video.mp4"
                  className={`${inputClass} flex-1`}
                />
                <button
                  onClick={async () => {
                    if (!tutorialLinkInput.trim()) {
                      toast.error("Please enter a valid URL");
                      return;
                    }
                    try {
                      await set(ref(db, "settings/tutorialLink"), tutorialLinkInput.trim());
                      toast.success("Tutorial video link saved!");
                    } catch (err) {
                      console.error("Save failed:", err);
                      toast.error("Failed to save. Check Firebase rules.");
                    }
                  }}
                  className={`${btnPrimary} !px-4`}
                >
                  <Save size={14} /> Save
                </button>
              </div>
              {tutorialLink && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] text-green-400">✓ Active:</span>
                  <a href={tutorialLink} target="_blank" rel="noopener noreferrer" className="text-[11px] text-purple-400 underline truncate max-w-[250px]">{tutorialLink}</a>
                  <button
                    onClick={() => {
                      set(ref(db, "settings/tutorialLink"), null);
                      setTutorialLinkInput("");
                      toast.success("Tutorial link removed!");
                    }}
                    className="text-red-400 hover:text-red-300 ml-auto"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>

            <div className={`${glassCard} p-4 mb-4`}>
              <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                <Activity size={14} className="text-cyan-400" /> ভিডিও প্রক্সি সার্ভার
              </h3>
              <p className="text-[11px] text-[#D1C4E9] mb-4 break-words">
                HTTP ভিডিও চালাতে Proxy/CDN route কন্ট্রোল করুন। Proxy fail করলে CDN fallback ব্যবহার হবে।
              </p>

              <div className="space-y-3">
                <div className="bg-[#1A1A2E] border border-white/10 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Proxy Route</p>
                      <p className="text-[10px] text-[#957DAD]">ভিডিও edge proxy দিয়ে চালাবে</p>
                    </div>
                    <button
                      onClick={() => setStreamProxyEnabled(!streamProxyEnabled)}
                      className={`w-12 h-6 rounded-full transition-all relative ${streamProxyEnabled ? "bg-green-500" : "bg-gray-600"}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${streamProxyEnabled ? "left-6" : "left-0.5"}`} />
                    </button>
                  </div>
                  <input
                    value={streamProxyUrl}
                    onChange={(e) => setStreamProxyUrl(e.target.value)}
                    className={inputClass}
                    placeholder={DEFAULT_VIDEO_PROXY_ENDPOINT || "https://YOUR_PROJECT_REF.supabase.co/functions/v1/video-proxy"}
                  />
                  <button
                    onClick={() => testRouteEndpoint("proxy")}
                    disabled={streamTesting === "proxy"}
                    className={`${btnSecondary} w-full py-2.5 flex items-center justify-center gap-2 text-xs`}
                  >
                    {streamTesting === "proxy" ? <RefreshCw size={13} className="animate-spin" /> : "🧪"}
                    Proxy টেস্ট
                  </button>
                </div>

                <div className="bg-[#1A1A2E] border border-white/10 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Cloudflare CDN</p>
                      <p className="text-[10px] text-[#957DAD]">Proxy fail হলে backup route</p>
                    </div>
                    <button
                      onClick={() => setStreamCdnEnabled(!streamCdnEnabled)}
                      className={`w-12 h-6 rounded-full transition-all relative ${streamCdnEnabled ? "bg-green-500" : "bg-gray-600"}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${streamCdnEnabled ? "left-6" : "left-0.5"}`} />
                    </button>
                  </div>
                  <input
                    value={streamCdnUrl}
                    onChange={(e) => setStreamCdnUrl(e.target.value)}
                    className={inputClass}
                    placeholder="https://rs-anime-3.rahatsarker224.workers.dev"
                  />
                  <button
                    onClick={() => testRouteEndpoint("cdn")}
                    disabled={streamTesting === "cdn"}
                    className={`${btnSecondary} w-full py-2.5 flex items-center justify-center gap-2 text-xs`}
                  >
                    {streamTesting === "cdn" ? <RefreshCw size={13} className="animate-spin" /> : "🧪"}
                    CDN টেস্ট
                  </button>
                </div>

                <div>
                  <label className="text-[11px] text-[#D1C4E9] mb-1 block">Ping Test URL</label>
                  <input
                    value={streamPingUrl}
                    onChange={(e) => setStreamPingUrl(e.target.value)}
                    className={inputClass}
                    placeholder="http://example.com/video.mp4"
                  />
                </div>

                {streamPingResult.text && (
                  <div className={`text-xs rounded-xl px-3 py-2 border ${streamPingResult.type === "ok" ? "border-green-500/30 text-green-400 bg-green-500/10" : "border-red-500/30 text-red-400 bg-red-500/10"}`}>
                    {streamPingResult.text}
                  </div>
                )}

                <button
                  onClick={async () => {
                    try {
                      await set(ref(db, "settings/streamConfig"), {
                        proxyEnabled: streamProxyEnabled,
                        proxyUrl: streamProxyUrl.trim(),
                        cdnEnabled: streamCdnEnabled,
                        cdnUrl: streamCdnUrl.trim(),
                        pingUrl: streamPingUrl.trim(),
                        updatedAt: Date.now(),
                      });
                      toast.success("Proxy/CDN config saved");
                    } catch (err: any) {
                      toast.error("Error: " + err.message);
                    }
                  }}
                  className={`${btnPrimary} w-full py-3.5 flex items-center justify-center gap-2`}
                >
                  <Save size={16} /> Proxy/CDN সেভ করুন
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== COMMENTS ==================== */}
        {activeSection === "comments" && (
          <AdminCommentsSection
            commentsData={commentsData}
            glassCard={glassCard}
            inputClass={inputClass}
            btnPrimary={btnPrimary}
            webseriesData={webseriesData}
            moviesData={moviesData}
          />
        )}

        {/* ==================== MAINTENANCE ==================== */}
        {activeSection === "maintenance" && (
          <MaintenanceSection
            glassCard={glassCard}
            inputClass={inputClass}
            btnPrimary={btnPrimary}
            maintenanceActive={maintenanceActive}
            currentMaintenance={currentMaintenance}
            maintenanceMessage={maintenanceMessage}
            setMaintenanceMessage={setMaintenanceMessage}
            maintenanceResumeDate={maintenanceResumeDate}
            setMaintenanceResumeDate={setMaintenanceResumeDate}
          />
        )}

        {/* ==================== ANALYTICS ==================== */}
        {activeSection === "analytics" && (() => {
          const today = new Date().toISOString().split("T")[0];
          const todayViewers = dailyActiveUsers[today] ? Object.keys(dailyActiveUsers[today]).length : 0;

          const currentViewersList: { animeId: string; title: string; viewers: { uid: string; userName: string; startedAt: number }[] }[] = [];
          let totalCurrentViewers = 0;
          Object.entries(activeViewers).forEach(([aId, users]: [string, any]) => {
            const viewerArr: { uid: string; userName: string; startedAt: number }[] = [];
            Object.entries(users || {}).forEach(([uid, data]: [string, any]) => {
              viewerArr.push({ uid, userName: data.userName || "User", startedAt: data.startedAt || 0 });
            });
            if (viewerArr.length > 0) {
              const ws = webseriesData.find(w => w.id === aId);
              const mv = moviesData.find(m => m.id === aId);
              const cTitle = ws?.title || mv?.title || aId;
              currentViewersList.push({ animeId: aId, title: cTitle, viewers: viewerArr });
              totalCurrentViewers += viewerArr.length;
            }
          });
          currentViewersList.sort((a, b) => b.viewers.length - a.viewers.length);

          const contentViewStats: { animeId: string; title: string; viewCount: number; poster: string }[] = [];
          Object.entries(analyticsViews).forEach(([aId, dates]: [string, any]) => {
            const todayData = dates?.[today];
            if (todayData) {
              const count = Object.keys(todayData).length;
              const ws = webseriesData.find(w => w.id === aId);
              const mv = moviesData.find(m => m.id === aId);
              contentViewStats.push({ animeId: aId, title: ws?.title || mv?.title || aId, viewCount: count, poster: ws?.poster || mv?.poster || "" });
            }
          });
          contentViewStats.sort((a, b) => b.viewCount - a.viewCount);

          const allTimeStats: { animeId: string; title: string; totalViews: number; poster: string }[] = [];
          Object.entries(analyticsViews).forEach(([aId, dates]: [string, any]) => {
            let total = 0;
            Object.values(dates || {}).forEach((dayUsers: any) => { total += Object.keys(dayUsers || {}).length; });
            if (total > 0) {
              const ws = webseriesData.find(w => w.id === aId);
              const mv = moviesData.find(m => m.id === aId);
              allTimeStats.push({ animeId: aId, title: ws?.title || mv?.title || aId, totalViews: total, poster: ws?.poster || mv?.poster || "" });
            }
          });
          allTimeStats.sort((a, b) => b.totalViews - a.totalViews);

          const last7Days: { date: string; count: number }[] = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split("T")[0];
            const dayUsers = dailyActiveUsers[dateStr];
            last7Days.push({ date: dateStr, count: dayUsers ? Object.keys(dayUsers).length : 0 });
          }
          const maxDayCount = Math.max(...last7Days.map(d => d.count), 1);

          return (
            <div>
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-gradient-to-br from-[#1A1A2E] to-[#151521] border border-green-500/20 rounded-2xl p-4">
                  <div className="w-10 h-10 bg-green-500/15 rounded-xl flex items-center justify-center mb-2 text-green-500">
                    <Activity size={18} />
                  </div>
                  <div className="text-2xl font-extrabold text-green-400">{totalCurrentViewers}</div>
                  <div className="text-[10px] text-[#D1C4E9] mt-1">Watching Now</div>
                </div>
                <div className="bg-gradient-to-br from-[#1A1A2E] to-[#151521] border border-purple-500/20 rounded-2xl p-4">
                  <div className="w-10 h-10 bg-purple-500/15 rounded-xl flex items-center justify-center mb-2 text-purple-500">
                    <Eye size={18} />
                  </div>
                  <div className="text-2xl font-extrabold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">{todayViewers}</div>
                  <div className="text-[10px] text-[#D1C4E9] mt-1">Today's Viewers</div>
                </div>
                <div className="bg-gradient-to-br from-[#1A1A2E] to-[#151521] border border-blue-500/20 rounded-2xl p-4">
                  <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center mb-2 text-blue-500">
                    <TrendingUp size={18} />
                  </div>
                  <div className="text-2xl font-extrabold text-blue-400">{contentViewStats.length}</div>
                  <div className="text-[10px] text-[#D1C4E9] mt-1">Active Content</div>
                </div>
              </div>

              {/* Currently Watching - Live */}
              <div className={`${glassCard} p-4 mb-4`}>
                <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                  <Activity size={14} className="text-green-500 animate-pulse" /> Currently Watching (Live)
                </h3>
                {currentViewersList.length === 0 ? (
                  <p className="text-[#957DAD] text-[13px] text-center py-5">No one watching right now</p>
                ) : (
                  <div className="space-y-3">
                    {currentViewersList.map(item => (
                      <div key={item.animeId} className="bg-[#1A1A2E] border border-green-500/20 rounded-xl p-3.5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[13px] font-semibold truncate flex-1">{item.title}</span>
                          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold ml-2 flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            {item.viewers.length}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {item.viewers.map(v => (
                            <span key={v.uid} className="text-[10px] bg-green-500/10 text-green-300 px-2 py-1 rounded-lg">
                              👤 {v.userName} ({formatTime(v.startedAt)})
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 7-Day Trend Chart */}
              <div className={`${glassCard} p-4 mb-4`}>
                <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                  <TrendingUp size={14} className="text-blue-500" /> Last 7 Days - Daily Viewers
                </h3>
                <div className="flex items-end gap-2 h-[120px]">
                  {last7Days.map((day) => (
                    <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full">
                      <span className="text-[10px] text-purple-400 font-bold mb-1">{day.count}</span>
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-purple-600 to-purple-400 transition-all duration-500"
                        style={{ height: `${Math.max((day.count / maxDayCount) * 90, 4)}px` }}
                      />
                      <span className="text-[9px] text-[#957DAD] mt-1.5">
                        {new Date(day.date).toLocaleDateString("en", { weekday: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Today's Top Content */}
              <div className={`${glassCard} p-4 mb-4`}>
                <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                  <BarChart3 size={14} className="text-purple-500" /> Today's Views by Content
                </h3>
                {contentViewStats.length === 0 ? (
                  <p className="text-[#957DAD] text-[13px] text-center py-5">No views today yet</p>
                ) : (
                  <div className="space-y-2.5">
                    {contentViewStats.slice(0, 20).map((item, idx) => (
                      <div key={item.animeId} className="flex items-center gap-3 bg-[#1A1A2E] rounded-xl p-3 border border-white/5">
                        <span className="text-[11px] text-[#957DAD] font-bold w-5">#{idx + 1}</span>
                        {item.poster && (
                          <img src={item.poster} className="w-9 h-[52px] rounded-lg object-cover flex-shrink-0"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold truncate">{item.title}</p>
                          <div className="w-full h-1.5 bg-[#0F0F1A] rounded-full mt-1.5 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-purple-600 to-pink-500 transition-all"
                              style={{ width: `${Math.min(100, (item.viewCount / (contentViewStats[0]?.viewCount || 1)) * 100)}%` }} />
                          </div>
                        </div>
                        <span className="text-sm font-bold text-purple-400 flex-shrink-0">{item.viewCount}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* All-Time Top Content */}
              <div className={`${glassCard} p-4 mb-4`}>
                <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                  <TrendingUp size={14} className="text-pink-500" /> All-Time Most Watched
                </h3>
                {allTimeStats.length === 0 ? (
                  <p className="text-[#957DAD] text-[13px] text-center py-5">No data yet</p>
                ) : (
                  <div className="space-y-2.5">
                    {allTimeStats.slice(0, 15).map((item, idx) => (
                      <div key={item.animeId} className="flex items-center gap-3 bg-[#1A1A2E] rounded-xl p-3 border border-white/5">
                        <span className={`text-[11px] font-bold w-5 ${idx === 0 ? "text-yellow-400" : idx === 1 ? "text-gray-300" : idx === 2 ? "text-orange-400" : "text-[#957DAD]"}`}>
                          #{idx + 1}
                        </span>
                        {item.poster && (
                          <img src={item.poster} className="w-9 h-[52px] rounded-lg object-cover flex-shrink-0"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold truncate">{item.title}</p>
                        </div>
                        <span className="text-sm font-bold text-pink-400 flex-shrink-0">{item.totalViews} views</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Today's Active Users */}
              <div className={`${glassCard} p-4 mb-4`}>
                <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                  <Users size={14} className="text-purple-500" /> Today's Active Users ({todayViewers})
                </h3>
                {!dailyActiveUsers[today] ? (
                  <p className="text-[#957DAD] text-[13px] text-center py-5">No active users today</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(dailyActiveUsers[today]).map(([uid, data]: [string, any]) => (
                      <span key={uid} className="text-[11px] bg-purple-500/10 text-purple-300 px-3 py-1.5 rounded-full border border-purple-500/20">
                        👤 {data.userName || uid.substring(0, 8)} • {formatTime(data.lastSeen)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Full Content Library - All Anime with Views */}
              <div className={`${glassCard} p-4`}>
                <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
                  <Film size={14} className="text-purple-500" /> Full Content Library Views ({webseriesData.length + moviesData.length} items)
                </h3>
                <div className="space-y-2">
                  {(() => {
                    // Build full list of ALL content with their view counts
                    const fullList = [
                      ...webseriesData.map(ws => {
                        let todayViews = 0;
                        let totalViews = 0;
                        const viewData = analyticsViews[ws.id];
                        if (viewData) {
                          if (viewData[today]) todayViews = Object.keys(viewData[today]).length;
                          Object.values(viewData).forEach((dayUsers: any) => { totalViews += Object.keys(dayUsers || {}).length; });
                        }
                        return { id: ws.id, title: ws.title || "Untitled", poster: ws.poster || "", type: "Series", todayViews, totalViews };
                      }),
                      ...moviesData.map(mv => {
                        let todayViews = 0;
                        let totalViews = 0;
                        const viewData = analyticsViews[mv.id];
                        if (viewData) {
                          if (viewData[today]) todayViews = Object.keys(viewData[today]).length;
                          Object.values(viewData).forEach((dayUsers: any) => { totalViews += Object.keys(dayUsers || {}).length; });
                        }
                        return { id: mv.id, title: mv.title || "Untitled", poster: mv.poster || "", type: "Movie", todayViews, totalViews };
                      }),
                    ];
                    fullList.sort((a, b) => b.totalViews - a.totalViews || b.todayViews - a.todayViews);
                    const maxTotal = fullList[0]?.totalViews || 1;

                    return fullList.map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-3 bg-[#1A1A2E] rounded-xl p-3 border border-white/5">
                        <span className={`text-[11px] font-bold w-5 flex-shrink-0 ${idx === 0 ? "text-yellow-400" : idx === 1 ? "text-gray-300" : idx === 2 ? "text-orange-400" : "text-[#957DAD]"}`}>
                          {idx + 1}
                        </span>
                        <img src={item.poster} className="w-8 h-[46px] rounded-lg object-cover flex-shrink-0 bg-[#0F0F1A]"
                          onError={e => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/32x46/1A1A2E/9D4EDD?text=N"; }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-[11px] font-semibold truncate">{item.title}</p>
                            <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded flex-shrink-0">{item.type}</span>
                          </div>
                          <div className="w-full h-1 bg-[#0F0F1A] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-purple-600 to-pink-500 transition-all"
                              style={{ width: `${item.totalViews > 0 ? Math.max(3, (item.totalViews / maxTotal) * 100) : 0}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className="text-[11px] font-bold text-purple-400">{item.totalViews}</span>
                          <span className="text-[9px] text-green-400">{item.todayViews > 0 ? `+${item.todayViews} today` : "—"}</span>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          );
        })()}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-[65px] bg-gradient-to-t from-[rgba(15,15,26,0.98)] to-[rgba(15,15,26,0.95)] border-t border-purple-500/20 flex items-center justify-around z-[100] px-2.5">
        {[
          { section: "dashboard" as Section, icon: <LayoutDashboard size={20} />, label: "Dashboard" },
          { section: "webseries" as Section, icon: <Film size={20} />, label: "Series" },
          { section: "movies" as Section, icon: <Video size={20} />, label: "Movies" },
          { section: "notifications" as Section, icon: <Bell size={20} />, label: "Notify" },
        ].map(item => (
          <div key={item.section} onClick={() => showSection(item.section)}
            className={`flex flex-col items-center gap-1 py-2 px-4 cursor-pointer relative transition-all ${
              activeSection === item.section ? "text-purple-500" : "text-[#957DAD]"
            }`}>
            {activeSection === item.section && <div className="absolute -top-px left-1/2 -translate-x-1/2 w-[30px] h-[3px] bg-gradient-to-r from-purple-500 to-purple-800 rounded-b" />}
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </div>
        ))}
      </nav>
    </div>
  );
};

// Maintenance Section sub-component
const MaintenanceSection = ({
  glassCard, inputClass, btnPrimary, maintenanceActive, currentMaintenance,
  maintenanceMessage, setMaintenanceMessage, maintenanceResumeDate, setMaintenanceResumeDate,
}: {
  glassCard: string; inputClass: string; btnPrimary: string; maintenanceActive: boolean;
  currentMaintenance: any; maintenanceMessage: string; setMaintenanceMessage: (v: string) => void;
  maintenanceResumeDate: string; setMaintenanceResumeDate: (v: string) => void;
}) => {
  const [countdown, setCountdown] = useState("");
  const [hasCountdown, setHasCountdown] = useState(false);

  useEffect(() => {
    if (!currentMaintenance?.active || !currentMaintenance?.resumeDate) {
      setHasCountdown(false);
      setCountdown("");
      return;
    }

    const updateCountdown = () => {
      const resumeTime = new Date(currentMaintenance.resumeDate).getTime() + 86400000; // end of that day
      const diff = resumeTime - Date.now();
      if (diff <= 0) {
        // Auto turn on server - extend timers first
        const duration = currentMaintenance?.startedAt ? Date.now() - currentMaintenance.startedAt : 0;
        if (duration > 0) extendAllUserTimers(duration);
        update(ref(db, "maintenance"), { active: false, resumeDate: null })
          .then(() => toast.success("Server auto-started! ✅"))
          .catch(() => {});
        setHasCountdown(false);
        setCountdown("");
        return;
      }
      setHasCountdown(true);
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setCountdown(`${d}d ${h.toString().padStart(2, "0")}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`);
      else setCountdown(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [currentMaintenance]);

  const handleShutdown = () => {
    if (!maintenanceMessage.trim()) { toast.error("Please enter a message"); return; }
    if (confirm("Shut down the server? All users will be blocked!")) {
      update(ref(db, "maintenance"), {
        active: true,
        message: maintenanceMessage,
        resumeDate: maintenanceResumeDate || null,
        startedAt: Date.now(),
      }).then(() => toast.success("Server shut down!"))
        .catch(err => toast.error("Error: " + err.message));
    }
  };

  const extendAllUserTimers = async (duration: number) => {
    try {
      // Extend premium users' expiresAt
      const usersSnap = await get(ref(db, "users"));
      if (usersSnap.exists()) {
        const allUsers = usersSnap.val();
        const updates: Record<string, any> = {};
        Object.entries(allUsers).forEach(([uid, userData]: [string, any]) => {
          if (userData?.premium?.active && userData?.premium?.expiresAt) {
            updates[`users/${uid}/premium/expiresAt`] = userData.premium.expiresAt + duration;
          }
        });
        if (Object.keys(updates).length > 0) {
          await update(ref(db), updates);
          toast.success(`Extended ${Object.keys(updates).length} premium user(s) timers!`);
        }
      }
      // Store last maintenance info for client-side free access adjustment
      await update(ref(db, "maintenance"), {
        lastPauseDuration: duration,
        lastResumedAt: Date.now(),
      });
    } catch (err: any) {
      toast.error("Error extending timers: " + err.message);
    }
  };

  const handleStartNow = async () => {
    if (confirm("Start the server immediately?")) {
      const duration = currentMaintenance?.startedAt ? Date.now() - currentMaintenance.startedAt : 0;
      if (duration > 0) await extendAllUserTimers(duration);
      update(ref(db, "maintenance"), { active: false, resumeDate: null })
        .then(() => { toast.success("Server is online! ✅"); setMaintenanceResumeDate(""); })
        .catch(err => toast.error("Error: " + err.message));
    }
  };

  return (
    <div>
      <div className={`${glassCard} p-4 mb-4`}>
        <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
          <Power size={14} className={maintenanceActive ? "text-red-500" : "text-green-500"} />
          Server Status: {maintenanceActive ? "🔴 Offline (Maintenance)" : "🟢 Online"}
        </h3>

        {currentMaintenance?.active && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
            <p className="text-sm text-red-400 font-medium mb-1">Server is currently offline</p>
            <p className="text-xs text-[#D1C4E9]">{currentMaintenance.message}</p>
            {currentMaintenance.resumeDate && (
              <p className="text-xs text-yellow-400 mt-1">
                Resume Date: {new Date(currentMaintenance.resumeDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            )}

            {/* Countdown Timer */}
            {hasCountdown && countdown && (
              <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-center">
                <p className="text-[10px] text-yellow-400 uppercase tracking-wider mb-1">Auto-start in</p>
                <p className="text-2xl font-bold font-mono text-yellow-300 tracking-wider">{countdown}</p>
              </div>
            )}

            {/* Start Server Now Button */}
            <button onClick={handleStartNow}
              className="w-full mt-3 py-3 bg-gradient-to-r from-green-600 to-green-800 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(34,197,94,0.3)] hover:shadow-[0_6px_25px_rgba(34,197,94,0.5)] transition-all">
              <Power size={16} /> Start Server Now
            </button>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-[#D1C4E9] mb-1 block">Maintenance Message</label>
            <textarea value={maintenanceMessage} onChange={e => setMaintenanceMessage(e.target.value)}
              className={`${inputClass} min-h-[80px] resize-none`}
              placeholder="Write a message for users..." />
          </div>
          <div>
            <label className="text-[11px] text-[#D1C4E9] mb-1 block">Resume Date</label>
            <input type="date" value={maintenanceResumeDate} onChange={e => setMaintenanceResumeDate(e.target.value)}
              className={inputClass} />
          </div>

          {!maintenanceActive ? (
            <button onClick={handleShutdown}
              className="w-full py-3.5 bg-gradient-to-r from-red-600 to-red-800 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(239,68,68,0.3)] hover:shadow-[0_6px_25px_rgba(239,68,68,0.5)] transition-all">
              <AlertTriangle size={16} /> Shut Down Server
            </button>
          ) : (
            <button onClick={handleStartNow}
              className={`${btnPrimary} w-full py-3.5 flex items-center justify-center gap-2`}>
              <Power size={16} /> Start Server
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// User Password Lookup sub-component
const UserPasswordLookup = ({ inputClass, btnPrimary }: { inputClass: string; btnPrimary: string }) => {
  const [searchInput, setSearchInput] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const lookupUser = async () => {
    if (!searchInput.trim()) { toast.error("Enter user email or username"); return; }
    setSearching(true);
    setSearchResult(null);
    setShowPassword(false);
    try {
      const input = searchInput.trim().toLowerCase();
      const commaKey = input.replace(/\./g, ",").replace(/[^a-z0-9@,_-]/g, "_");
      const legacyKey = input.replace(/[^a-z0-9]/g, "_");

      // Search by key
      for (const key of [commaKey, legacyKey]) {
        const snap = await get(ref(db, `appUsers/${key}`));
        if (snap.exists()) {
          setSearchResult({ ...snap.val(), _key: key });
          setSearching(false);
          return;
        }
      }

      // Search by name/email fields
      const allSnap = await get(ref(db, "appUsers"));
      if (allSnap.exists()) {
        const allData = allSnap.val();
        for (const key of Object.keys(allData)) {
          const u = allData[key];
          if (u && typeof u === 'object') {
            const nameMatch = u.name && u.name.toLowerCase() === input;
            const emailMatch = u.email && u.email.toLowerCase() === input;
            if (nameMatch || emailMatch) {
              setSearchResult({ ...u, _key: key });
              setSearching(false);
              return;
            }
          }
        }
      }

      toast.error("User not found!");
    } catch (err: any) { toast.error("Error: " + err.message); }
    setSearching(false);
  };

  return (
    <div>
      <div className="flex gap-2.5 mb-3">
        <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && lookupUser()}
          className={`${inputClass} flex-1`} placeholder="Enter email or username" />
        <button onClick={lookupUser} disabled={searching}
          className={`${btnPrimary} px-4 py-3 flex items-center gap-1.5`}>
          {searching ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
        </button>
      </div>
      {searchResult && (
        <div className="bg-[#1A1A2E] border border-purple-500/30 rounded-xl p-4 mt-3">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-[11px] text-[#957DAD]">Name:</span>
              <span className="text-[13px] font-medium">{searchResult.name || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[11px] text-[#957DAD]">Email:</span>
              <span className="text-[13px] font-medium">{searchResult.email || "N/A"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-[#957DAD]">Password:</span>
              {searchResult.password ? (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-mono font-bold text-green-400">
                    {showPassword ? searchResult.password : "••••••••"}
                  </span>
                  <button onClick={() => setShowPassword(!showPassword)}
                    className="text-purple-500 hover:text-purple-400 transition-colors">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(searchResult.password); toast.success("Copied!"); }}
                    className="text-[10px] bg-purple-500/20 px-2 py-1 rounded-full hover:bg-purple-500/40 transition-all">Copy</button>
                </div>
              ) : (
                <span className="text-[13px] text-yellow-400">
                  {searchResult.googleAuth ? "Google Login (No password)" : "Password not set"}
                </span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-[11px] text-[#957DAD]">ID:</span>
              <span className="text-[11px] font-mono text-[#D1C4E9]">{searchResult.id || searchResult._key}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Admin Comments Section sub-component
const AdminCommentsSection = ({
  commentsData, glassCard, inputClass, btnPrimary, webseriesData, moviesData,
}: {
  commentsData: any[]; glassCard: string; inputClass: string; btnPrimary: string;
  webseriesData: any[]; moviesData: any[];
}) => {
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const getContentTitle = (animeId: string) => {
    const ws = webseriesData.find(s => s.id === animeId);
    if (ws) return ws.title;
    const mv = moviesData.find(m => m.id === animeId);
    if (mv) return mv.title;
    return animeId;
  };

  const formatTime = (ts: number) => {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const postAdminReply = async (animeId: string, commentId: string) => {
    if (!replyText.trim()) return;

    const text = replyText.trim();
    const targetComment = commentsData.find((c) => c.animeId === animeId && c.id === commentId);

    try {
      const now = Date.now();
      const replyRef = push(ref(db, `comments/${animeId}/${commentId}/replies`));
      await set(replyRef, {
        userId: "admin",
        userName: "Admin (ZK)",
        text,
        timestamp: now,
      });

      if (targetComment?.userId && targetComment.userId !== "admin") {
        const title = "Admin replied to your comment";
        const message = `Admin replied on ${getContentTitle(animeId)}`;

        await set(push(ref(db, `notifications/${targetComment.userId}`)), {
          title,
          message,
          type: "admin_reply",
          contentId: animeId,
          image: targetComment.poster || "",
          poster: targetComment.poster || "",
          timestamp: now,
          read: false,
        });

        sendPushToUsers([targetComment.userId], {
          title,
          body: message,
          image: targetComment.poster || undefined,
          url: `/?anime=${animeId}`,
          data: { type: "admin_reply", animeId, commentId },
        }).catch((err) => console.warn("Admin reply push failed:", err));
      }

      setReplyText("");
      setReplyingTo(null);
      toast.success("Reply posted!");
    } catch {
      toast.error("Error posting reply");
    }
  };

  const deleteComment = (animeId: string, commentId: string) => {
    if (confirm("Delete this comment?")) {
      remove(ref(db, `comments/${animeId}/${commentId}`))
        .then(() => toast.success("Comment deleted"))
        .catch(() => toast.error("Error deleting"));
    }
  };

  const deleteReply = (animeId: string, commentId: string, replyId: string) => {
    if (confirm("Delete this reply?")) {
      remove(ref(db, `comments/${animeId}/${commentId}/replies/${replyId}`))
        .then(() => toast.success("Reply deleted"))
        .catch(() => toast.error("Error deleting"));
    }
  };

  const filteredComments = filter
    ? commentsData.filter(c => getContentTitle(c.animeId).toLowerCase().includes(filter.toLowerCase()) || c.userName?.toLowerCase().includes(filter.toLowerCase()) || c.text?.toLowerCase().includes(filter.toLowerCase()))
    : commentsData;

  return (
    <div>
      <div className={`${glassCard} p-4 mb-4`}>
        <h3 className="text-sm font-semibold mb-3.5 flex items-center gap-2">
          <MessageCircle size={14} className="text-purple-500" /> All Comments ({commentsData.length})
        </h3>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className={`${inputClass} mb-4`}
          placeholder="🔍 Search comments by content, user, or text..."
        />
        {filteredComments.length === 0 ? (
          <p className="text-[#957DAD] text-[13px] text-center py-8">No comments found</p>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {filteredComments.slice(0, 50).map((comment) => (
              <div key={comment.id} className="bg-[#1A1A2E] border border-white/5 rounded-xl p-3.5">
                {/* Content label */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-medium truncate max-w-[200px]">
                    📺 {getContentTitle(comment.animeId)}
                  </span>
                  <span className="text-[10px] text-[#957DAD]">{formatTime(comment.timestamp)}</span>
                </div>
                {/* Comment */}
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-semibold text-purple-400">{comment.userName}</span>
                    <p className="text-[12px] text-[#D1C4E9] mt-0.5 break-words">{comment.text}</p>
                  </div>
                  <button onClick={() => deleteComment(comment.animeId, comment.id)}
                    className="text-[#957DAD] hover:text-red-400 transition-colors flex-shrink-0 ml-2">
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Replies */}
                {comment.replies?.length > 0 && (
                  <div className="ml-4 mt-2 border-l-2 border-purple-500/20 pl-3 space-y-1.5">
                    {comment.replies.map((r: any) => (
                      <div key={r.id} className="bg-black/20 rounded-lg p-2 flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <span className={`text-[11px] font-semibold ${r.userId === "admin" ? "text-green-400" : "text-[#957DAD]"}`}>
                            {r.userName} {r.userId === "admin" && "✓"}
                          </span>
                          <p className="text-[11px] text-[#D1C4E9] break-words">{r.text}</p>
                          <span className="text-[9px] text-[#957DAD]">{formatTime(r.timestamp)}</span>
                        </div>
                        <button onClick={() => deleteReply(comment.animeId, comment.id, r.id)}
                          className="text-[#957DAD] hover:text-red-400 transition-colors flex-shrink-0 ml-2">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply input */}
                <div className="mt-2 flex gap-2">
                  {replyingTo === comment.id ? (
                    <div className="flex gap-2 w-full items-end">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postAdminReply(comment.animeId, comment.id); } }}
                        placeholder="Admin reply..."
                        rows={1}
                        className={`${inputClass} flex-1 !py-2 !text-xs resize-none min-h-[36px] max-h-[80px]`}
                        onInput={(e: any) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px"; }}
                        autoFocus
                      />
                      <button onClick={() => postAdminReply(comment.animeId, comment.id)}
                        className="bg-gradient-to-r from-green-600 to-green-800 text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1">
                        <Send size={12} /> Send
                      </button>
                      <button onClick={() => { setReplyingTo(null); setReplyText(""); }}
                        className="text-[#957DAD] hover:text-red-400 p-2">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setReplyingTo(comment.id); setReplyText(""); }}
                      className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
                    >
                      <Reply size={12} /> Reply as Admin
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
