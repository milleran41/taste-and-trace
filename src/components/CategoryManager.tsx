import { useState } from "react";
import { Settings, Plus, Pencil, Trash2, GripVertical } from "lucide-react";
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
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !categories) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categories, oldIndex, newIndex);

    // Optimistic update
    queryClient.setQueryData(["categories"], reordered);

    // Persist new order
    const updates = reordered.map((cat, i) =>
      supabase.from("categories").update({ display_order: i }).eq("id", cat.id)
    );
    const results = await Promise.all(updates);
    const hasError = results.some((r) => r.error);
    if (hasError) {
      toast.error("Ошибка при сохранении порядка");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    }
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
              Добавляйте, редактируйте и удаляйте категории рецептов. Перетаскивайте для изменения порядка.
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

            {/* Sortable list */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={categories?.map((c) => c.id) ?? []} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {categories?.map((cat) => (
                    <SortableCategoryItem
                      key={cat.id}
                      id={cat.id}
                      label={cat.label}
                      isEditing={editingId === cat.id}
                      editLabel={editLabel}
                      onEditLabelChange={setEditLabel}
                      onStartEdit={() => startEdit(cat.id, cat.label)}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={() => handleUpdate(cat.id)}
                      onDelete={() => handleDelete(cat.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SortableCategoryItemProps {
  id: string;
  label: string;
  isEditing: boolean;
  editLabel: string;
  onEditLabelChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
}

function SortableCategoryItem({
  id,
  label,
  isEditing,
  editLabel,
  onEditLabelChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: SortableCategoryItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {isEditing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSaveEdit();
          }}
        >
          <Input
            value={editLabel}
            onChange={(e) => onEditLabelChange(e.target.value)}
            autoFocus
            className="h-8"
          />
          <Button type="submit" size="sm" disabled={!editLabel.trim()}>
            OK
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>
            ✕
          </Button>
        </form>
      ) : (
        <>
          <span className="flex-1 text-sm">{label}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStartEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}