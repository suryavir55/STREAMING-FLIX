import { useState, useEffect } from "react";
import { Search, User } from "lucide-react";
import logoImg from "@/assets/logo.png";
import NotificationPanel from "./NotificationPanel";
import { db, ref, set, update } from "@/lib/firebase";
import { useUiConfig } from "@/hooks/useUiConfig";

// Generate a persistent device ID for this user
const getOrCreateUser = (): { id: string; dbKey: string } => {
  try {
    const existing = localStorage.getItem("rsanime_user");
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed.id) return { id: parsed.id, dbKey: parsed.dbKey || parsed.id };
    }
  } catch {}
  
  const newId = "user_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
  const userData = { id: newId, dbKey: newId, createdAt: Date.now() };
  localStorage.setItem("rsanime_user", JSON.stringify(userData));
  
  set(ref(db, `users/${newId}`), {
    name: "Guest User",
    createdAt: Date.now(),
    online: true,
    lastSeen: Date.now(),
  }).catch(() => {});
  
  return { id: newId, dbKey: newId };
};

interface HeaderProps {
  onSearchClick: () => void;
  onProfileClick: () => void;
  onOpenContent?: (contentId: string) => void;
}

const Header = ({ onSearchClick, onProfileClick, onOpenContent }: HeaderProps) => {
  const uiConfig = useUiConfig();
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  useEffect(() => {
    const user = getOrCreateUser();
    setUserId(user.id);

    // Load profile photo
    try {
      const photo = localStorage.getItem("rs_profile_photo");
      setProfilePhoto(photo);
    } catch {}

    // Listen for profile photo changes
    const checkPhoto = () => {
      try {
        const photo = localStorage.getItem("rs_profile_photo");
        setProfilePhoto(photo);
      } catch {}
    };
    const interval = setInterval(checkPhoto, 2000);

    // Update online status
    const updateOnline = () => {
      update(ref(db, `users/${user.dbKey}`), { online: true, lastSeen: Date.now() }).catch(() => {});
    };
    updateOnline();
    const heartbeat = setInterval(updateOnline, 30000);
    
    const onUnload = () => {
      update(ref(db, `users/${user.dbKey}`), { online: false, lastSeen: Date.now() }).catch(() => {});
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      clearInterval(interval);
      clearInterval(heartbeat);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 h-[60px] z-50 flex items-center justify-between px-4 transition-all duration-300"
      style={{ background: "linear-gradient(to bottom, hsla(240,20%,6%,0.98) 0%, hsla(240,20%,6%,0.8) 50%, transparent 100%)" }}>
      <div className="flex items-center gap-2 min-w-0">
        <img src={uiConfig.appLogo || logoImg} alt={uiConfig.appName} className="h-10 w-10 rounded-lg object-contain" />
        <span className="text-xs font-semibold truncate max-w-[90px]">{uiConfig.appName}</span>
      </div>
      <div className="relative flex-1 max-w-[200px] mx-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-foreground w-4 h-4" />
        <input
          type="text"
          placeholder="Search..."
          className="w-full py-2.5 pl-9 pr-3 rounded-full bg-foreground/10 border border-foreground/10 text-foreground text-sm transition-all focus:bg-foreground/15 focus:border-primary focus:outline-none focus:shadow-[0_0_20px_hsla(170,75%,45%,0.3)] placeholder:text-muted-foreground"
          readOnly
          onClick={onSearchClick}
        />
      </div>
      <div className="flex items-center gap-2">
        <NotificationPanel userId={userId} onOpenContent={onOpenContent} />
        <button
          onClick={onProfileClick}
          className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center border-2 border-transparent transition-all hover:border-primary hover:scale-110"
        >
          {profilePhoto ? (
            <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full gradient-primary flex items-center justify-center">
              <User className="w-4 h-4 text-primary-foreground" />
            </div>
          )}
        </button>
      </div>
    </header>
  );
};

export default Header;
