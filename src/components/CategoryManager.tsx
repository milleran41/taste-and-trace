import { useState } from "react";
import { Settings, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useCategories } from "@/hooks/useCategories";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function CategoryManager() {
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const { data: categories } = useCategories();
  const queryClient = useQueryClient();

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) return;

    const maxOrder = categories?.reduce((max, c) => Math.max(max, c.display_order ?? 0), -1) ?? -1;

    const { error } = await supabase
      .from("categories")
      .insert({ label, display_order: maxOrder + 1 });

    if (error) {
      toast.error("Ошибка при добавлении категории");
      return;
    }

    setNewLabel("");
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    toast.success("Категория добавлена");
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      toast.error("Ошибка при удалении категории");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    toast.success("Категория удалена");
  };

  const handleUpdate = async (id: string) => {
    const label = editLabel.trim();
    if (!label) return;

    const { error } = await supabase
      .from("categories")
      .update({ label })
      .eq("id", id);

    if (error) {
      toast.error("Ошибка при обновлении категории");
      return;
    }

    setEditingId(null);
    setEditLabel("");
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    toast.success("Категория обновлена");
  };

  const startEdit = (id: string, label: string) => {
    setEditingId(id);
    setEditLabel(label);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full shrink-0"
        onClick={() => setOpen(true)}
        title="Управление категориями"
      >
        <Settings className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Управление категориями</DialogTitle>
            <DialogDescription>
              Добавляйте, редактируйте и удаляйте категории рецептов
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Add new */}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd();
              }}
            >
              <Input
                placeholder="Новая категория..."
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <Button type="submit" size="icon" disabled={!newLabel.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </form>

            {/* List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {categories?.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                >
                  {editingId === cat.id ? (
                    <form
                      className="flex flex-1 gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleUpdate(cat.id);
                      }}
                    >
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        autoFocus
                        className="h-8"
                      />
                      <Button type="submit" size="sm" disabled={!editLabel.trim()}>
                        OK
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        ✕
                      </Button>
                    </form>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{cat.label}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEdit(cat.id, cat.label)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(cat.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
