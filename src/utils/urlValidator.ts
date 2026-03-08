/**
 * URL validation helpers.
 */

/** Check whether a string is a valid HTTP(S) URL. */
export function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Detect the platform from a URL. */
export function detectPlatform(
  url: string
): "youtube" | "tiktok" | "instagram" | "vk" | "website" {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/vk\.com|vk\.video/i.test(url)) return "vk";
  return "website";
}
