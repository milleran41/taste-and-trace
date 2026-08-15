import { Button } from "@/components/ui/button";
import { useCategories } from "@/hooks/useCategories";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryManager } from "@/components/CategoryManager";
import { useTranslation } from "react-i18next";

interface CategoryFilterProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

const categoryLabelTranslations: Record<string, string> = {
  "салаты": "default_salads",
  "salads": "default_salads",
};

export function CategoryFilter({ selectedCategory, onCategoryChange }: CategoryFilterProps) {
  const { data: categories, isLoading } = useCategories();
  const { t } = useTranslation();

  const getCategoryLabel = (category: { id: string; label: string }) => {
    if (category.id.startsWith("default_")) {
      return t(category.id);
    }

    const translationKey = categoryLabelTranslations[category.label.trim().toLowerCase()];
    return translationKey ? t(translationKey) : category.label;
  };

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <CategoryManager />
      <Button
        variant={selectedCategory === "all" ? "default" : "outline"}
        size="sm"
        className="rounded-full whitespace-nowrap"
        onClick={() => onCategoryChange("all")}
      >
        {t("go_to_main")}
      </Button>
      {categories?.map((category) => (
        <Button
          key={category.id}
          variant={selectedCategory === category.id ? "default" : "outline"}
          size="sm"
          className="rounded-full whitespace-nowrap"
          onClick={() => onCategoryChange(category.id)}
        >
          {getCategoryLabel(category)}
        </Button>
      ))}
    </div>
  );
}
