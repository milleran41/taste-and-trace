import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RecipeCard } from "./RecipeCard";
import { Recipe } from "@/types/recipe";
import { GripVertical } from "lucide-react";

interface SortableRecipeCardProps {
  recipe: Recipe;
}

export function SortableRecipeCard({ recipe }: SortableRecipeCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: recipe.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group/drag">
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
