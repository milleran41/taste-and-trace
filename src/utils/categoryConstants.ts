import { Category } from "@/types/recipe";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "default_first_courses", label: "Первые блюда", display_order: 1, created_at: null },
  { id: "default_second_courses", label: "Вторые блюда", display_order: 2, created_at: null },
  { id: "default_desserts", label: "Десерты", display_order: 3, created_at: null },
  { id: "default_drinks", label: "Напитки", display_order: 4, created_at: null },
  { id: "default_baked_goods", label: "Мучные изделия", display_order: 5, created_at: null },
  { id: "default_misc", label: "Разное", display_order: 6, created_at: null },
];

export const isDefaultCategory = (id: string) => id.startsWith("default_");
