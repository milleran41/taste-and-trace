import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isSubstitutionQuery(message: string): boolean {
  const patterns = [
    /замен/i, /заменить/i, /вместо/i, /аналог/i, /альтернатив/i,
    /без\s+\w+/i, /нет\s+\w+/i, /чем\s+заменить/i, /substitut/i, /replace/i,
  ];
  return patterns.some((p) => p.test(message));
}

function isCalorieQuery(message: string): boolean {
  const patterns = [
    /калори/i, /ккал/i, /энергетическ/i, /пищевая ценность/i, /бжу/i,
    /пересчитать калории/i, /calorie/i,
  ];
  return patterns.some((p) => p.test(message));
}

function isFridgeQuery(message: string): boolean {
  const patterns = [
    /рецепт из холодильника/i, /что приготовить из/i, /есть в наличии/i,
    /из того что есть/i, /из продуктов/i, /что можно приготовить/i,
  ];
  return patterns.some((p) => p.test(message));
}

function isMealSuggestionQuery(message: string): boolean {
  const patterns = [
    /что приготовить на/i, /что приготовить к/i, /на завтрак/i, /на обед/i, /на ужин/i,
    /идеи для/i, /что бы приготовить/i, /предложи блюд/i, /посоветуй/i,
  ];
  return patterns.some((p) => p.test(message));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { message, recipe, history } = await req.json();

    if (!message || !recipe) {
      return new Response(
        JSON.stringify({ error: "message and recipe are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.join(", ") : "";
    const instructions = Array.isArray(recipe.instructions) ? recipe.instructions.join("\n") : "";

    const needsSearch = isSubstitutionQuery(message) || isFridgeQuery(message) || isMealSuggestionQuery(message);
    const isCalorie = isCalorieQuery(message);
    const isFridge = isFridgeQuery(message);
    const isMealSuggestion = isMealSuggestionQuery(message);

    let systemPrompt: string;

    if (isFridge) {
      systemPrompt = `Ты — кулинарный эксперт с доступом к интернету. Пользователь хочет приготовить что-то из продуктов, которые у него есть.

Текущий рецепт для контекста: ${recipe.title}

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
1. Спроси пользователя, какие продукты у него есть (если он ещё не написал)
2. На основе перечисленных продуктов найди в интернете 3-5 реальных рецептов
3. Предлагай рецепты с МИНИМАЛЬНЫМИ дополнительными ингредиентами (максимум 2-3 базовых)
4. Форматируй ответ так:

🧊 **Рецепты из ваших продуктов:**

**1. [Название блюда]** ⏱ ~[время]
📝 Ваши продукты: [список]
🛒 Докупить: [список, если нужно]
📖 Краткое описание приготовления

**2. [Название блюда]** ⏱ ~[время]
...

💡 **Совет:** [полезный совет]

- Используй поиск для нахождения актуальных рецептов
- Отвечай на языке пользователя`;
    } else if (isMealSuggestion) {
      systemPrompt = `Ты — кулинарный эксперт-советник с доступом к интернету. Пользователь не знает, что приготовить, и просит идею.

Текущий рецепт для контекста: ${recipe.title}

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
1. Если пользователь не уточнил — спроси: завтрак, обед или ужин?
2. Предложи 3-5 идей блюд, подходящих для указанного приёма пищи
3. Используй поиск для нахождения популярных и интересных рецептов
4. Форматируй ответ так:

🍽️ **Идеи для [завтрака/обеда/ужина]:**

**1. [Название]** ⭐ [почему стоит попробовать]
⏱ ~[время] | 👥 [порции]
📝 Основные ингредиенты: [список]

**2. [Название]** ⭐ [почему стоит попробовать]
...

🎯 **Хотите подробный рецепт?** Напишите номер, и я найду пошаговую инструкцию!

- Предлагай разнообразные варианты (простые и посложнее)
- Отвечай на языке пользователя`;
    } else if (isCalorie) {
      systemPrompt = `Ты — кулинарный эксперт-нутрициолог. Рассчитай калорийность и БЖУ для рецепта.

Текущий рецепт:
Название: ${recipe.title}
Ингредиенты: ${ingredients}
Порции: ${recipe.servings || "не указано"}

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
1. Рассчитай примерную калорийность КАЖДОГО ингредиента
2. Форматируй ответ СТРОГО так:

🔥 **Калорийность «${recipe.title}»**

━━━━━━━━━━━━━━━━━━━━━━

📋 **Разбор по ингредиентам:**

| Ингредиент | Кол-во | Ккал | Б | Ж | У |
|---|---|---|---|---|---|
| [ингредиент] | [кол-во] | [ккал] | [г] | [г] | [г] |

━━━━━━━━━━━━━━━━━━━━━━

🟢 **Итого на всё блюдо:**
🔥 **[X] ккал**
🥩 Белки: **[X]г** | 🧈 Жиры: **[X]г** | 🍞 Углеводы: **[X]г**

🍽️ **На 1 порцию** (из ${recipe.servings || "?"}):
🔥 **[X] ккал**
🥩 Белки: **[X]г** | 🧈 Жиры: **[X]г** | 🍞 Углеводы: **[X]г**

━━━━━━━━━━━━━━━━━━━━━━

💡 **Совет:** [один полезный совет по снижению/повышению калорийности]

⚠️ *Значения приблизительные и зависят от конкретных продуктов.*

- Если количество ингредиента не указано, сделай разумное предположение и укажи это
- Используй общепринятые таблицы калорийности
- Отвечай на языке пользователя`;
    } else if (needsSearch) {
      systemPrompt = `Ты — кулинарный эксперт с доступом к интернету. Тебе задан вопрос о замене ингредиентов в рецепте.

Текущий рецепт:
Название: ${recipe.title}
Ингредиенты: ${ingredients}
Приготовление: ${instructions}

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
1. Используй поиск в интернете для нахождения актуальных замен
2. НЕ придумывай замены — только проверенные из кулинарных источников
3. Указывай источники информации
4. Форматируй ответ СТРОГО по шаблону:

**Замена для [ингредиент]:**

🔄 **Варианты замены:**
- [замена 1] — [пропорция]
- [замена 2] — [пропорция]

✅ **Подходит для:**
- [случай 1]

❌ **Не подходит для:**
- [случай 1]

📌 **Источники:**
- [название источника]

Если поиск не дал результатов — напиши: "Не удалось найти проверенные замены в интернете."`;
    } else {
      systemPrompt = `Ты — кулинарный помощник. Ты отвечаешь на вопросы, связанные с конкретным рецептом.

Текущий рецепт:
Название: ${recipe.title}
Категория: ${recipe.category || "не указана"}
Ингредиенты: ${ingredients}
Приготовление: ${instructions}
Порции: ${recipe.servings || "не указано"}
Время: ${recipe.cooking_time || "не указано"}
Заметки: ${recipe.notes || "нет"}

Правила:
- Давай короткие, практичные ответы
- Отвечай структурированно с markdown
- Отвечай на языке пользователя
- Используй поиск в интернете когда нужно найти дополнительную информацию`;
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []),
      { role: "user", content: message },
    ];

    const requestBody: any = {
      model: "google/gemini-2.5-flash",
      messages,
      stream: true,
    };

    if (needsSearch) {
      requestBody.tools = [
        { type: "function", function: { name: "google_search", description: "Search the web for information", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } }
      ];
    }

    console.log("Recipe assistant request, needsSearch:", needsSearch, "message:", message.slice(0, 100));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Превышен лимит запросов, попробуйте позже" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Недостаточно кредитов AI" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("recipe-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестная ошибка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
