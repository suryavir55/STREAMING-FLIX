import { useState, forwardRef } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { type AnimeItem } from "@/data/animeData";
import AnimeCard from "./AnimeCard";
import { motion } from "framer-motion";

interface SearchPageProps {
  allAnime: AnimeItem[];
  onClose: () => void;
  onCardClick: (anime: AnimeItem) => void;
}

const SearchPage = forwardRef<HTMLDivElement, SearchPageProps>(({ allAnime, onClose, onCardClick }, _ref) => {
  const [query, setQuery] = useState("");

  const results = query.trim()
    ? allAnime.filter((a) => a.title.toLowerCase().includes(query.toLowerCase()))
    : [];

  return (
    <motion.div
      className="fixed inset-0 z-[200] bg-background overflow-y-auto px-4 pb-24 pt-5"
      initial={{ y: "-100%" }}
      animate={{ y: 0 }}
      exit={{ y: "-100%" }}
      transition={{ type: "tween", duration: 0.4 }}
    >
      <div className="flex items-center gap-2.5 mb-5">
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center transition-all hover:bg-primary">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search movies & series..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full py-3 pl-11 pr-4 rounded-xl bg-card border border-foreground/10 text-foreground text-[15px] focus:outline-none focus:border-primary focus:shadow-[0_0_20px_hsla(170,75%,45%,0.3)] placeholder:text-muted-foreground"
            autoFocus
          />
        </div>
      </div>

      {!query.trim() ? (
        <div className="text-center py-12">
          <Search className="w-14 h-14 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Search Content</h3>
          <p className="text-sm text-secondary-foreground">Find your favorite movies and series</p>
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-12">
          <Search className="w-14 h-14 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Results Found</h3>
          <p className="text-sm text-secondary-foreground">Try a different search term</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {results.map((anime) => (
            <div key={anime.id} className="w-full">
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer poster-hover bg-card" onClick={() => onCardClick(anime)}>
                <img src={anime.poster} alt={anime.title} className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)" }} />
                <span className="absolute top-1.5 right-1.5 gradient-primary px-2 py-0.5 rounded text-[9px] font-bold">{anime.year}</span>
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-[11px] font-semibold leading-tight line-clamp-2">{anime.title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
});

SearchPage.displayName = "SearchPage";

export default SearchPage;
