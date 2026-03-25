import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { initializeApp, getApps } from "firebase/app";
import { db, ref, set, get, update, remove } from "@/lib/firebase";
import { toast } from "sonner";

const firebaseConfig = {
  apiKey: "AIzaSyCC6Y8BUIW4r5S5KDyVOar46LzWmvJ18G8",
  authDomain: "nextgen-cinema2.firebaseapp.com",
  databaseURL: "https://nextgen-cinema2-default-rtdb.firebaseio.com",
  projectId: "nextgen-cinema2",
  storageBucket: "nextgen-cinema2.firebasestorage.app",
  messagingSenderId: "815514025460",
  appId: "1:815514025460:web:62f51737fe564b63eecda1"
};

const DEFAULT_VAPID_KEY = "BJVFgSOS28YpREzcKpsI81HM7h2mb_SuCAGAI__VoxJcNnS5k1Bs2CH_qkHUK1WS7mm09nWp73Jz8fT26qB9Brg";
const SUPABASE_BASE_URL = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const DEFAULT_SEND_ENDPOINT =
  SUPABASE_BASE_URL && !SUPABASE_BASE_URL.includes("placeholder.supabase.co")
    ? `${SUPABASE_BASE_URL.replace(/\/$/, "")}/functions/v1/send-fcm`
    : "";
const APP_ICON_URL = "https://i.ibb.co/VpwCTQ1W/1774431400079.png";
const CHUNK_SIZE = 180;
const CHUNK_CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_TOKENS_PER_USER = 3;

// Dynamic FCM config cache
let _cachedFcmConfig: { vapidKey: string; sendEndpoint: string } | null = null;
let _configLoading: Promise<{ vapidKey: string; sendEndpoint: string }> | null = null;

const getFcmConfig = async (): Promise<{ vapidKey: string; sendEndpoint: string }> => {
  if (_cachedFcmConfig) return _cachedFcmConfig;
  if (_configLoading) return _configLoading;
  _configLoading = (async () => {
    try {
      const snap = await get(ref(db, "settings/fcmConfig"));
      const data = snap.val() || {};
      _cachedFcmConfig = {
        vapidKey: data.vapidKey?.trim() || DEFAULT_VAPID_KEY,
        sendEndpoint: data.sendEndpoint?.trim() || DEFAULT_SEND_ENDPOINT,
      };
    } catch {
      _cachedFcmConfig = { vapidKey: DEFAULT_VAPID_KEY, sendEndpoint: DEFAULT_SEND_ENDPOINT };
    }
    _configLoading = null;
    return _cachedFcmConfig;
  })();
  return _configLoading;
};

let messaging: any = null;

const getMessagingInstance = () => {
  if (messaging) return messaging;
  try {
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    return messaging;
  } catch (err) {
    console.warn("FCM not supported in this browser:", err);
    return null;
  }
};

const getTokenKey = (token: string) =>
  btoa(token)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getDeviceId = (): string => {
  const KEY = "rs_fcm_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
};

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const requestWithRetry = async (body: unknown, retries = 2): Promise<Response> => {
  const config = await getFcmConfig();
  if (!config.sendEndpoint) {
    throw new Error("FCM send endpoint is missing. Set it in Admin → FCM Config.");
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(config.sendEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
      if (res.ok) return res;

      const text = await res.text();
      const retryable = res.status >= 500 || res.status === 429;
      if (!retryable || attempt === retries) {
        throw new Error(text || `Push request failed with ${res.status}`);
      }
      lastError = new Error(text || `Retryable push error ${res.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
    }

    await sleep(350 * Math.pow(2, attempt));
  }

  throw lastError instanceof Error ? lastError : new Error("Push request failed");
};

const cleanupInvalidTokens = async (invalidTokens: string[]) => {
  if (!invalidTokens.length) return 0;
  const invalidSet = new Set(invalidTokens);

  try {
    const snap = await get(ref(db, "fcmTokens"));
    const all = snap.val() || {};
    const updates: Record<string, null> = {};

    Object.entries(all).forEach(([uid, userTokens]: any) => {
      Object.entries(userTokens || {}).forEach(([tokenKey, entry]: any) => {
        if (entry?.token && invalidSet.has(entry.token)) {
          updates[`fcmTokens/${uid}/${tokenKey}`] = null;
        }
      });
    });

    const paths = Object.keys(updates);
    if (paths.length > 0) {
      await update(ref(db), updates);
    }

    return paths.length;
  } catch (err) {
    console.warn("Failed to cleanup invalid FCM tokens:", err);
    return 0;
  }
};

const pruneUserTokens = async (userId: string, currentTokenKey: string, deviceId: string): Promise<number> => {
  try {
    const snap = await get(ref(db, `fcmTokens/${userId}`));
    const tokens = snap.val() || {};
    const updates: Record<string, null> = {};

    Object.entries(tokens).forEach(([key, entry]: any) => {
      if (key !== currentTokenKey && entry?.deviceId === deviceId) {
        updates[`fcmTokens/${userId}/${key}`] = null;
      }
    });

    const remaining = Object.entries(tokens)
      .filter(([key]) => key !== currentTokenKey && !updates[`fcmTokens/${userId}/${key}`])
      .map(([key, entry]: any) => ({ key, updatedAt: entry?.updatedAt || 0 }));

    const totalAfterCleanup = remaining.length + 1;
    if (totalAfterCleanup > MAX_TOKENS_PER_USER) {
      remaining.sort((a, b) => a.updatedAt - b.updatedAt);
      const toRemove = totalAfterCleanup - MAX_TOKENS_PER_USER;
      for (let i = 0; i < toRemove && i < remaining.length; i++) {
        updates[`fcmTokens/${userId}/${remaining[i].key}`] = null;
      }
    }

    const count = Object.keys(updates).length;
    if (count > 0) {
      await update(ref(db), updates);
    }
    return count;
  } catch (err) {
    console.warn("[FCM] Token pruning failed:", err);
    return 0;
  }
};

// Register FCM token for a user
export const registerFCMToken = async (userId: string, showDiagnostics = false) => {
  const alreadyGranted = "Notification" in window && Notification.permission === "granted";
  const shouldShowToasts = showDiagnostics && !alreadyGranted;

  const diag = (msg: string, type: "info" | "success" | "error" | "warning" = "info") => {
    console.log(`[FCM] ${msg}`);
    if (shouldShowToasts) {
      if (type === "error") toast.error(`🔔 ${msg}`, { duration: 6000 });
      else if (type === "warning") toast.warning(`⚠️ ${msg}`, { duration: 5000 });
      else if (type === "success") toast.success(`✅ ${msg}`, { duration: 4000 });
      else toast.info(`ℹ️ ${msg}`, { duration: 3000 });
    }
  };

  const persistPushState = async (patch: Record<string, any>) => {
    if (!userId) return;
    try {
      await update(ref(db, `users/${userId}`), {
        id: userId,
        lastPushCheckAt: Date.now(),
        ...patch,
      });
    } catch (stateErr) {
      console.warn("[FCM] Failed to persist push state:", stateErr);
    }
  };

  try {
    diag(`Registering push for ${userId}...`);
    const msg = getMessagingInstance();
    if (!msg) {
      await persistPushState({ pushEnabled: false, pushPermission: "unsupported", pushTokenState: "unsupported" });
      diag("Firebase Messaging not supported", "error");
      return;
    }
    if (!userId) {
      diag("No userId provided", "error");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      await persistPushState({ pushEnabled: false, pushPermission: "unsupported", pushTokenState: "sw_not_supported" });
      diag("Service Worker not supported", "error");
      return;
    }

    diag("Registering service worker...");
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    diag(`Service Worker registered ✓`, "success");

    if (Notification.permission === "denied") {
      await persistPushState({ pushEnabled: false, pushPermission: "denied", pushTokenState: "blocked" });
      diag("Notifications BLOCKED! Please allow in browser settings", "error");
      return;
    }

    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

    if (permission !== "granted") {
      await persistPushState({ pushEnabled: false, pushPermission: permission, pushTokenState: "not_granted" });
      diag(`Permission not granted: ${permission}`, "warning");
      return;
    }
    await persistPushState({ pushEnabled: true, pushPermission: "granted", pushTokenState: "requesting_token" });
    diag("Permission granted ✓", "success");

    diag("Requesting FCM token...");
    const fcmConfig = await getFcmConfig();
    const token = await getToken(msg, {
      vapidKey: fcmConfig.vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      const tokenKey = getTokenKey(token);
      const deviceId = getDeviceId();
      const origin = window.location.origin;

      diag(`Saving token to database...`);

      await set(ref(db, `fcmTokens/${userId}/${tokenKey}`), {
        token,
        deviceId,
        origin,
        updatedAt: Date.now(),
        userAgent: navigator.userAgent.substring(0, 160),
      });

      const pruned = await pruneUserTokens(userId, tokenKey, deviceId);
      if (pruned > 0) {
        console.log(`[FCM] Pruned ${pruned} old token(s) for user ${userId}`);
      }

      await persistPushState({
        pushEnabled: true,
        pushPermission: "granted",
        pushTokenState: "saved",
        lastPushTokenAt: Date.now(),
      });

      diag(`Push token saved successfully! 🎉`, "success");
      return token;
    } else {
      await persistPushState({ pushEnabled: true, pushPermission: "granted", pushTokenState: "empty_token" });
      diag("Failed to get FCM token. VAPID key may be incorrect", "error");
      return null;
    }
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error("[FCM] Full error:", err);

    await persistPushState({
      pushTokenState: "error",
      pushEnabled: false,
      lastPushError: errMsg.substring(0, 140),
    });

    if (errMsg.includes("messaging/permission-blocked")) {
      diag("Browser has BLOCKED notifications", "error");
    } else if (errMsg.includes("messaging/failed-service-worker-registration")) {
      diag("Service worker failed - check firebase-messaging-sw.js", "error");
    } else if (errMsg.includes("messaging/token-subscribe-failed")) {
      diag("Token subscribe failed - VAPID key may be incorrect", "error");
    } else {
      diag(`Registration failed: ${errMsg.substring(0, 100)}`, "error");
    }
    return null;
  }
};

// Get all FCM tokens for specific user IDs
export const getFCMTokens = async (userIds: string[]): Promise<string[]> => {
  try {
    const snaps = await Promise.all(userIds.map((uid) => get(ref(db, `fcmTokens/${uid}`))));
    const tokens: string[] = [];

    snaps.forEach((snap) => {
      const data = snap.val();
      if (!data) return;
      Object.values(data).forEach((entry: any) => {
        if (entry?.token) tokens.push(entry.token);
      });
    });

    return [...new Set(tokens)];
  } catch (err) {
    console.warn("Failed to get FCM tokens:", err);
    return [];
  }
};

// Get ALL FCM tokens
export const getAllFCMTokens = async (): Promise<string[]> => {
  const tokens: string[] = [];
  try {
    const snap = await get(ref(db, "fcmTokens"));
    const data = snap.val();
    if (data) {
      Object.values(data).forEach((userTokens: any) => {
        Object.values(userTokens).forEach((entry: any) => {
          if (entry?.token) tokens.push(entry.token);
        });
      });
    }
  } catch (err) {
    console.warn("Failed to get all FCM tokens:", err);
  }
  return [...new Set(tokens)];
};

type PushPayload = {
  title: string;
  body: string;
  image?: string;
  url?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, string | number | boolean | null | undefined>;
};

export type PushProgress = {
  phase: "tokens" | "sending" | "cleanup" | "done";
  totalTokens: number;
  sent: number;
  success: number;
  failed: number;
  invalidRemoved: number;
  totalUsers?: number;
  failReasons?: { invalid: number; transient: number; other: number };
};

const normalizePushData = (payload: PushPayload) => {
  const normalizedData: Record<string, string> = {};
  Object.entries(payload.data || {}).forEach(([key, value]) => {
    normalizedData[key] = value == null ? "" : String(value);
  });
  if (payload.url) normalizedData.url = payload.url;
  normalizedData.baseUrl = window.location.origin;
  return normalizedData;
};

export const sendPushToTokens = async (
  tokens: string[],
  payload: PushPayload,
  onProgress?: (progress: PushProgress) => void
) => {
  const cleanTokens = [...new Set(tokens.filter(Boolean))];
  if (cleanTokens.length === 0) return { skipped: true, success: 0, failed: 0 };

  const normalizedData = normalizePushData(payload);

  const progress: PushProgress = {
    phase: "sending",
    totalTokens: cleanTokens.length,
    sent: 0,
    success: 0,
    failed: 0,
    invalidRemoved: 0,
  };
  onProgress?.(progress);

  const chunks = chunkArray(cleanTokens, CHUNK_SIZE);
  let nextIndex = 0;

  const aggregate = {
    success: 0,
    failed: 0,
    invalidTokens: new Set<string>(),
  };

  const worker = async () => {
    while (nextIndex < chunks.length) {
      const current = nextIndex++;
      const chunkTokens = chunks[current];

      try {
        const res = await requestWithRetry({
          tokens: chunkTokens,
          title: payload.title,
          body: payload.body,
          image: payload.image,
          icon: payload.icon || APP_ICON_URL,
          badge: payload.badge || APP_ICON_URL,
          data: normalizedData,
        });

        const data = await res.json().catch(() => ({}));
        aggregate.success += Number(data?.success || 0);
        aggregate.failed += Number(data?.failed || 0);

        if (Array.isArray(data?.invalidTokens)) {
          data.invalidTokens.forEach((token: string) => {
            if (token) aggregate.invalidTokens.add(token);
          });
        }
      } catch (err) {
        console.warn(`FCM chunk ${current + 1}/${chunks.length} failed:`, err);
        aggregate.failed += chunkTokens.length;
      }

      progress.sent = Math.min(cleanTokens.length, (current + 1) * CHUNK_SIZE);
      progress.success = aggregate.success;
      progress.failed = aggregate.failed;
      onProgress?.({ ...progress });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, () => worker()));

  const invalidTokenList = [...aggregate.invalidTokens];
  progress.phase = "cleanup";
  onProgress?.({ ...progress });

  const removedInvalid = await cleanupInvalidTokens(invalidTokenList);

  progress.phase = "done";
  progress.invalidRemoved = removedInvalid;
  progress.sent = cleanTokens.length;
  progress.success = aggregate.success;
  progress.failed = aggregate.failed;
  onProgress?.({ ...progress });

  return {
    success: aggregate.success,
    failed: aggregate.failed,
    total: cleanTokens.length,
    invalidTokensRemoved: removedInvalid,
  };
};

export const sendPushToUsers = async (
  userIds: string[],
  payload: PushPayload,
  onProgress?: (progress: PushProgress) => void
) => {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const normalizedData = normalizePushData(payload);

  onProgress?.({
    phase: "tokens",
    totalTokens: 0,
    sent: 0,
    success: 0,
    failed: 0,
    invalidRemoved: 0,
    totalUsers: uniqueUserIds.length,
  });

  if (uniqueUserIds.length === 0) {
    onProgress?.({ phase: "done", totalTokens: 0, sent: 0, success: 0, failed: 0, invalidRemoved: 0, totalUsers: 0 });
    return { skipped: true, success: 0, failed: 0, total: 0, invalidTokensRemoved: 0, reason: "NO_TARGET_USERS" };
  }

  onProgress?.({
    phase: "sending",
    totalTokens: uniqueUserIds.length,
    sent: 0,
    success: 0,
    failed: 0,
    invalidRemoved: 0,
    totalUsers: uniqueUserIds.length,
  });

  let data: any = {};
  try {
    const res = await requestWithRetry({
      userIds: uniqueUserIds,
      title: payload.title,
      body: payload.body,
      image: payload.image,
      icon: payload.icon || APP_ICON_URL,
      badge: payload.badge || APP_ICON_URL,
      data: normalizedData,
    });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    console.warn("Push request failed:", err);
    onProgress?.({ phase: "done", totalTokens: 0, sent: 0, success: 0, failed: uniqueUserIds.length, invalidRemoved: 0, totalUsers: uniqueUserIds.length });
    return {
      skipped: false,
      success: 0,
      failed: uniqueUserIds.length,
      total: 0,
      invalidTokensRemoved: 0,
      reason: "REQUEST_FAILED",
      error: err instanceof Error ? err.message : "Unknown request error",
    };
  }

  const totalTokens = Number(data?.totalTokens || (Number(data?.success || 0) + Number(data?.failed || 0)));
  const success = Number(data?.success || 0);
  const failed = Number(data?.failed || 0);
  const invalidRemoved = Number(data?.invalidRemoved || 0);
  const reason = typeof data?.reason === "string" ? data.reason : undefined;
  const details = data?.details;
  const failReasons = data?.failReasons || undefined;

  onProgress?.({
    phase: "done",
    totalTokens,
    sent: totalTokens,
    success,
    failed,
    invalidRemoved,
    totalUsers: uniqueUserIds.length,
    failReasons,
  });

  return {
    success,
    failed,
    total: totalTokens,
    invalidTokensRemoved: invalidRemoved,
    skipped: totalTokens === 0 && success === 0,
    reason,
    details,
    failReasons,
  };
};

// Listen for foreground messages
export const onForegroundMessage = (callback: (payload: any) => void) => {
  const msg = getMessagingInstance();
  if (!msg) return () => {};
  return onMessage(msg, callback);
};
