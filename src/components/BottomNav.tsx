import { Home, Film, Video, User } from "lucide-react";

interface BottomNavProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

const navItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "series", label: "Series", icon: Film },
  { id: "movies", label: "Movies", icon: Video },
  { id: "profile", label: "Profile", icon: User },
];

const BottomNav = ({ activePage, onNavigate }: BottomNavProps) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 h-[65px] z-50 flex items-center justify-around px-2.5 backdrop-blur-[20px] border-t border-primary/15"
      style={{ background: "linear-gradient(to top, hsla(240,20%,6%,0.98) 0%, hsla(240,20%,6%,0.95) 50%, hsla(240,20%,6%,0.9) 100%)" }}>
      {navItems.map((item) => {
        const isActive = activePage === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`relative flex flex-col items-center gap-1 py-2 px-4 transition-all ${isActive ? "text-primary" : "text-muted-foreground"}`}
          >
            {isActive && (
              <span className="absolute top-[-1px] left-1/2 -translate-x-1/2 w-7 h-[3px] rounded-b gradient-primary shadow-[0_2px_10px_hsla(170,75%,45%,0.4)]" />
            )}
            <Icon className={`w-5 h-5 transition-all ${isActive ? "drop-shadow-[0_0_10px_hsla(170,75%,45%,0.5)] scale-110" : ""}`} />
            <span className="text-[9px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
