// Verbatim quote matching that tolerates typography, not paraphrase.
// Differences in whitespace, letter case, quote marks, dashes and ellipsis
// characters are ignored; every word of the quote must still occur in the source.

const CHAR_MAP: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201A": "'", "\u201B": "'", "\u2032": "'",
  "\u201C": '"', "\u201D": '"', "\u201E": '"', "\u201F": '"', "\u2033": '"', "\u00AB": '"', "\u00BB": '"',
  "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2015": "-", "\u2212": "-",
  "\u2026": "...",
};

type Normalized = { text: string; map: number[] };

/** Normalises text and keeps, for every output character, the index of the source character it came from. */
function normalizeWithMap(source: string): Normalized {
  let text = "";
  const map: number[] = [];
  let pendingSpace = false;
  let index = 0;
  for (const char of source) {
    if (/\s/u.test(char)) {
      pendingSpace = text.length > 0;
    } else {
      if (pendingSpace) {
        text += " ";
        map.push(index);
        pendingSpace = false;
      }
      const replacement = CHAR_MAP[char] ?? char.toLowerCase();
      for (const out of replacement) {
        text += out;
        map.push(index);
      }
    }
    index += char.length;
  }
  return { text, map };
}

export function normalizeText(value: string): string {
  return normalizeWithMap(value).text;
}

const EDGE_PUNCTUATION = /^[\s.,;:!?'"()[\]]+|[\s.,;:!?'"()[\]]+$/g;

/** Splits a quote on ellipses ("...", "…", "[...]") into segments that must appear in order. */
export function quoteSegments(quote: string): string[] {
  return normalizeText(quote)
    .replace(/\[\s*\.\.\.\s*\]/g, "...")
    .split(/\s*\.{3,}\s*/)
    .map((segment) => segment.replace(EDGE_PUNCTUATION, ""))
    .filter((segment) => segment.length >= 3);
}

export type QuoteMatch = { found: true; start: number; end: number } | { found: false };

/** Finds a quote in a source text. On success, start/end are offsets into the original source. */
export function findQuote(source: string, quote: string): QuoteMatch {
  const segments = quoteSegments(quote);
  if (segments.length === 0) return { found: false };
  const normalized = normalizeWithMap(source);
  let from = 0;
  let start = -1;
  let end = -1;
  for (const segment of segments) {
    const at = normalized.text.indexOf(segment, from);
    if (at < 0) return { found: false };
    if (start < 0) start = at;
    end = at + segment.length;
    from = end;
  }
  const startIndex = normalized.map[start]!;
  const lastIndex = normalized.map[end - 1]!;
  return { found: true, start: startIndex, end: lastIndex + charLengthAt(source, lastIndex) };
}

function charLengthAt(source: string, index: number): number {
  const code = source.codePointAt(index);
  return code !== undefined && code > 0xffff ? 2 : 1;
}

/** Case- and typography-insensitive containment, used for product identifiers. */
export function containsNormalized(haystack: string, needle: string): boolean {
  const n = normalizeText(needle);
  return n.length > 0 && normalizeText(haystack).includes(n);
}
