import { useState, useEffect } from "react";
import { Play, Info, Star } from "lucide-react";
import { getAnimeTitleStyle } from "@/lib/animeFonts";

interface HeroSlide {
  id: string;
  title: string;
  backdrop: string;
  subtitle: string;
  rating: string;
  year: string;
  type: string;
}

interface HeroSliderProps {
  slides: HeroSlide[];
  onPlay: (index: number) => void;
  onInfo: (index: number) => void;
}

const HeroSlider = ({ slides, onPlay, onInfo }: HeroSliderProps) => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (slides.length === 0) return;
    const timer = setInterval(() => {
      setCurrent((c) => (c + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) {
    return (
      <div className="relative w-full h-[50vh] min-h-[380px] bg-card flex items-center justify-center">
        <p className="text-muted-foreground">No content available</p>
      </div>
    );
  }

  const slide = slides[current];

  return (
    <div className="relative w-full h-[50vh] min-h-[380px] overflow-hidden">
      {slides.map((s, i) => (
        <div
          key={s.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${i === current ? "opacity-100" : "opacity-0"}`}
        >
          <img src={s.backdrop} alt={s.title} className="w-full h-full object-cover" />
        </div>
      ))}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(to top, hsl(240 20% 6%) 0%, rgba(0,0,0,0.3) 40%, transparent 60%), linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 25%)"
      }} />
      <div className="absolute bottom-[90px] left-0 right-0 px-5 text-center z-10">
        <h1 className="text-2xl font-extrabold mb-2.5 tracking-tight line-clamp-2" style={{ ...getAnimeTitleStyle(slide.title), textShadow: "0 4px 30px rgba(0,0,0,0.9)" }}>
          {slide.title}
        </h1>
        <div className="flex items-center justify-center gap-2.5 text-xs text-secondary-foreground flex-wrap mb-1.5">
          <span className="bg-accent px-2.5 py-1 rounded text-[11px] font-semibold text-accent-foreground shadow-[0_2px_10px_hsla(38,90%,55%,0.4)] flex items-center gap-1">
            <Star className="w-3 h-3" /> {slide.rating}
          </span>
          <span>{slide.year}</span>
          <span className="bg-primary/20 text-primary px-2.5 py-1 rounded text-[10px] font-semibold backdrop-blur-[10px]">
            {slide.type === "webseries" ? "Series" : "Movie"}
          </span>
        </div>
        <div className="flex justify-center gap-3 mt-4">
          <button onClick={() => onPlay(current)} className="gradient-primary text-primary-foreground px-7 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 btn-glow">
            <Play className="w-4 h-4" /> Play Now
          </button>
          <button onClick={() => onInfo(current)} className="bg-foreground/15 text-foreground px-7 py-3 rounded-xl font-semibold text-sm flex items-center gap-2 border border-foreground/20 backdrop-blur-[20px] transition-all hover:bg-foreground/25 hover:scale-105">
            <Info className="w-4 h-4" /> Details
          </button>
        </div>
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2.5 z-10">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`h-2 rounded transition-all duration-400 ${i === current
              ? "w-7 gradient-primary shadow-[0_0_15px_hsla(176,65%,48%,0.4)]"
              : "w-2 bg-foreground/40"}`}
          />
        ))}
      </div>
    </div>
  );
};

export default HeroSlider;
