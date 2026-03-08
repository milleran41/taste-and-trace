import { useState, useRef, useEffect } from "react";
import { X, Link2, Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useCategories } from "@/hooks/useCategories";
import { useCreateRecipe } from "@/hooks/useRecipes";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

type Stage = "idle" | "fetching" | "analyzing" | "formatting" | "done" | "error";

interface ParsedRecipe {
  title: string; description: string; ingredients: string[]; instructions: string[];
  cooking_time: string; servings: number; difficulty: string; tags: string[];
  notes: string; category_hint: string;
  source?: { sourceType: string; sourceUrl: string; sourcePlatform: string; };
  thumbnail?: string;
}

interface URLImportModalProps { open: boolean; onClose: () => void; }

export function URLImportModal({ open, onClose }: URLImportModalProps) {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [parsed, setParsed] = useState<ParsedRecipe | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    title: "", description: "", ingredients: "", instructions: "",
    cooking_time: "", servings: 4, difficulty: "", tags: "", notes: "", category: "",
  });

  const overlayRef = useRef<HTMLDivElement>(null);
  const { data: categories } = useCategories();
  const createRecipe = useCreateRecipe();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const STAGE_LABELS: Record<Stage, string> = {
    idle: "", fetching: t("fetching_text"), analyzing: t("analyzing_content"),
    formatting: t("formatting_recipe"), done: t("done"), error: t("error"),
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleImport = async () => {
    if (!url.trim()) return;
    setStage("fetching"); setErrorMsg(""); setParsed(null);
    let completed = false;
    const t1 = setTimeout(() => { if (!completed) setStage("analyzing"); }, 1500);
    const t2 = setTimeout(() => { if (!completed) setStage("formatting"); }, 4000);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-recipe-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ url: url.trim() }),
      });
      completed = true; clearTimeout(t1); clearTimeout(t2);
      if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || `${t("error")}: ${resp.status}`); }
      const data: ParsedRecipe = await resp.json();
      setParsed(data);
      setEditData({
        title: data.title || "", description: data.description || "",
        ingredients: (data.ingredients || []).join("\n"), instructions: (data.instructions || []).join("\n"),
        cooking_time: data.cooking_time || "", servings: data.servings || 4,
        difficulty: data.difficulty || "medium", tags: (data.tags || []).join(", "),
        notes: data.notes || "", category: "",
      });
      setStage("done");
    } catch (e) {
      completed = true; clearTimeout(t1); clearTimeout(t2);
      setStage("error"); setErrorMsg(e instanceof Error ? e.message : t("error"));
    }
  };

  const handleSave = async () => {
    const data = editMode ? editData : {
      title: parsed!.title, description: parsed!.description,
      ingredients: (parsed!.ingredients || []).join("\n"), instructions: (parsed!.instructions || []).join("\n"),
      cooking_time: parsed!.cooking_time, servings: parsed!.servings,
      difficulty: parsed!.difficulty, tags: (parsed!.tags || []).join(", "),
      notes: parsed!.notes, category: editData.category,
    };
    if (!data.category) { toast.error(t("please_select_category")); return; }
    try {
      const sourceData = parsed?.source;
      let finalNotes = data.notes || "";
      if (sourceData?.sourceUrl) {
        const urlLine = `\n${t("source")}: ${sourceData.sourceUrl}`;
        if (!finalNotes.includes(sourceData.sourceUrl)) {
          finalNotes = finalNotes ? finalNotes.trimEnd() + "\n" + urlLine : urlLine.trim();
        }
      }
      await createRecipe.mutateAsync({
        title: data.title, description: data.description,
        ingredients: data.ingredients.split("\n").filter(Boolean),
        instructions: data.instructions.split("\n").filter(Boolean),
        cooking_time: data.cooking_time, servings: data.servings,
        difficulty: data.difficulty,
        tags: data.tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes: finalNotes, category: data.category,
        image: parsed?.thumbnail || "", source: sourceData || null,
      } as any);
      onClose(); navigate("/");
    } catch { toast.error(t("error_saving_recipe")); }
  };

  const reset = () => { setUrl(""); setStage("idle"); setParsed(null); setEditMode(false); setErrorMsg(""); };

  if (!open) return null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="relative w-full max-w-2xl mx-4 rounded-xl border bg-card text-card-foreground shadow-xl animate-scale-in flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">{t("import_recipe")}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {stage === "idle" || stage === "error" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("paste_link")}</p>
              <div className="flex gap-2">
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="flex-1" />
                <Button onClick={handleImport} disabled={!url.trim()}>{t("process")}</Button>
              </div>
              {stage === "error" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{errorMsg}</span>
                </div>
              )}
            </div>
          ) : null}

          {(stage === "fetching" || stage === "analyzing" || stage === "formatting") && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="space-y-2 text-center">
                {(["fetching", "analyzing", "formatting"] as Stage[]).map((s) => (
                  <div key={s} className={`text-sm flex items-center gap-2 justify-center transition-opacity ${stage === s ? "text-foreground font-medium" : (["fetching", "analyzing", "formatting"].indexOf(stage) > ["fetching", "analyzing", "formatting"].indexOf(s)) ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                    {["fetching", "analyzing", "formatting"].indexOf(stage) > ["fetching", "analyzing", "formatting"].indexOf(s) ? <Check className="h-3.5 w-3.5 text-primary" /> : stage === s ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <div className="h-3.5 w-3.5" />}
                    {STAGE_LABELS[s]}
                  </div>
                ))}
              </div>
            </div>
          )}

          {stage === "done" && parsed && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/50 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <span>{t("auto_created_check")}</span>
              </div>

              {!editMode ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">{parsed.title}</CardTitle>
                    {parsed.description && <p className="text-sm text-muted-foreground">{parsed.description}</p>}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {parsed.thumbnail && <div className="aspect-video overflow-hidden rounded-lg"><img src={parsed.thumbnail} alt={parsed.title} className="w-full h-full object-cover" /></div>}
                    <div className="flex flex-wrap gap-2">
                      {parsed.cooking_time && <Badge variant="outline">⏱ {parsed.cooking_time}</Badge>}
                      {parsed.servings && <Badge variant="outline">👥 {parsed.servings}</Badge>}
                      {parsed.difficulty && <Badge variant="outline">{parsed.difficulty}</Badge>}
                    </div>
                    {parsed.ingredients?.length > 0 && <div><h4 className="font-medium mb-1.5 text-sm">{t("ingredients")}</h4><ul className="text-sm space-y-1">{parsed.ingredients.map((ing, i) => <li key={i} className="flex gap-2"><span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-primary flex-shrink-0" />{ing}</li>)}</ul></div>}
                    {parsed.instructions?.length > 0 && <div><h4 className="font-medium mb-1.5 text-sm">{t("cooking")}</h4><ol className="text-sm space-y-1.5">{parsed.instructions.map((step, i) => <li key={i} className="flex gap-2"><span className="text-primary font-medium">{i + 1}.</span>{step}</li>)}</ol></div>}
                    {parsed.tags?.length > 0 && <div className="flex flex-wrap gap-1.5">{parsed.tags.map((tag, i) => <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>)}</div>}
                    {parsed.notes && <p className="text-xs text-muted-foreground italic">{parsed.notes}</p>}
                    {parsed.source?.sourceUrl && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                        <Link2 className="h-3.5 w-3.5" /><span>{t("source")}:</span>
                        <a href={parsed.source.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate max-w-[300px]">
                          {parsed.source.sourcePlatform === "youtube" ? "YouTube" : parsed.source.sourcePlatform === "tiktok" ? "TikTok" : new URL(parsed.source.sourceUrl).hostname}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  <div><Label>{t("title")}</Label><Input value={editData.title} onChange={(e) => setEditData({ ...editData, title: e.target.value })} /></div>
                  <div><Label>{t("description")}</Label><Textarea value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} rows={2} /></div>
                  <div><Label>{t("ingredients_per_line")}</Label><Textarea value={editData.ingredients} onChange={(e) => setEditData({ ...editData, ingredients: e.target.value })} rows={5} /></div>
                  <div><Label>{t("instructions_per_line")}</Label><Textarea value={editData.instructions} onChange={(e) => setEditData({ ...editData, instructions: e.target.value })} rows={5} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t("time")}</Label><Input value={editData.cooking_time} onChange={(e) => setEditData({ ...editData, cooking_time: e.target.value })} /></div>
                    <div><Label>{t("servings")}</Label><Input type="number" value={editData.servings} onChange={(e) => setEditData({ ...editData, servings: parseInt(e.target.value) || 1 })} /></div>
                  </div>
                  <div><Label>{t("difficulty")}</Label><Select value={editData.difficulty} onValueChange={(v) => setEditData({ ...editData, difficulty: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="easy">{t("easy")}</SelectItem><SelectItem value="medium">{t("medium")}</SelectItem><SelectItem value="hard">{t("hard")}</SelectItem></SelectContent></Select></div>
                  <div><Label>{t("tags")}</Label><Input value={editData.tags} onChange={(e) => setEditData({ ...editData, tags: e.target.value })} /></div>
                  <div><Label>{t("notes")}</Label><Textarea value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} rows={2} /></div>
                </div>
              )}

              <div>
                <Label>{t("category")} *</Label>
                <Select value={editData.category} onValueChange={(v) => setEditData({ ...editData, category: v })}>
                  <SelectTrigger><SelectValue placeholder={t("select_category")} /></SelectTrigger>
                  <SelectContent>{categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                {parsed.category_hint && <p className="text-xs text-muted-foreground mt-1">{t("ai_hint")}: {parsed.category_hint}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex gap-2 justify-end">
          {stage === "done" && parsed && (
            <>
              <Button variant="outline" onClick={reset}>{t("cancel")}</Button>
              <Button variant="outline" onClick={() => setEditMode(!editMode)}>{editMode ? t("preview") : t("edit")}</Button>
              <Button onClick={handleSave} disabled={createRecipe.isPending}>{createRecipe.isPending ? t("saving") : t("save")}</Button>
            </>
          )}
          {stage === "error" && <Button variant="outline" onClick={reset}>{t("try_again")}</Button>}
        </div>
      </div>
    </div>
  );
}
