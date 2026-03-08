import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Clock, Users, Heart, Edit, Trash2, ChefHat, ExternalLink, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useRecipe, useDeleteRecipe, useToggleFavorite } from "@/hooks/useRecipes";
import { useCategories } from "@/hooks/useCategories";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, lazy, Suspense } from "react";
import { Scale, Bot, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

const MeasuresModal = lazy(() => import("@/components/MeasuresModal").then(m => ({ default: m.MeasuresModal })));
const AssistantModal = lazy(() => import("@/components/AssistantModal").then(m => ({ default: m.AssistantModal })));
const GuideModal = lazy(() => import("@/components/GuideModal").then(m => ({ default: m.GuideModal })));

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [measuresOpen, setMeasuresOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const { t } = useTranslation();

  const { data: recipe, isLoading } = useRecipe(id!);
  const { data: categories } = useCategories();
  const deleteRecipe = useDeleteRecipe();
  const toggleFavorite = useToggleFavorite();

  const categoryLabel = categories?.find((c) => c.id === recipe?.category)?.label;

  const handleDelete = async () => {
    if (!id) return;
    await deleteRecipe.mutateAsync(id);
    navigate("/");
  };

  const handleToggleFavorite = () => {
    if (!recipe) return;
    toggleFavorite.mutate({ id: recipe.id, isFavorite: !recipe.is_favorite });
  };

  const handlePrint = () => {
    if (!recipe) return;
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${recipe.title} — YumBook</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 700px; margin: 0 auto; padding: 2rem; color: #1a1a1a; }
        h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
        .meta { color: #666; margin-bottom: 1.5rem; font-size: 0.95rem; }
        h2 { font-size: 1.2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.3rem; margin-top: 1.5rem; }
        ul, ol { padding-left: 1.25rem; }
        li { margin-bottom: 0.4rem; }
        .notes { white-space: pre-wrap; margin-top: 1rem; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>${recipe.title}</h1>
      <div class="meta">
        ${recipe.cooking_time ? '⏱ ' + recipe.cooking_time + '  ' : ''}${recipe.servings ? '👥 ' + recipe.servings + ' ' + t("servings").toLowerCase() : ''}
      </div>
      ${recipe.description ? '<p>' + recipe.description + '</p>' : ''}
      ${ingredients.length > 0 ? '<h2>' + t("ingredients") + '</h2><ul>' + ingredients.map(i => '<li>' + String(i) + '</li>').join('') + '</ul>' : ''}
      ${instructions.length > 0 ? '<h2>' + t("cooking") + '</h2><ol>' + instructions.map(s => '<li>' + String(s) + '</li>').join('') + '</ol>' : ''}
      ${recipe.notes ? '<h2>' + t("notes") + '</h2><div class="notes">' + recipe.notes + '</div>' : ''}
      </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="aspect-video w-full max-w-3xl rounded-xl mb-8" />
          <Skeleton className="h-10 w-3/4 mb-4" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold mb-2">{t("recipe_not_found")}</h1>
          <Button asChild>
            <Link to="/">{t("go_home")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];
  const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
  const screenshots = Array.isArray(recipe.screenshots) ? recipe.screenshots.map(String) : [];
  const mainImage = recipe.image || (screenshots.length > 0 ? screenshots[0] : null);

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("back")}
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setGuideOpen(true)} title={t("guide")}>
              <HelpCircle className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setAssistantOpen((v) => !v)} title={t("assistant")}>
              <Bot className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMeasuresOpen((v) => !v)} title={t("measures")}>
              <Scale className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handlePrint} title={t("print")}>
              <Printer className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleToggleFavorite} className={cn(recipe.is_favorite && "text-destructive")}>
              <Heart className={cn("h-5 w-5", recipe.is_favorite && "fill-current")} />
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/edit/${recipe.id}`}>
                <Edit className="h-4 w-4 mr-2" />
                {t("edit")}
              </Link>
            </Button>
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("delete")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("delete_recipe")}</DialogTitle>
                  <DialogDescription>{t("delete_recipe_confirm")}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>{t("cancel")}</Button>
                  <Button variant="destructive" onClick={handleDelete}>{t("delete")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {mainImage ? (
              <div className="aspect-video overflow-hidden rounded-xl">
                <img src={mainImage} alt={recipe.title} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="aspect-video rounded-xl bg-muted flex items-center justify-center">
                <ChefHat className="h-16 w-16 text-muted-foreground" />
              </div>
            )}

            {screenshots.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {screenshots.slice(1).map((src, i) => (
                  <img key={i} src={src} alt={`${t("screenshot")} ${i + 2}`} className="h-24 w-24 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open(src, '_blank')} />
                ))}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-2">
                {categoryLabel && <Badge variant="secondary">{categoryLabel}</Badge>}
                {recipe.difficulty && <Badge variant="outline">{recipe.difficulty}</Badge>}
              </div>
              <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">{recipe.title}</h1>
              {recipe.description && <p className="text-lg text-muted-foreground">{recipe.description}</p>}
            </div>

            <div className="flex flex-wrap gap-4 text-muted-foreground">
              {recipe.cooking_time && (
                <div className="flex items-center gap-2"><Clock className="h-5 w-5" /><span>{recipe.cooking_time}</span></div>
              )}
              {recipe.servings && (
                <div className="flex items-center gap-2"><Users className="h-5 w-5" /><span>{t("servings_count", { count: recipe.servings })}</span></div>
              )}
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, index) => <Badge key={index} variant="outline">{String(tag)}</Badge>)}
              </div>
            )}

            {instructions.length > 0 && (
              <Card>
                <CardHeader><CardTitle>{t("cooking")}</CardTitle></CardHeader>
                <CardContent>
                  <ol className="space-y-4">
                    {instructions.map((step, index) => (
                      <li key={index} className="flex gap-4">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">{index + 1}</span>
                        <p className="pt-1">{String(step)}</p>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )}

            {recipe.notes && (
              <Card>
                <CardHeader><CardTitle>{t("notes")}</CardTitle></CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">
                    {recipe.notes.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                      /^https?:\/\//.test(part) ? (
                        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80 break-all">{part}</a>
                      ) : (<span key={i}>{part}</span>)
                    )}
                  </p>
                </CardContent>
              </Card>
            )}

            {(() => {
              const source = recipe.source as any;
              if (!source?.sourceUrl) return null;
              const platformLabel =
                source.sourcePlatform === "youtube" ? "YouTube" :
                source.sourcePlatform === "tiktok" ? "TikTok" :
                source.sourcePlatform === "instagram" ? "Instagram" :
                (() => { try { return new URL(source.sourceUrl).hostname; } catch { return t("source"); } })();
              return (
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-2 text-sm">
                      <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground">{t("source")}:</span>
                      <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80 truncate">{platformLabel}</a>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          <div className="lg:col-span-1">
            {ingredients.length > 0 && (
              <Card className="sticky top-24">
                <CardHeader><CardTitle>{t("ingredients")}</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {ingredients.map((ingredient, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="w-2 h-2 mt-2 rounded-full bg-primary flex-shrink-0" />
                        <span>{String(ingredient)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      <Suspense fallback={null}>
        {measuresOpen && <MeasuresModal open={measuresOpen} onClose={() => setMeasuresOpen(false)} />}
        {recipe && assistantOpen && <AssistantModal open={assistantOpen} onClose={() => setAssistantOpen(false)} recipe={recipe} />}
        {guideOpen && <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />}
      </Suspense>
    </div>
  );
}
