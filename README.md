# 🍽️ YumBook — Your Personal Recipe Book

A multilingual recipe management app with AI-powered features: recipe recognition from photos and text, URL import (YouTube, TikTok, blogs), built-in AI cooking assistant, drag-and-drop organization, and an interactive app guide.

## ✨ Features

- **Recipe Management** — Create, edit, delete, and organize recipes with categories and favorites
- **AI Recipe Recognition** — Extract recipes from photos, screenshots, or pasted text using AI
- **URL Import** — Import recipes from cooking sites, YouTube, TikTok, and Instagram links
- **AI Cooking Assistant** — Ask questions about a recipe: substitutions, calories, healthier alternatives
- **Interactive Guide** — Built-in app guide that answers questions about the interface
- **Drag & Drop** — Reorder recipes within categories
- **Kitchen Measures** — Reference table for common kitchen measurements and conversions
- **Print** — Print-friendly recipe view
- **15 Languages** — EN, DE, RU, ES, FR, IT, PT, PL, TR, UK, ZH, JA, KO, AR, HI

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS, shadcn/ui |
| State | TanStack React Query |
| Backend | Lovable Cloud (Supabase) |
| AI | Lovable AI Gateway (Gemini) |
| i18n | i18next |
| DnD | @dnd-kit |

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

The app runs at `http://localhost:5173`.

## 📁 Project Structure

```
src/
├── components/       # UI components
│   ├── ui/           # shadcn/ui primitives
│   ├── Header.tsx    # Top navigation bar
│   ├── RecipeCard.tsx
│   ├── RecipeGrid.tsx
│   ├── GuideModal.tsx        # Interactive app guide
│   ├── AssistantModal.tsx    # AI cooking assistant
│   ├── RecipeParserDialog.tsx # AI recipe recognition
│   ├── URLImportModal.tsx    # Import from URL
│   ├── RightSidebar.tsx      # Right panel
│   └── ...
├── hooks/            # Custom React hooks
├── locales/          # Translation files (15 languages)
├── pages/            # Route pages
├── types/            # TypeScript types
└── data/             # Static data (measures)

supabase/
└── functions/        # Edge functions
    ├── parse-recipe/       # AI recipe extraction
    ├── recipe-assistant/   # AI cooking Q&A
    ├── app-guide/          # Interactive guide AI
    └── import-recipe-url/  # URL import
```

## 📄 License

[MIT](LICENSE)
