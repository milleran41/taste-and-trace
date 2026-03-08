/**
 * Storage Service — helpers for file uploads and image management.
 * Currently a placeholder; will wrap Supabase Storage when buckets are configured.
 */

/**
 * Convert a File object to a base64 data URL.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Extract raw base64 content (without the data URI prefix) from a data URL.
 */
export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(",")[1];
}
