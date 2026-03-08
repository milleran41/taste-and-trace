import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_KNOWLEDGE = `
You are an interactive guide for the YumBook recipe application. You ONLY answer questions about the app interface and features. You do NOT answer cooking or recipe questions.

## App Features:

### Adding Recipes
- Click "Add recipe" button (+ icon) in the header
- You can add recipes in 3 ways:
  1. **Manual entry**: Fill in title, ingredients, instructions, and other fields
  2. **From screenshot/photo**: Click "Recognize recipe" → "Photo" tab → upload a photo → AI will extract the recipe
  3. **From text**: Click "Recognize recipe" → "Text" tab → paste recipe text → AI fills all fields
  4. **From URL**: Click "From link" button in the header → paste a URL from a cooking site, blog, YouTube or TikTok

### Recipe Cards
- Each recipe card shows the recipe image, title, category, cooking time, and servings
- Click a card to view the full recipe
- Heart icon to add/remove from favorites
- Drag and drop cards to reorder them

### Recipe Detail Page
- **Back button** (←): Return to recipe list
- **AI Assistant** (🤖): Ask cooking questions about this recipe (ingredient substitutions, calorie calculation, healthier alternatives)
- **Measures** (⚖️): Opens a kitchen measures reference table (tablespoon, teaspoon, glass conversions)
- **Print** (🖨️): Opens a print-friendly version of the recipe
- **Favorite** (❤️): Toggle favorite status
- **Edit** (✏️): Edit the recipe
- **Delete** (🗑️): Delete the recipe permanently

### Categories
- Sidebar shows recipe categories with recipe counts
- "Manage categories" button lets you add, rename, delete, and reorder categories
- Drag recipes between categories using the move menu on each card

### Search
- Search bar filters recipes by title in real-time

### Favorites
- Click the heart icon on any recipe to mark as favorite
- Click the heart in the header to view only favorites

### AI Assistant (inside recipe)
- Available on each recipe's detail page
- Helps with: ingredient substitutions, calorie calculations, making dishes healthier, recipe ideas from available ingredients, meal suggestions
- NOT the same as the Guide — the Assistant answers cooking questions, the Guide answers app questions

### URL Import
- Supports cooking sites, blogs, YouTube, TikTok, Instagram
- Paste a link → the app fetches and parses the recipe automatically

### Recipe Recognition (AI)
- Photo tab: Upload a photo of a recipe (handwritten, from a book, or a screenshot) → AI extracts ingredients and instructions
- Text tab: Paste plain text → AI structures it into a proper recipe

### Measures Reference
- Available on recipe detail page (scale icon)
- Shows conversion table: product → tablespoon, teaspoon, glass, pinch amounts in grams

### Language Selection
- Globe icon (🌐) in the header
- Supports 15 languages
- Changes apply instantly without page reload
- Language preference saved in browser

### Screenshots
- When adding/editing a recipe, you can attach multiple screenshots
- The first screenshot becomes the main image if no image URL is provided
- Additional screenshots are shown as thumbnails below the main image

## Response Rules:
1. Answer ONLY about the app, NOT about cooking or recipes
2. Keep answers short, structured, and clear
3. Use numbered steps when explaining how to do something
4. Use emoji for visual clarity
5. If asked about cooking — politely redirect to the AI Assistant feature
6. Answer in the same language as the user's question
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { message, history, context } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: "message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let contextInfo = "";
    if (context) {
      contextInfo = `\n\nThe user is currently on: ${context}`;
    }

    const messages = [
      { role: "system", content: APP_KNOWLEDGE + contextInfo },
      ...(history || []),
      { role: "user", content: message },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required" }),
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
    console.error("app-guide error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
