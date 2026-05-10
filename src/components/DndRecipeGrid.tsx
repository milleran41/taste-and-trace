import {
  DndContext, closestCenter, DragOverlay, DragStartEvent, DragEndEvent,
  PointerSensor, useSensor, useSensors, DragOverEvent, DragCancelEvent, useDroppable,
  MeasuringStrategy, pointerWithin, rectIntersection, type CollisionDetection,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useEffect, useRef, useState } from "react";
import { SortableRecipeCard } from "./SortableRecipeCard";
import { RecipeCard } from "./RecipeCard";
import { Recipe } from "@/types/recipe";
import { Skeleton } from "@/components/ui/skeleton";
import { useMoveRecipeToCategory, useReorderRecipes } from "@/hooks/useRecipes";
import { useCategories } from "@/hooks/useCategories";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface DndRecipeGridProps {
  recipes: Recipe[];
  isLoading?: boolean;
  selectedCategory: string;
}

export function DndRecipeGrid({ recipes, isLoading, selectedCategory }: DndRecipeGridProps) {
  const [displayRecipes, setDisplayRecipes] = useState(recipes);
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [overCategoryId, setOverCategoryId] = useState<string | null>(null);
  const activeRecipeRef = useRef<Recipe | null>(null);
  const lastOverIdRef = useRef<string | null>(null);
  const reorderRecipes = useReorderRecipes();
  const moveToCategory = useMoveRecipeToCategory();
  const { data: categories } = useCategories();
  const { t } = useTranslation();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    setDisplayRecipes(recipes);
  }, [recipes]);

  const collisionDetection: CollisionDetection = (args) => {
    const categoryIds = new Set(categories?.map((category) => category.id) || []);
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      const categoryCollisions = pointerCollisions.filter((collision) => categoryIds.has(String(collision.id)));
      return categoryCollisions.length > 0 ? categoryCollisions : pointerCollisions;
    }

    const intersections = rectIntersection(args);
    if (intersections.length > 0) {
      const categoryIntersections = intersections.filter((collision) => categoryIds.has(String(collision.id)));
      return categoryIntersections.length > 0 ? categoryIntersections : intersections;
    }

    return closestCenter(args);
  };

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
        <p className="text-muted-foreground text-lg">{t("no_recipes_found")}</p>
        <p className="text-sm text-muted-foreground mt-1">{t("try_different_search")}</p>
      </div>
    );
  }

  const handleDragStart = (event: DragStartEvent) => {
    lastOverIdRef.current = null;
    const recipe = displayRecipes.find((r) => r.id === event.active.id);
    activeRecipeRef.current = recipe || null;
    setActiveRecipe(recipe || null);
  };

  const handleRecipePointerEnter = useCallback((recipeId: string) => {
    if (activeRecipeRef.current) {
      lastOverIdRef.current = recipeId;
    }
  }, []);

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    lastOverIdRef.current = overId || lastOverIdRef.current;
    if (!overId) {
      setOverCategoryId(null);
      return;
    }

    const isCategory = categories?.some((c) => c.id === overId);
    const nextOverCategoryId = isCategory ? overId : null;
    setOverCategoryId((current) => current === nextOverCategoryId ? current : nextOverCategoryId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    activeRecipeRef.current = null;
    setActiveRecipe(null); setOverCategoryId(null);

    const activeId = String(active.id);
    const overId = over?.id ? String(over.id) : lastOverIdRef.current;
    lastOverIdRef.current = null;
    if (!overId) {
      return;
    }

    const isCategory = categories?.some((c) => c.id === overId);
    if (isCategory) {
      const draggedRecipe = displayRecipes.find((r) => r.id === activeId);
      if (draggedRecipe && draggedRecipe.category !== overId) {
        moveToCategory.mutate({ recipeId: draggedRecipe.id, newCategory: overId });
      }
      return;
    }

    const oldIndex = displayRecipes.findIndex((recipe) => recipe.id === activeId);
    const newIndex = displayRecipes.findIndex((recipe) => recipe.id === overId);
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const nextRecipes = arrayMove(displayRecipes, oldIndex, newIndex);
      setDisplayRecipes(nextRecipes);

      const reordered = nextRecipes
        .map((recipe, index) => ({
          id: recipe.id,
          display_order: index,
          current_display_order: recipe.display_order,
        }))
        .filter((recipe) => recipe.display_order !== recipe.current_display_order)
        .map(({ id, display_order }) => ({ id, display_order }));

      if (reordered.length > 0) {
        reorderRecipes.mutate(reordered);
      }
    }
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    activeRecipeRef.current = null;
    setActiveRecipe(null);
    setOverCategoryId(null);
    lastOverIdRef.current = null;
  };

  const dropCategories = categories?.filter((c) => c.id !== selectedCategory) || [];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {activeRecipe && dropCategories.length > 0 && (
        <div className="fixed left-1/2 top-4 z-50 flex max-w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 flex-wrap justify-center gap-2 rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur">
          <span className="text-sm text-muted-foreground self-center mr-2">{t("move_to")}</span>
          {dropCategories.map((cat) => (
            <CategoryDropZone key={cat.id} id={cat.id} label={cat.label} isOver={overCategoryId === cat.id} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {displayRecipes.map((recipe) => (
          <SortableRecipeCard key={recipe.id} recipe={recipe} onPointerEnter={handleRecipePointerEnter} />
        ))}
      </div>
      <DragOverlay>
        {activeRecipe ? <div className="w-72 rotate-3 shadow-2xl pointer-events-none"><RecipeCard recipe={activeRecipe} /></div> : null}
      </DragOverlay>
    </DndContext>
  );
}

function CategoryDropZone({ id, label, isOver }: { id: string; label: string; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("px-4 py-2 rounded-full border-2 border-dashed transition-all text-sm font-medium", isOver ? "border-primary bg-primary/10 text-primary scale-105" : "border-muted-foreground/30 text-muted-foreground")}>
      {label}
    </div>
  );
}
