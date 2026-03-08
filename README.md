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
├── assets/           # Static files (icons, images, flags)
├── components/       # UI components
│   ├── ui/           # shadcn/ui primitives
│   ├── Header.tsx    # Top navigation bar
│   ├── RecipeCard.tsx
│   ├── RecipeGrid.tsx
│   ├── GuideModal.tsx        # Interactive app guide
│   ├── AssistantModal.tsx    # AI cooking assistant
│   ├── RecipeParserDialog.tsx # AI recipe recognition
│   ├── URLImportModal.tsx    # Import from URL
│   ├── RightSidebar.tsx      # Right panel (support, ads)
│   ├── SupportModal.tsx      # Support the author
│   └── ...
├── config/           # App, AI, and language configuration
│   ├── appConfig.ts
│   ├── aiConfig.ts
│   └── languages.ts
├── hooks/            # Custom React hooks
├── lib/              # Library initialisation (utils)
├── locales/          # Translation files (15 languages)
├── pages/            # Route pages
├── services/         # API / business-logic layer
│   ├── aiService.ts          # AI edge-function calls
│   ├── recipeService.ts      # Recipe CRUD via Supabase
│   ├── storageService.ts     # File / image helpers
│   └── translationService.ts # i18n helpers for non-React code
├── types/            # TypeScript types
├── utils/            # Pure helper functions
│   ├── formatRecipe.ts
│   ├── textCleaner.ts
│   ├── urlValidator.ts
│   └── ingredientParser.ts
└── data/             # Static data (measures)

supabase/
├── functions/        # Edge functions
│   ├── parse-recipe/       # AI recipe extraction
│   ├── recipe-assistant/   # AI cooking Q&A
│   ├── app-guide/          # Interactive guide AI
│   └── import-recipe-url/  # URL import
├── migrations/       # Database migrations (auto-managed)
└── seed/             # Seed data
```

## 🔑 Environment Variables

Copy `.env.example` to `.env` and fill in values:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
```

AI keys are managed as backend secrets through Lovable Cloud.

## 📄 License

[MIT](LICENSE)
