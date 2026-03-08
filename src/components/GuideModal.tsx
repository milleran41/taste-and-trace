import { useState, useRef, useEffect, useCallback } from "react";
import { X, HelpCircle, Send, Loader2, RotateCcw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function GuideModal({ open, onClose }: GuideModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();
  const location = useLocation();

  const overlayRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const QUICK_QUESTIONS = [
    { icon: "➕", labelKey: "guide_how_add_recipe" },
    { icon: "🎬", labelKey: "guide_how_import_video" },
    { icon: "📸", labelKey: "guide_how_recognize_screenshot" },
    { icon: "✏️", labelKey: "guide_how_edit_recipe" },
    { icon: "⚖️", labelKey: "guide_how_measures" },
    { icon: "🤖", labelKey: "guide_how_assistant" },
    { icon: "💾", labelKey: "guide_how_save_recipe" },
  ];

  const handleClose = () => {
    setMessages([]);
    setInput("");
    onClose();
  };

  const handleReset = () => {
    setMessages([]);
    setInput("");
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getContext = () => {
    const path = location.pathname;
    if (path === "/") return "Main page (recipe list)";
    if (path === "/add") return "Add recipe page";
    if (path.startsWith("/edit/")) return "Edit recipe page";
    if (path.startsWith("/recipe/")) return "Recipe detail page";
    return path;
  };

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: Message = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);

      let assistantContent = "";

      try {
        const chatHistory = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/app-guide`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              message: text.trim(),
              history: chatHistory,
              context: getContext(),
            }),
          }
        );

        if (!resp.ok || !resp.body) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || t("error"));
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIdx: number;
          while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 1);

            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return prev.map((m, i) =>
                      i === prev.length - 1
                        ? { ...m, content: assistantContent }
                        : m
                    );
                  }
                  return [...prev, { role: "assistant", content: assistantContent }];
                });
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : t("error");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `❌ ${errorMsg}` },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, t, location.pathname]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === overlayRef.current) handleClose();
      }}
    >
      <div className="relative w-full max-w-lg mx-4 rounded-xl border bg-card text-card-foreground shadow-xl animate-scale-in flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" onClick={handleReset} title={t("go_to_main")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <HelpCircle className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">{t("guide")}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center mb-4">
                {t("guide_description")}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q.labelKey}
                    onClick={() => sendMessage(t(q.labelKey))}
                    disabled={isLoading}
                    className="text-left text-sm p-2.5 rounded-lg border bg-muted/50 hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <span className="mr-1.5">{q.icon}</span>
                    {t(q.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.length > 0 && !isLoading && (
            <div className="flex justify-center">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full border bg-muted/50 hover:bg-muted"
              >
                <RotateCcw className="h-3 w-3" />
                {t("new_question")}
              </button>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                msg.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              )}
            >
              {msg.content}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("thinking")}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("guide_ask_placeholder")}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
