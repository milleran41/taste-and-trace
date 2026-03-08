/**
 * Translation Service — helpers for i18n operations outside React components.
 */

import i18n from "@/i18n";

/** Translate a key (for use outside React components / hooks). */
export const t = (key: string, options?: Record<string, unknown>): string =>
  i18n.t(key, options);

/** Get the current language code. */
export const getCurrentLanguage = (): string => i18n.language;

/** Change the active language. */
export const changeLanguage = (code: string): Promise<void> =>
  i18n.changeLanguage(code) as unknown as Promise<void>;
