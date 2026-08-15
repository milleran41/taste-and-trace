import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  private handleReload = () => {
    sessionStorage.clear();
    localStorage.removeItem("vite:reload");
    window.location.reload();
  };

  private handleHardReload = async () => {
    const currentUrl = window.location.href;
    sessionStorage.clear();
    localStorage.clear();

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    const cacheBuster = `cache_bust=${Date.now()}`;
    const [baseUrl, hash = ""] = currentUrl.split("#");
    const cleanBaseUrl = baseUrl.split("?")[0];
    window.location.href = `${cleanBaseUrl}?${cacheBuster}${hash ? `#${hash}` : ""}`;
  };

  public render() {
    if (this.state.hasError) {
      // ErrorBoundary is a class component so we can't use hooks. Keep static fallback text.
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-card rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-2">Error</h1>
            <p className="text-muted-foreground mb-6">
              The application encountered a problem. Try reloading the page.
            </p>
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Details</summary>
                <pre className="mt-2 p-3 bg-muted rounded-lg text-xs text-foreground overflow-auto max-h-64 whitespace-pre-wrap">
                  {this.state.error.message}
                  {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
                </pre>
              </details>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleReload} className="gap-2"><RefreshCw className="w-4 h-4" />Reload</Button>
              <Button variant="outline" onClick={this.handleHardReload}>Clear cache</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
