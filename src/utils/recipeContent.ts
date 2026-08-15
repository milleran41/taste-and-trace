const INSTRUCTION_HEADING_RE =
  /^(how\s+to\s+(prepare|make|cook)|prepar(?:e|ation)|directions?|instructions?|method|cooking|steps?|способ\s+приготовления|как\s+приготовить|приготовление|инструкции?|шаги)\s*:?\s*$/i;

const JUNK_LINE_RE =
  /^(title|description|captions?|transcript|my\s+etsy\s+shop|equipment\s+that\s+i\s+use|follow\s+me|more\s+.+recipes|music|instagram|facebook|tiktok|youtube|subscribe|подпис|соцсети|музыка)\b/i;

const URL_RE = /https?:\/\/|www\./i;
const EMPTY_NUMBERED_STEP_RE = /^\s*(?:[-*]\s*)?\d+[.)]\s*$/;
const NUMBERED_STEP_RE = /^\s*(?:[-*]\s*)?\d+[.)]\s*(.+)$/;
const FOOD_WORD_RE = /\b(potato(?:es)?|salt|pepper|flour|sugar|milk|cream|butter|egg(?:s)?|onion|carrot|tomato|rice|beans|garlic|cheese|картоф|соль|перец|мука|сахар|молоко|сливк|масло|яйц|лук|морков|томат|рис|фасол|чеснок|сыр)\b/i;
const CODE_FRAGMENT_RE = /^(?:[a-z]{1,4}|[a-z]{2,8}\s+[a-z]{1,4})\s+\d+$/i;
const SEO_LINE_RE = /#|(?:\b(?:asmr|recipe|recipes|cooking|breakfast|budget|relaxing|sounds?|video|videos?|notalking|no\s+talking|food\s+asmr)\b.*){3,}/i;
const MARKETING_LINE_RE = /\b(?:no[-\s]?talking\s+asmr\s+cooking\s+video|natural\s+sounds|pure\s+food\s+relaxation|best\s+destination|develop\s+your\s+cooking\s+skills|if\s+you\s+love\s+to\s+cook)\b/i;

const normalizeList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const normalizeForCompare = (line: string) =>
  line.replace(/^\s*(?:[-*]\s*)?\d+[.)]\s*/, "").replace(/\s+/g, " ").trim().toLowerCase();

const isJunkLine = (line: string) =>
  line === "***" || URL_RE.test(line) || JUNK_LINE_RE.test(line);

const isSeoOrServiceLine = (line: string) =>
  SEO_LINE_RE.test(line) || MARKETING_LINE_RE.test(line) || /^(title|description|captions?)\s*:/i.test(line);

const isIngredientNoiseLine = (line: string) => {
  if (isSeoOrServiceLine(line)) return true;
  if (CODE_FRAGMENT_RE.test(line) && !FOOD_WORD_RE.test(line)) return true;
  if (/\b(?:recipe|recipes|asmr|breakfast|budget|cooking|video|sounds?)\b/i.test(line) && !/\d+\s*(?:g|kg|ml|l|tbsp|tsp|cup|cups|г|гр|кг|мл|л)\b/i.test(line)) {
    return true;
  }
  return false;
};

const asInstructionLine = (line: string) => {
  if (EMPTY_NUMBERED_STEP_RE.test(line)) return "";
  const numbered = line.match(NUMBERED_STEP_RE);
  return (numbered ? numbered[1] : line).trim();
};

export function cleanRecipeSections(
  ingredientsInput: unknown,
  instructionsInput: unknown,
): { ingredients: string[]; instructions: string[] } {
  const rawIngredients = normalizeList(ingredientsInput);
  const instructions = normalizeList(instructionsInput).filter((line) => !isJunkLine(line) && !isSeoOrServiceLine(line));
  const ingredients: string[] = [];
  const movedInstructions: string[] = [];
  let reachedInstructions = false;

  for (const rawLine of rawIngredients) {
    const line = rawLine.trim();
    if (!line || EMPTY_NUMBERED_STEP_RE.test(line)) continue;

    if (INSTRUCTION_HEADING_RE.test(line)) {
      reachedInstructions = true;
      continue;
    }

    if (isJunkLine(line)) {
      if (reachedInstructions) break;
      continue;
    }

    if (!reachedInstructions && isIngredientNoiseLine(line)) continue;

    if (reachedInstructions) {
      const instructionLine = asInstructionLine(line);
      if (instructionLine && !isJunkLine(instructionLine) && !isSeoOrServiceLine(instructionLine)) {
        movedInstructions.push(instructionLine);
      }
      continue;
    }

    ingredients.push(line);
  }

  const seenInstructions = new Set(instructions.map(normalizeForCompare));
  for (const line of movedInstructions) {
    const key = normalizeForCompare(line);
    if (key && !seenInstructions.has(key)) {
      instructions.push(line);
      seenInstructions.add(key);
    }
  }

  return { ingredients, instructions };
}
