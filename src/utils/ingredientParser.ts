/**
 * Ingredient parsing utilities.
 */

export interface ParsedIngredient {
  quantity: string;
  unit: string;
  name: string;
  raw: string;
}

/**
 * Attempt to split a single ingredient line into quantity, unit, and name.
 * Falls back to returning the raw string as the name when parsing fails.
 */
export function parseIngredientLine(line: string): ParsedIngredient {
  const trimmed = line.trim();
  // Pattern: optional quantity (number/fraction) + optional unit + name
  const match = trimmed.match(
    /^([\d.,/½⅓⅔¼¾⅛]+)?\s*(г|гр|кг|мл|л|ст\.?\s*л\.?|ч\.?\s*л\.?|шт\.?|стакан[а-я]*|cup[s]?|tbsp|tsp|oz|lb|g|kg|ml|l)?\s*[.\-–—]?\s*(.+)$/i
  );

  if (match) {
    return {
      quantity: (match[1] || "").trim(),
      unit: (match[2] || "").trim(),
      name: (match[3] || trimmed).trim(),
      raw: trimmed,
    };
  }

  return { quantity: "", unit: "", name: trimmed, raw: trimmed };
}
