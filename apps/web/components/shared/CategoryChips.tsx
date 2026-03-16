"use client";

import clsx from "clsx";

interface CategoryChip {
  id: string;
  label: string;
  count?: number;
}

interface CategoryChipsProps {
  categories: CategoryChip[];
  selected?: string;
  selectedItems?: string[];
  onSelect: (id: string) => void;
  className?: string;
  wrap?: boolean;
}

export function CategoryChips({ categories, selected, selectedItems, onSelect, className, wrap }: CategoryChipsProps) {
  return (
    <div className={clsx("flex gap-2 pb-2", wrap ? "flex-wrap" : "overflow-x-auto scrollbar-none", className)}>
      {categories.map((category) => {
        const isSelected = selectedItems ? selectedItems.includes(category.id) : selected === category.id;
        return (
          <button
            key={category.id}
            onClick={() => onSelect(category.id)}
            className={clsx(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
              isSelected
                ? "bg-primary-500 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            <span>{category.label}</span>
            {category.count !== undefined && (
              <span
                className={clsx(
                  "text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center",
                  isSelected ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"
                )}
              >
                {category.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
