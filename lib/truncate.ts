/**
 * Length-capped truncation that never splits a character.
 *
 * `String.prototype.slice` cuts by UTF-16 code unit, so cutting an emoji in
 * half leaves a lone surrogate. Postgres rejects the whole JSON body as
 * "Empty or invalid json" (PGRST102) when that reaches it, which surfaces as a
 * generic save failure far away from the real cause.
 *
 * The cap stays in UTF-16 units so existing labels keep their current length;
 * only the cut point moves back to the nearest character boundary.
 */

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function characters(text: string): Iterable<string> {
  if (segmenter) {
    return (function* () {
      for (const { segment } of segmenter!.segment(text)) yield segment;
    })();
  }
  // Code points still keep surrogate pairs intact, which is what avoids the
  // invalid-JSON failure. Older engines may split ZWJ sequences, but those
  // remain valid UTF-8.
  return text;
}

export function truncateText(text: string, max: number, suffix = "…"): string {
  if (text.length <= max) return text;

  let out = "";
  for (const char of characters(text)) {
    if (out.length + char.length > max) break;
    out += char;
  }

  return out.length > 0 ? `${out}${suffix}` : suffix;
}
