import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock, Users, Heart, Edit, Trash2, ChefHat, ExternalLink, Printer, Bot, HelpCircle, Scale, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRecipe, useCreateRecipe, useDeleteRecipe, useRecipeVersions, useToggleFavorite } from "@/hooks/useRecipes";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { APP_LANGUAGES, getLanguageLabel } from "@/utils/languages";
import { cleanRecipeSections } from "@/utils/recipeContent";
import { buildTranslationSource, forgetRecipeVersion, getRecipeTranslationGroupId, getRecipeVersionMeta, getRememberedRecipeVersion, rememberRecipeVersion } from "@/utils/recipeVersions";
import { translateRecipeWithAssistantBackend } from "@/services/aiService";

const MeasuresModal = lazy(() => import("@/components/MeasuresModal").then(m => ({ default: m.MeasuresModal })));
const AssistantModal = lazy(() => import("@/components/AssistantModal").then(m => ({ default: m.AssistantModal })));
const GuideModal = lazy(() => import("@/components/GuideModal").then(m => ({ default: m.GuideModal })));

type TranslationDraft = {
  title: string;
  description: string;
  ingredients: string;
  instructions: string;
  cooking_time: string;
  servings: string;
  difficulty: string;
  tags: string;
  notes: string;
};

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [measuresOpen, setMeasuresOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("ru");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedDraft, setTranslatedDraft] = useState<TranslationDraft | null>(null);
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  const { data: recipe, isLoading, error } = useRecipe(id!);
  const { data: recipeVersions = [], isLoading: areRecipeVersionsLoading } = useRecipeVersions(recipe);
  const createRecipe = useCreateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const toggleFavorite = useToggleFavorite();

  // ✅ Убрали загрузку категорий и расчет categoryLabel — они больше не нужны на этой странице

  const handleDelete = async (deleteAllVersions = false) => {
    if (!recipe) return;
    const groupId = getRecipeTranslationGroupId(recipe);
    const idsToDelete = deleteAllVersions
      ? Array.from(new Set(recipeVersions.map((version) => version.id).filter(Boolean)))
      : [recipe.id];
    await deleteRecipe.mutateAsync(idsToDelete);
    if (deleteAllVersions || idsToDelete.includes(getRememberedRecipeVersion(groupId) || "")) {
      forgetRecipeVersion(groupId);
    }
    navigate("/");
  };

  const handleToggleFavorite = () => {
    if (!recipe) return;
    toggleFavorite.mutate({ id: recipe.id, isFavorite: !recipe.is_favorite });
  };

  useEffect(() => {
    if (!recipe || areRecipeVersionsLoading) return;
    const groupId = getRecipeTranslationGroupId(recipe);
    const rememberedId = getRememberedRecipeVersion(groupId);
    if (recipe.id === groupId && rememberedId && rememberedId !== recipe.id) {
      const rememberedVersionExists = recipeVersions.some((version) => version.id === rememberedId);
      if (rememberedVersionExists) {
        navigate(`/recipe/${rememberedId}`, { replace: true });
        return;
      }
    }
    rememberRecipeVersion(groupId, recipe.id);
  }, [areRecipeVersionsLoading, navigate, recipe, recipeVersions]);

  const switchToVersion = (recipeId: string) => {
    if (!recipe || !recipeId || recipeId === recipe.id) return;
    rememberRecipeVersion(getRecipeTranslationGroupId(recipe), recipeId);
    navigate(`/recipe/${recipeId}`);
  };

  useEffect(() => {
    if (!translateDialogOpen) {
      setTranslatedDraft(null);
    }
  }, [translateDialogOpen]);

  useEffect(() => {
    setTranslatedDraft(null);
  }, [targetLanguage]);

  const updateTranslatedDraft = (field: keyof TranslationDraft, value: string) => {
    setTranslatedDraft((draft) => draft ? { ...draft, [field]: value } : draft);
  };

  const handleTranslateRecipe = async () => {
    if (!recipe || isTranslating) return;

    const existingVersion = recipeVersions.find((version) => getRecipeVersionMeta(version).language === targetLanguage);
    if (existingVersion) {
      switchToVersion(existingVersion.id);
      setTranslateDialogOpen(false);
      return;
    }

    try {
      setIsTranslating(true);
      const startedAt = performance.now();
      const sourceSections = cleanRecipeSections(recipe.ingredients, recipe.instructions);
      const translationResult = await translateRecipeWithAssistantBackend({
        targetLanguage,
        recipe: {
          title: recipe.title,
          description: recipe.description,
          ingredients: sourceSections.ingredients,
          instructions: sourceSections.instructions,
          cooking_time: recipe.cooking_time,
          servings: recipe.servings,
          difficulty: recipe.difficulty,
          tags: recipe.tags,
          notes: recipe.notes,
          category_hint: recipe.category,
        },
      });
      console.info("Recipe translation via assistant backend finished in", Math.round(performance.now() - startedAt), "ms");
      if (!translationResult.recipe) {
        throw new Error(tr("recipe_translation_failed", "Translation failed"));
      }
      const data = translationResult.recipe;

      if (translationResult.quality?.needs_review) {
        console.warn("Local recipe translation needs review:", translationResult.quality.warnings || []);
      }

      setTranslatedDraft({
        title: String(data?.title || recipe.title),
        description: String(data?.description || recipe.description || ""),
        cooking_time: String(data?.cooking_time || recipe.cooking_time || ""),
        difficulty: String(data?.difficulty || recipe.difficulty || "medium"),
        servings: String(data?.servings || recipe.servings || 1),
        ingredients: Array.isArray(data?.ingredients) ? data.ingredients.map(String).join("\n") : "",
        instructions: Array.isArray(data?.instructions) ? data.instructions.map(String).join("\n") : "",
        notes: String(data?.notes || ""),
        tags: Array.isArray(data?.tags) ? data.tags.map(String).join(", ") : "",
      });
    } catch (translationError) {
      console.error("Recipe translation failed:", translationError);
      toast.error(translationError instanceof Error ? translationError.message : tr("recipe_translation_failed", "Translation failed"));
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSaveTranslatedRecipe = async () => {
    if (!recipe || !translatedDraft || createRecipe.isPending) return;

    try {
      const translatedRecipe = await createRecipe.mutateAsync({
        title: translatedDraft.title.trim() || recipe.title,
        description: translatedDraft.description.trim(),
        category: recipe.category,
        cooking_time: translatedDraft.cooking_time.trim(),
        difficulty: translatedDraft.difficulty || recipe.difficulty || "medium",
        servings: Number(translatedDraft.servings) || recipe.servings || 1,
        ingredients: translatedDraft.ingredients.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        instructions: translatedDraft.instructions.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        notes: translatedDraft.notes.trim(),
        tags: translatedDraft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        image: recipe.image || "",
        screenshots: Array.isArray(recipe.screenshots) ? recipe.screenshots.map(String) : [],
        source: buildTranslationSource(recipe, targetLanguage),
      });

      const newRecipeId = (translatedRecipe as any)?.id;
      if (newRecipeId) {
        rememberRecipeVersion(getRecipeTranslationGroupId(recipe), newRecipeId);
        navigate(`/recipe/${newRecipeId}`);
      }
      setTranslateDialogOpen(false);
      toast.success(tr("recipe_translation_saved", "Translation saved"));
    } catch (translationError) {
      console.error("Recipe translation save failed:", translationError);
      toast.error(tr("recipe_translation_failed", "Translation failed"));
    }
  };

  const handlePrint = () => {
    if (!recipe) return;
    const cleanedSections = cleanRecipeSections(recipe.ingredients, recipe.instructions);
    const ingredients = cleanedSections.ingredients;
    const instructions = cleanedSections.instructions;
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

  if (error || !recipe) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold mb-2">
            {error ? t("error_occurred") : t("recipe_not_found")}
          </h1>
          {error && (
            <p className="text-muted-foreground max-w-md mb-4">
              {error instanceof Error ? error.message : t("error")}
            </p>
          )}
          <Button asChild>
            <Link to="/">{t("go_home")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const recipeTitle = typeof recipe.title === "string" ? recipe.title : "";
  const recipeDescription = typeof recipe.description === "string" ? recipe.description : "";
  const recipeNotes = typeof recipe.notes === "string" ? recipe.notes : "";
  const recipeCookingTime = typeof recipe.cooking_time === "string" ? recipe.cooking_time : "";
  const cleanedSections = cleanRecipeSections(recipe.ingredients, recipe.instructions);
  const ingredients = cleanedSections.ingredients;
  const instructions = cleanedSections.instructions;
  const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
  const screenshots = Array.isArray(recipe.screenshots) ? recipe.screenshots.map(String) : [];
  const mainImage = typeof recipe.image === "string" && recipe.image ? recipe.image : (screenshots.length > 0 ? screenshots[0] : null);
  const currentVersionMeta = getRecipeVersionMeta(recipe);
  const versionIndex = recipeVersions.findIndex((version) => version.id === recipe.id);
  const previousVersion = versionIndex > 0 ? recipeVersions[versionIndex - 1] : recipeVersions[recipeVersions.length - 1];
  const nextVersion = versionIndex >= 0 && versionIndex < recipeVersions.length - 1 ? recipeVersions[versionIndex + 1] : recipeVersions[0];
  const hasRecipeVersions = recipeVersions.length > 1;
  const isDeletingRecipe = deleteRecipe.isPending;

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
            {hasRecipeVersions && previousVersion && (
              <Button variant="ghost" size="icon" onClick={() => switchToVersion(previousVersion.id)} title={`${tr("previous_version", "Previous version")}: ${getLanguageLabel(getRecipeVersionMeta(previousVersion).language)}`}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            {hasRecipeVersions && (
              <Badge variant="outline">
                {currentVersionMeta.isTranslation ? getLanguageLabel(currentVersionMeta.language) : tr("original", "Original")}
              </Badge>
            )}
            {hasRecipeVersions && nextVersion && (
              <Button variant="ghost" size="icon" onClick={() => switchToVersion(nextVersion.id)} title={`${tr("next_version", "Next version")}: ${getLanguageLabel(getRecipeVersionMeta(nextVersion).language)}`}>
                <ArrowRight className="h-5 w-5" />
              </Button>
            )}
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
            <Button variant="ghost" size="icon" onClick={() => setTranslateDialogOpen(true)} title={tr("translate_recipe", "Translate")}>
              <Languages className="h-5 w-5" />
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
                  <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeletingRecipe}>{t("cancel")}</Button>
                  {hasRecipeVersions && (
                    <Button variant="outline" onClick={() => handleDelete(false)} disabled={isDeletingRecipe}>
                      {tr("delete_this_version", "Delete this version")}
                    </Button>
                  )}
                  <Button variant="destructive" onClick={() => handleDelete(hasRecipeVersions)} disabled={isDeletingRecipe}>
                    {hasRecipeVersions ? tr("delete_all_versions", "Delete all versions") : t("delete")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <Dialog open={translateDialogOpen} onOpenChange={setTranslateDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{tr("translate_recipe", "Translate recipe")}</DialogTitle>
              <DialogDescription>
                {tr("translate_recipe_description", "Create a linked version of this recipe in another language. The image and source link will stay shared.")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {!translatedDraft ? (
                <>
                  <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APP_LANGUAGES.map((language) => (
                        <SelectItem key={language.code} value={language.code}>
                          {language.flag} {language.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {recipeVersions.some((version) => getRecipeVersionMeta(version).language === targetLanguage) && (
                    <p className="text-sm text-muted-foreground">
                      {tr("translation_already_exists", "This translation already exists. The button will open it.")}
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="translation-title">{t("title")}</Label>
                    <Input id="translation-title" value={translatedDraft.title} onChange={(event) => updateTranslatedDraft("title", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="translation-description">{t("description")}</Label>
                    <Textarea id="translation-description" value={translatedDraft.description} onChange={(event) => updateTranslatedDraft("description", event.target.value)} rows={3} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="translation-time">{t("cooking_time")}</Label>
                      <Input id="translation-time" value={translatedDraft.cooking_time} onChange={(event) => updateTranslatedDraft("cooking_time", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="translation-servings">{t("servings")}</Label>
                      <Input id="translation-servings" type="number" min="1" value={translatedDraft.servings} onChange={(event) => updateTranslatedDraft("servings", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("difficulty")}</Label>
                      <Select value={translatedDraft.difficulty} onValueChange={(value) => updateTranslatedDraft("difficulty", value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">{t("easy")}</SelectItem>
                          <SelectItem value="medium">{t("medium")}</SelectItem>
                          <SelectItem value="hard">{t("hard")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="translation-ingredients">{t("ingredients")}</Label>
                    <Textarea id="translation-ingredients" value={translatedDraft.ingredients} onChange={(event) => updateTranslatedDraft("ingredients", event.target.value)} rows={8} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="translation-instructions">{t("cooking")}</Label>
                    <Textarea id="translation-instructions" value={translatedDraft.instructions} onChange={(event) => updateTranslatedDraft("instructions", event.target.value)} rows={10} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="translation-tags">{t("tags")}</Label>
                    <Input id="translation-tags" value={translatedDraft.tags} onChange={(event) => updateTranslatedDraft("tags", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="translation-notes">{t("notes")}</Label>
                    <Textarea id="translation-notes" value={translatedDraft.notes} onChange={(event) => updateTranslatedDraft("notes", event.target.value)} rows={4} />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTranslateDialogOpen(false)} disabled={isTranslating}>
                {t("cancel")}
              </Button>
              {translatedDraft ? (
                <>
                  <Button variant="outline" onClick={() => setTranslatedDraft(null)} disabled={createRecipe.isPending}>
                    {t("back")}
                  </Button>
                  <Button onClick={handleSaveTranslatedRecipe} disabled={createRecipe.isPending}>
                    {createRecipe.isPending ? tr("saving_translation", "Saving...") : tr("save_translation", "Save translation")}
                  </Button>
                </>
              ) : (
                <Button onClick={handleTranslateRecipe} disabled={isTranslating || createRecipe.isPending}>
                  {isTranslating ? tr("translating_recipe", "Translating...") : tr("translate_recipe", "Translate recipe")}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {mainImage ? (
              <div className="aspect-video overflow-hidden rounded-xl">
                <img src={mainImage} alt={recipeTitle} className="w-full h-full object-cover" />
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
              {/* ✅ Убрали блок с бейджем категории */}
              <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">{recipeTitle}</h1>
              {recipeDescription && <p className="text-lg text-muted-foreground">{recipeDescription}</p>}
            </div>

            <div className="flex flex-wrap gap-4 text-muted-foreground">
              {recipeCookingTime && (
                <div className="flex items-center gap-2"><Clock className="h-5 w-5" /><span>{recipeCookingTime}</span></div>
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

            {recipeNotes && (
              <Card>
                <CardHeader><CardTitle>{t("notes")}</CardTitle></CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">
                    {recipeNotes.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
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
