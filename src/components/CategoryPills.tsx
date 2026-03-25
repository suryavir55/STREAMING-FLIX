interface CategoryPillsProps {
  active: string;
  onSelect: (cat: string) => void;
  categories: string[];
}

const CategoryPills = ({ active, onSelect, categories }: CategoryPillsProps) => {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-4 no-scrollbar">
      <button
        onClick={() => onSelect("All")}
        className={`flex-shrink-0 px-5 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
          active === "All"
            ? "gradient-primary border-primary shadow-[0_4px_25px_hsla(170,75%,45%,0.3)] -translate-y-0.5 text-primary-foreground"
            : "bg-gradient-to-br from-secondary to-card border-foreground/[0.08]"
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`flex-shrink-0 px-5 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
            active === cat
              ? "gradient-primary border-primary shadow-[0_4px_25px_hsla(170,75%,45%,0.3)] -translate-y-0.5 text-primary-foreground"
              : "bg-gradient-to-br from-secondary to-card border-foreground/[0.08]"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
};

export default CategoryPills;
