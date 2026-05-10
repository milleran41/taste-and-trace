import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { RecipeCard } from "./RecipeCard";
import { Recipe } from "@/types/recipe";
import { GripVertical } from "lucide-react";

interface SortableRecipeCardProps {
  recipe: Recipe;
  onPointerEnter?: (recipeId: string) => void;
}

function SortableRecipeCardComponent({ recipe, onPointerEnter }: SortableRecipeCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({ id: recipe.id });

  return (
    <div
      ref={setNodeRef}
      className="relative group/drag"
      onPointerEnter={() => onPointerEnter?.(recipe.id)}
      style={{
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-20 p-1.5 rounded-md bg-background/80 backdrop-blur-sm opacity-0 group-hover/drag:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <RecipeCard recipe={recipe} />
    </div>
  );
}

export const SortableRecipeCard = memo(SortableRecipeCardComponent);
