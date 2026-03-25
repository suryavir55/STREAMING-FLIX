import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db, ref, set, get, update } from "@/lib/firebase";

const Unlock = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"verifying" | "success" | "denied">("verifying");

  useEffect(() => {
    const doUnlock = async () => {
      const token = searchParams.get("t");

      if (!token) {
        setStatus("denied");
        setTimeout(() => navigate("/", { replace: true }), 2500);
        return;
      }

      // Check if token exists in Firebase and hasn't been used
      try {
        const tokenSnap = await get(ref(db, `unlockTokens/${token}`));
        if (!tokenSnap.exists()) {
          // Token doesn't exist - invalid
          setStatus("denied");
          setTimeout(() => navigate("/", { replace: true }), 2500);
          return;
        }

        const tokenData = tokenSnap.val();
        if (tokenData.used === true) {
          // Token already used - expired
          setStatus("denied");
          setTimeout(() => navigate("/", { replace: true }), 2500);
          return;
        }

        // Mark token as used immediately (one-time use)
        const userId = (() => {
          try {
            const u = localStorage.getItem("rsanime_user");
            if (u) return JSON.parse(u).id || "anon_" + Date.now();
          } catch {}
          return "anon_" + Date.now();
        })();

        await update(ref(db, `unlockTokens/${token}`), {
          used: true,
          usedAt: Date.now(),
          usedBy: userId,
        });
      } catch (err) {
        console.error("Token validation error:", err);
        // If Firebase check fails, also verify via sessionStorage as fallback
        const storedToken = sessionStorage.getItem("rsanime_unlock_token");
        if (!storedToken || token !== storedToken) {
          setStatus("denied");
          setTimeout(() => navigate("/", { replace: true }), 2500);
          return;
        }
      }

      // Clear session token
      sessionStorage.removeItem("rsanime_unlock_token");

      setStatus("success");

      // Get configurable access hours from Firebase (default 24)
      let accessHours = 24;
      try {
        const snap = await get(ref(db, "settings/arolink/accessHours"));
        if (snap.exists() && snap.val() > 0) accessHours = snap.val();
      } catch {}

      // Grant access
      const expiry = Date.now() + accessHours * 60 * 60 * 1000;
      localStorage.setItem("rsanime_ad_access", expiry.toString());

      // Save free access user info to Firebase
      try {
        const userStr = localStorage.getItem("rsanime_user");
        if (userStr) {
          const user = JSON.parse(userStr);
          const uid = user.id || user.uid || user.username || user.email?.replace(/[.@]/g, "_");
          const id = uid || "user_" + Date.now();
          await set(ref(db, `freeAccessUsers/${id}`), {
            userId: id,
            name: user.name || user.username || "Unknown",
            email: user.email || "",
            unlockedAt: Date.now(),
            expiresAt: expiry,
          });
        } else {
          const anonId = "anon_" + Date.now();
          await set(ref(db, `freeAccessUsers/${anonId}`), {
            userId: anonId, name: "Anonymous", email: "",
            unlockedAt: Date.now(), expiresAt: expiry,
          });
        }
      } catch (err) {
        console.error("Failed to save free access:", err);
      }

      setTimeout(() => navigate("/", { replace: true }), 2000);
    };

    doUnlock();
  }, [navigate, searchParams]);

  if (status === "denied") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-card rounded-2xl p-8 max-w-sm w-[90%] text-center space-y-4 shadow-2xl border border-border">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-foreground">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            This unlock link has already been used or is invalid. Please get a new link from the video player.
          </p>
          <p className="text-xs text-muted-foreground animate-pulse">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-card rounded-2xl p-8 max-w-sm w-[90%] text-center space-y-4 shadow-2xl border border-border">
        <div className="w-16 h-16 mx-auto rounded-full gradient-primary flex items-center justify-center">
          {status === "verifying" ? (
            <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <h2 className="text-xl font-bold text-foreground">
          {status === "verifying" ? "Verifying..." : "Access Unlocked!"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {status === "verifying"
            ? "Please wait while we verify your access..."
            : `You now have free access to all videos. Enjoy!`}
        </p>
        <p className="text-xs text-muted-foreground animate-pulse">Redirecting...</p>
      </div>
    </div>
  );
};

export default Unlock;
