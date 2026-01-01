import { Link } from "react-router-dom";
import { ChefHat, Plus, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <ChefHat className="h-8 w-8 text-primary" />
          <span className="font-display text-xl font-semibold">Taste & Trace</span>
        </Link>
        
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/?favorites=true">
              <Heart className="h-5 w-5" />
              <span className="sr-only">Избранное</span>
            </Link>
          </Button>
          <Button asChild>
            <Link to="/add">
              <Plus className="h-4 w-4 mr-2" />
              Добавить рецепт
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
