import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';

const uiCacheVersion = "2026-06-10-promo-screenshot-v3";
const isElectron = typeof window !== "undefined" && Boolean((window as any).tasteTrace);

const clearStaleAppCache = async () => {
  const storedVersion = localStorage.getItem("yumbook:ui-cache-version");
  if (storedVersion === uiCacheVersion) return;

  localStorage.setItem("yumbook:ui-cache-version", uiCacheVersion);

  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  window.location.reload();
};

if (isElectron) {
  createRoot(document.getElementById("root")!).render(<App />);
} else {
  clearStaleAppCache()
    .catch((error) => console.warn("Could not clear stale app cache", error))
    .finally(() => {
      createRoot(document.getElementById("root")!).render(<App />);
    });
}
