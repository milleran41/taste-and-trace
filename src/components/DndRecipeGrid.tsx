import {
  DndContext, closestCenter, DragOverlay, DragStartEvent, DragEndEvent,
  PointerSensor, useSensor, useSensors, DragOverEvent, DragCancelEvent, useDroppable,
  DragMoveEvent, MeasuringStrategy, pointerWithin, rectIntersection, type CollisionDetection,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { useCallback, useEffect, useRef, useState } from "react";
import { SortableRecipeCard } from "./SortableRecipeCard";
import { PuzzleRecipeTile } from "./PuzzleRecipeTile";
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
  const [showCategoryTargets, setShowCategoryTargets] = useState(false);
  const activeRecipeRef = useRef<Recipe | null>(null);
  const displayRecipesRef = useRef(recipes);
  const didReorderRef = useRef(false);
  const lastOverIdRef = useRef<string | null>(null);
  const reorderRecipes = useReorderRecipes();
  const moveToCategory = useMoveRecipeToCategory();
  const { data: categories } = useCategories();
  const { t } = useTranslation();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    setDisplayRecipes(recipes);
    displayRecipesRef.current = recipes;
  }, [recipes]);

  const collisionDetection: CollisionDetection = (args) => {
    const categoryIds = showCategoryTargets
      ? new Set(categories?.map((category) => category.id) || [])
      : new Set<string>();
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

  const handleRecipePointerEnter = useCallback((recipeId: string) => {
    if (activeRecipeRef.current) {
      lastOverIdRef.current = recipeId;
    }
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-6">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-4 opacity-20 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="relative h-28 rounded-lg border bg-gradient-to-br from-primary/20 via-accent/30 to-secondary/40"
            />
          ))}
        </div>
        <div className="mt-6 text-center">
          <p className="text-muted-foreground text-lg">{t("no_recipes_found")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("try_different_search")}</p>
        </div>
      </div>
    );
  }

  const handleDragStart = (event: DragStartEvent) => {
    lastOverIdRef.current = null;
    const recipe = displayRecipes.find((r) => r.id === event.active.id);
    activeRecipeRef.current = recipe || null;
    didReorderRef.current = false;
    setActiveRecipe(recipe || null);
    setShowCategoryTargets(false);
    setOverCategoryId(null);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const shouldShowTargets = event.delta.y < -180;
    setShowCategoryTargets((current) => current === shouldShowTargets ? current : shouldShowTargets);

    if (!shouldShowTargets) {
      const lastOverId = lastOverIdRef.current;
      const lastOverWasCategory = categories?.some((category) => category.id === lastOverId);
      if (lastOverWasCategory) {
        lastOverIdRef.current = null;
      }
      setOverCategoryId(null);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    if (!overId) {
      setOverCategoryId(null);
      return;
    }

    const isCategory = categories?.some((c) => c.id === overId);
    if (isCategory && !showCategoryTargets) {
      setOverCategoryId(null);
      return;
    }

    lastOverIdRef.current = overId || lastOverIdRef.current;
    const nextOverCategoryId = isCategory ? overId : null;
    setOverCategoryId((current) => current === nextOverCategoryId ? current : nextOverCategoryId);

    if (isCategory) {
      return;
    }

    const activeId = String(event.active.id);
    const currentRecipes = displayRecipesRef.current;
    const oldIndex = currentRecipes.findIndex((recipe) => recipe.id === activeId);
    const newIndex = currentRecipes.findIndex((recipe) => recipe.id === overId);

    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const nextRecipes = arrayMove(currentRecipes, oldIndex, newIndex);
      displayRecipesRef.current = nextRecipes;
      didReorderRef.current = true;
      setDisplayRecipes(nextRecipes);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    activeRecipeRef.current = null;
    setActiveRecipe(null); setOverCategoryId(null); setShowCategoryTargets(false);

    const activeId = String(active.id);
    const overId = over?.id ? String(over.id) : lastOverIdRef.current;
    lastOverIdRef.current = null;
    if (!overId) {
      return;
    }

    const isCategory = categories?.some((c) => c.id === overId);
    if (isCategory && showCategoryTargets) {
      const draggedRecipe = displayRecipes.find((r) => r.id === activeId);
      if (draggedRecipe && draggedRecipe.category !== overId) {
        moveToCategory.mutate({ recipeId: draggedRecipe.id, newCategory: overId });
      }
      return;
    }

    if (isCategory) {
      return;
    }

    if (didReorderRef.current) {
      const finalRecipes = displayRecipesRef.current;
      const reordered = finalRecipes
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

    didReorderRef.current = false;
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    activeRecipeRef.current = null;
    setActiveRecipe(null);
    setOverCategoryId(null);
    setShowCategoryTargets(false);
    didReorderRef.current = false;
    lastOverIdRef.current = null;
  };

  const dropCategories = categories?.filter((c) => c.id !== selectedCategory) || [];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {activeRecipe && showCategoryTargets && dropCategories.length > 0 && (
        <div className="fixed left-1/2 top-4 z-50 grid max-w-[min(1120px,calc(100vw-2rem))] -translate-x-1/2 gap-3 rounded-2xl border bg-background/95 p-4 shadow-2xl backdrop-blur md:grid-cols-[auto_1fr]">
          <span className="self-center rounded-full bg-muted px-4 py-2 text-base font-semibold text-foreground">
            {t("move_to")}
          </span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {dropCategories.map((cat) => (
              <CategoryDropZone key={cat.id} id={cat.id} label={cat.label} isOver={overCategoryId === cat.id} />
            ))}
          </div>
        </div>
      )}
      <SortableContext items={displayRecipes.map((recipe) => recipe.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {displayRecipes.map((recipe, index) => (
            <SortableRecipeCard
              key={recipe.id}
              recipe={recipe}
              index={index}
              onPointerEnter={handleRecipePointerEnter}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeRecipe ? (
          <div className="w-56 rotate-3 shadow-2xl pointer-events-none">
            <PuzzleRecipeTile recipe={activeRecipe} index={0} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function CategoryDropZone({ id, label, isOver }: { id: string; label: string; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-12 rounded-full border-2 border-dashed px-6 py-3 text-base font-semibold shadow-sm transition-all",
        isOver
          ? "scale-110 border-primary bg-primary text-primary-foreground shadow-lg"
          : "border-muted-foreground/35 bg-card text-foreground hover:border-primary/60 hover:bg-primary/10"
      )}
    >
      {label}
    </div>
  );
}
