// Граммы на единицу меры для популярных ингредиентов
export interface IngredientMeasure {
  id: string;
  name: string;
  tablespoon: number; // граммов в 1 ст. ложке
  teaspoon: number;   // граммов в 1 ч. ложке
  glass: number;      // граммов в 1 стакане (250 мл)
  pinch: number;      // граммов в 1 щепотке
}

export const ingredientMeasures: IngredientMeasure[] = [
  { id: "ing_wheat_flour", name: "Мука пшеничная", tablespoon: 25, teaspoon: 8, glass: 160, pinch: 1 },
  { id: "ing_sugar", name: "Сахар",          tablespoon: 25, teaspoon: 8, glass: 200, pinch: 1 },
  { id: "ing_salt", name: "Соль",           tablespoon: 30, teaspoon: 10, glass: 320, pinch: 0.5 },
  { id: "ing_veg_oil", name: "Масло растит.",  tablespoon: 17, teaspoon: 6, glass: 230, pinch: 0 },
  { id: "ing_butter", name: "Масло сливочное",tablespoon: 20, teaspoon: 7, glass: 210, pinch: 0 },
  { id: "ing_starch", name: "Крахмал",        tablespoon: 25, teaspoon: 8, glass: 160, pinch: 1 },
  { id: "ing_cocoa", name: "Какао",          tablespoon: 15, teaspoon: 5, glass: 130, pinch: 1 },
  { id: "ing_rice", name: "Рис",            tablespoon: 20, teaspoon: 7, glass: 230, pinch: 0 },
  { id: "ing_semolina", name: "Манка",          tablespoon: 16, teaspoon: 5, glass: 190, pinch: 0 },
  { id: "ing_honey", name: "Мёд",            tablespoon: 30, teaspoon: 10, glass: 330, pinch: 0 },
  { id: "ing_sour_cream", name: "Сметана",        tablespoon: 25, teaspoon: 8, glass: 250, pinch: 0 },
  { id: "ing_milk", name: "Молоко",         tablespoon: 18, teaspoon: 6, glass: 250, pinch: 0 },
  { id: "ing_water", name: "Вода",           tablespoon: 18, teaspoon: 6, glass: 250, pinch: 0 },
];

export type MeasureKey = "tablespoon" | "teaspoon" | "glass" | "pinch";

export const measureLabels: Record<MeasureKey, string> = {
  tablespoon: "Ст. ложка",
  teaspoon: "Ч. ложка",
  glass: "Стакан",
  pinch: "Щепотка",
};
