
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Set initial display_order based on created_at within each category
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY category ORDER BY created_at ASC) - 1 AS rn
  FROM public.recipes
)
UPDATE public.recipes SET display_order = ordered.rn FROM ordered WHERE recipes.id = ordered.id;
