import { useState, useRef } from "react";
import { Wand2, Upload, FileText, Image, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

interface ParsedRecipe {
  title?: string; description?: string; ingredients?: string[]; instructions?: string[];
  cooking_time?: string; servings?: number; difficulty?: string; tags?: string[];
  notes?: string; has_dish_photo?: boolean;
}

interface RecipeParserDialogProps {
  onParsed: (data: {
    title: string; description: string; ingredients: string; instructions: string;
    cooking_time: string; servings: number; difficulty: string; tags: string;
    notes: string; image?: string; screenshotToAdd?: string;
  }) => void;
}

export function RecipeParserDialog({ onParsed }: RecipeParserDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleImageSelect(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (item) { const file = item.getAsFile(); if (file) handleImageSelect(file); }
  };

  const parseText = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-recipe", { body: { text } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      applyParsed(data as ParsedRecipe);
      setOpen(false);
      toast.success(t("recipe_recognized"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_recognizing"));
    } finally { setLoading(false); }
  };

  const parseImage = async () => {
    if (!imageFile) return;
    setLoading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { const result = reader.result as string; resolve(result.split(",")[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
      const { data, error } = await supabase.functions.invoke("parse-recipe", { body: { imageBase64: base64, imageMediaType: imageFile.type } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const parsed = data as ParsedRecipe;
      const screenshotToAdd = imagePreview ?? undefined;
      applyParsed(parsed, screenshotToAdd);
      setOpen(false);
      toast.success(t("recipe_recognized_photo"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_recognizing_photo"));
    } finally { setLoading(false); }
  };

  const applyParsed = (parsed: ParsedRecipe, screenshotDataUrl?: string) => {
    onParsed({
      title: parsed.title ?? "", description: parsed.description ?? "",
      ingredients: (parsed.ingredients ?? []).join("\n"), instructions: (parsed.instructions ?? []).join("\n"),
      cooking_time: parsed.cooking_time ?? "", servings: parsed.servings ?? 4,
      difficulty: parsed.difficulty ?? "", tags: (parsed.tags ?? []).join(", "),
      notes: parsed.notes ?? "", image: "", screenshotToAdd: screenshotDataUrl,
    });
  };

  const clearImage = () => { setImageFile(null); setImagePreview(null); };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" type="button"><Wand2 className="h-4 w-4 mr-2" />{t("recognize_recipe")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("recognize_recipe_ai")}</DialogTitle></DialogHeader>
        <Tabs defaultValue="photo">
          <TabsList className="w-full">
            <TabsTrigger value="photo" className="flex-1"><Image className="h-4 w-4 mr-2" />{t("photo")}</TabsTrigger>
            <TabsTrigger value="text" className="flex-1"><FileText className="h-4 w-4 mr-2" />{t("text")}</TabsTrigger>
          </TabsList>
          <TabsContent value="photo" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">{t("ai_recognize_photo")}</p>
            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="Preview" className="w-full max-h-64 object-contain rounded-lg border" />
                <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 bg-background/80" onClick={clearImage}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors" onDrop={handleFileDrop} onDragOver={(e) => e.preventDefault()} onPaste={handlePaste} onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("click_drag_paste")}</p>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageSelect(file); }} />
              </div>
            )}
            <Button className="w-full" disabled={!imageFile || loading} onClick={parseImage} type="button">
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("recognizing")}</> : <><Wand2 className="h-4 w-4 mr-2" />{t("recognize")}</>}
            </Button>
          </TabsContent>
          <TabsContent value="text" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">{t("paste_recipe_text")}</p>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("paste_recipe_here")} rows={10} />
            <Button className="w-full" disabled={!text.trim() || loading} onClick={parseText} type="button">
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("recognizing")}</> : <><Wand2 className="h-4 w-4 mr-2" />{t("recognize")}</>}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
