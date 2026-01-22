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
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  private handleReload = () => {
    // Clear any cached state
    sessionStorage.clear();
    localStorage.removeItem("vite:reload");
    window.location.reload();
  };

  private handleHardReload = () => {
    sessionStorage.clear();
    localStorage.clear();
    // Force bypass cache
    window.location.href = window.location.href.split("?")[0] + "?t=" + Date.now();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Произошла ошибка
            </h1>
            
            <p className="text-gray-600 mb-6">
              Приложение столкнулось с проблемой. Попробуйте перезагрузить страницу.
            </p>
            
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Подробности ошибки
                </summary>
                <pre className="mt-2 p-3 bg-gray-100 rounded-lg text-xs text-gray-700 overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleReload} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Перезагрузить
              </Button>
              
              <Button variant="outline" onClick={this.handleHardReload}>
                Сбросить кэш
              </Button>
            </div>
            
            <p className="mt-6 text-xs text-gray-400">
              Если проблема повторяется, попробуйте открыть в режиме инкогнито
              или отключить блокировщики рекламы.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
