// Граммы на единицу меры для популярных ингредиентов
export interface IngredientMeasure {
  name: string;
  tablespoon: number; // граммов в 1 ст. ложке
  teaspoon: number;   // граммов в 1 ч. ложке
  glass: number;      // граммов в 1 стакане (250 мл)
  pinch: number;      // граммов в 1 щепотке
}

export const ingredientMeasures: IngredientMeasure[] = [
  { name: "Мука пшеничная", tablespoon: 25, teaspoon: 8, glass: 160, pinch: 1 },
  { name: "Сахар",          tablespoon: 25, teaspoon: 8, glass: 200, pinch: 1 },
  { name: "Соль",           tablespoon: 30, teaspoon: 10, glass: 320, pinch: 0.5 },
  { name: "Масло растит.",  tablespoon: 17, teaspoon: 5, glass: 230, pinch: 0 },
  { name: "Масло сливочное",tablespoon: 20, teaspoon: 6, glass: 210, pinch: 0 },
  { name: "Крахмал",        tablespoon: 25, teaspoon: 8, glass: 160, pinch: 1 },
  { name: "Какао",          tablespoon: 15, teaspoon: 5, glass: 130, pinch: 1 },
  { name: "Рис",            tablespoon: 20, teaspoon: 7, glass: 230, pinch: 0 },
  { name: "Манка",          tablespoon: 16, teaspoon: 5, glass: 190, pinch: 0 },
  { name: "Мёд",            tablespoon: 30, teaspoon: 10, glass: 330, pinch: 0 },
  { name: "Сметана",        tablespoon: 25, teaspoon: 8, glass: 250, pinch: 0 },
  { name: "Молоко",         tablespoon: 18, teaspoon: 5, glass: 250, pinch: 0 },
  { name: "Вода",           tablespoon: 18, teaspoon: 5, glass: 250, pinch: 0 },
];

export type MeasureKey = "tablespoon" | "teaspoon" | "glass" | "pinch";

export const measureLabels: Record<MeasureKey, string> = {
  tablespoon: "Ст. ложка",
  teaspoon: "Ч. ложка",
  glass: "Стакан",
  pinch: "Щепотка",
};
