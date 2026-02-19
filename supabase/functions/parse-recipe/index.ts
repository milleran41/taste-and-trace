import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const { text, imageBase64, imageMediaType } = body;

    const systemPrompt = `You are a recipe parser. Extract recipe information from the provided content and return ONLY a valid JSON object with these fields:
- title (string): recipe name
- description (string): brief description
- ingredients (array of strings): list of ingredients with quantities
- instructions (array of strings): step-by-step cooking instructions
- cooking_time (string): total cooking time (e.g. "30 минут", "1 час")
- servings (number): number of servings
- difficulty (string): difficulty level in the SAME language as the recipe (e.g. for Russian: "Легко"/"Средне"/"Сложно"; for English: "Easy"/"Medium"/"Hard")
- tags (array of strings): relevant tags/keywords in the same language
- notes (string): any additional notes or tips
- has_dish_photo (boolean): true if the image clearly shows the FINISHED dish/food that can serve as the main recipe photo, false if it's just text/packaging/ingredients/handwriting

CRITICAL RULES:
- Write ALL fields in the SAME language as the recipe source (don't mix languages)
- Return ONLY the JSON object, no markdown, no explanation
- If a field cannot be determined, use empty string or empty array
- has_dish_photo must be true ONLY if the image shows the actual cooked/finished dish`;

    let messages: any[];

    if (imageBase64 && imageMediaType) {
      // Photo mode - analyze image
      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${imageMediaType};base64,${imageBase64}`,
              },
            },
            {
              type: "text",
              text: "Parse this recipe from the image. Return the JSON object.",
            },
          ],
        },
      ];
    } else if (text) {
      // Text mode
      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Parse this recipe text and return the JSON:\n\n${text}`,
        },
      ];
    } else {
      throw new Error("Either text or imageBase64 must be provided");
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Превышен лимит запросов, попробуйте позже" }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Недостаточно кредитов AI" }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content ?? "";

    // Extract JSON from response
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in response:", rawContent);
      throw new Error("AI не вернул корректный JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-recipe error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Неизвестная ошибка",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
