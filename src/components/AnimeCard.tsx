import { useState, useEffect } from "react";
import { Star, Heart } from "lucide-react";
import type { AnimeItem } from "@/data/animeData";
import { db, ref, set, remove, onValue } from "@/lib/firebase";
import { getAnimeTitleStyle } from "@/lib/animeFonts";

interface AnimeCardProps {
  anime: AnimeItem;
  onClick: (anime: AnimeItem) => void;
}

const AnimeCard = ({ anime, onClick }: AnimeCardProps) => {
  const [isInWatchlist, setIsInWatchlist] = useState(false);

  const getUserId = (): string | null => {
    try { const u = localStorage.getItem("rsanime_user"); if (u) return JSON.parse(u).id; } catch {} return null;
  };

  const userId = getUserId();

  useEffect(() => {
    if (!userId) return;
    const wlRef = ref(db, `users/${userId}/watchlist/${anime.id}`);
    const unsub = onValue(wlRef, (snap) => setIsInWatchlist(snap.exists()));
    return () => unsub();
  }, [userId, anime.id]);

  const toggleWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId) return;
    if (isInWatchlist) {
      remove(ref(db, `users/${userId}/watchlist/${anime.id}`));
    } else {
      set(ref(db, `users/${userId}/watchlist/${anime.id}`), {
        id: anime.id, title: anime.title, poster: anime.poster,
        year: anime.year, rating: anime.rating, type: anime.type, addedAt: Date.now(),
      });
    }
  };

  return (
    <div
      className="relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer poster-hover bg-card min-w-[120px] max-w-[140px] flex-shrink-0"
      onClick={() => onClick(anime)}
    >
      <img src={anime.poster} alt={anime.title} className="w-full h-full object-cover transition-transform duration-400 hover:scale-110" loading="lazy" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)" }} />
      <button
        className={`absolute top-1.5 left-1.5 w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 z-10 ${
          isInWatchlist ? "bg-primary" : "bg-background/70 hover:bg-primary"
        }`}
        onClick={toggleWatchlist}
      >
        <Heart className={`w-3.5 h-3.5 ${isInWatchlist ? "fill-white text-white" : "text-foreground"}`} />
      </button>
      <span className="absolute top-1.5 right-1.5 bg-accent px-2 py-0.5 rounded text-[9px] font-bold shadow-[0_3px_12px_hsla(38,90%,55%,0.4)] text-accent-foreground">
        {anime.year}
      </span>
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-[10px] font-semibold leading-tight line-clamp-2" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9)" }}>
          {anime.title}
        </p>
        <p className="text-[8px] text-secondary-foreground flex items-center gap-1 mt-1">
          <Star className="w-2 h-2 text-accent" /> {anime.rating}
        </p>
      </div>
    </div>
  );
};

export default AnimeCard;
