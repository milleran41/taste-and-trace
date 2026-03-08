/**
 * Text cleaning utilities.
 */

/** Remove excessive whitespace, keeping single spaces and newlines. */
export function collapseWhitespace(text: string): string {
  return text.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Strip HTML tags from a string. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Decode common HTML entities. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
