import {
  DndContext,
  closestCenter,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useState } from "react";
import { SortableRecipeCard } from "./SortableRecipeCard";
import { RecipeCard } from "./RecipeCard";
import { Recipe } from "@/types/recipe";
import { Skeleton } from "@/components/ui/skeleton";
import { useSwapRecipeOrder, useMoveRecipeToCategory } from "@/hooks/useRecipes";
import { useCategories } from "@/hooks/useCategories";
import { cn } from "@/lib/utils";

interface DndRecipeGridProps {
  recipes: Recipe[];
  isLoading?: boolean;
  selectedCategory: string;
}

export function DndRecipeGrid({ recipes, isLoading, selectedCategory }: DndRecipeGridProps) {
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [overCategoryId, setOverCategoryId] = useState<string | null>(null);
  const swapOrder = useSwapRecipeOrder();
  const moveToCategory = useMoveRecipeToCategory();
  const { data: categories } = useCategories();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  if (isLoading) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-[4/3] rounded-lg" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">Рецепты не найдены</p>
        <p className="text-sm text-muted-foreground mt-1">
          Попробуйте изменить параметры поиска или добавьте новый рецепт
        </p>
      </div>
    );
  }

  const handleDragStart = (event: DragStartEvent) => {
    const recipe = recipes.find((r) => r.id === event.active.id);
    setActiveRecipe(recipe || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    if (!overId) {
      setOverCategoryId(null);
      return;
    }
    // Check if over a category drop zone
    const isCategory = categories?.some((c) => c.id === overId);
    setOverCategoryId(isCategory ? overId : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveRecipe(null);
    setOverCategoryId(null);

    if (!over || active.id === over.id) return;

    // Check if dropped on a category zone
    const isCategory = categories?.some((c) => c.id === over.id);
    if (isCategory) {
      const draggedRecipe = recipes.find((r) => r.id === active.id);
      if (draggedRecipe && draggedRecipe.category !== over.id) {
        moveToCategory.mutate({ recipeId: draggedRecipe.id, newCategory: over.id as string });
      }
      return;
    }

    // Swap within grid
    const recipeA = recipes.find((r) => r.id === active.id);
    const recipeB = recipes.find((r) => r.id === over.id);
    if (recipeA && recipeB) {
      swapOrder.mutate({
        recipeA: { id: recipeA.id, display_order: (recipeA as any).display_order ?? 0 },
        recipeB: { id: recipeB.id, display_order: (recipeB as any).display_order ?? 0 },
      });
    }
  };

  // Category drop zones (exclude currently selected category)
  const dropCategories = categories?.filter((c) => c.id !== selectedCategory) || [];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Category drop zones visible during drag */}
      {activeRecipe && dropCategories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground self-center mr-2">Переместить в:</span>
          {dropCategories.map((cat) => (
            <CategoryDropZone
              key={cat.id}
              id={cat.id}
              label={cat.label}
              isOver={overCategoryId === cat.id}
            />
          ))}
        </div>
      )}

      <SortableContext items={recipes.map((r) => r.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {recipes.map((recipe) => (
            <SortableRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeRecipe ? (
          <div className="w-72 rotate-3 shadow-2xl">
            <RecipeCard recipe={activeRecipe} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// Drop zone for a category
import { useDroppable } from "@dnd-kit/core";

function CategoryDropZone({ id, label, isOver }: { id: string; label: string; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "px-4 py-2 rounded-full border-2 border-dashed transition-all text-sm font-medium",
        isOver
          ? "border-primary bg-primary/10 text-primary scale-105"
          : "border-muted-foreground/30 text-muted-foreground"
      )}
    >
      {label}
    </div>
  );
}
