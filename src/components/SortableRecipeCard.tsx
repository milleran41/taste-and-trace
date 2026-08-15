import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PuzzleRecipeTile } from "./PuzzleRecipeTile";
import { Recipe } from "@/types/recipe";
import { GripVertical } from "lucide-react";

interface SortableRecipeCardProps {
  recipe: Recipe;
  index?: number;
  onPointerEnter?: (recipeId: string) => void;
}

function SortableRecipeCardComponent({ recipe, index = 0, onPointerEnter }: SortableRecipeCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: recipe.id });

  return (
    <div
      ref={setNodeRef}
      className="relative group/drag"
      onPointerEnter={() => onPointerEnter?.(recipe.id)}
      style={{
        opacity: isDragging ? 0.35 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-20 p-1.5 rounded-md bg-background/80 backdrop-blur-sm opacity-0 group-hover/drag:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <PuzzleRecipeTile recipe={recipe} index={index} className={isDragging ? "pointer-events-none" : undefined} />
    </div>
  );
}

export const SortableRecipeCard = memo(SortableRecipeCardComponent);
