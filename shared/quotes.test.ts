import { describe, expect, it } from "vitest";
import { containsNormalized, findQuote, quoteSegments } from "./quotes";

const source = "Presentations of a product’s performance shall not go beyond the available supporting evidence.";

describe("findQuote", () => {
  it("accepts differences in case, whitespace, quote marks and trailing punctuation", () => {
    expect(findQuote(source, "presentations of a product's  performance").found).toBe(true);
    expect(findQuote(source, '"shall not go beyond the available supporting evidence"').found).toBe(true);
  });

  it("rejects paraphrases and invented words", () => {
    expect(findQuote(source, "performance must not exceed the evidence").found).toBe(false);
    expect(findQuote(source, "shall not go beyond the available clinical evidence").found).toBe(false);
  });

  it("allows ellipses but requires the segments in source order", () => {
    expect(findQuote(source, "Presentations of a product’s performance … supporting evidence").found).toBe(true);
    expect(findQuote(source, "supporting evidence ... Presentations").found).toBe(false);
  });

  it("matches across the compiler's [...] marker in a passage", () => {
    const passage = "Stk. 2. Vildledning efter stk. 1 kan relatere sig til følgende elementer: [...] 2) de væsentligste egenskaber ved produktet,";
    expect(findQuote(passage, "følgende elementer: [...] 2) de væsentligste egenskaber").found).toBe(true);
  });

  it("returns offsets into the original text for highlighting", () => {
    const match = findQuote(source, "PRODUCT'S PERFORMANCE");
    expect(match.found).toBe(true);
    if (match.found) expect(source.slice(match.start, match.end)).toBe("product’s performance");
  });

  it("treats dashes and minus signs as the same character", () => {
    expect(findQuote("Efter 4 uger: -21 % (p < 0,05)", "Efter 4 uger: −21 %").found).toBe(true);
  });

  it("refuses empty or trivially short quotes", () => {
    expect(quoteSegments("...")).toEqual([]);
    expect(findQuote(source, "of").found).toBe(false);
  });
});

describe("containsNormalized", () => {
  it("finds identifiers regardless of case and spacing", () => {
    expect(containsNormalized("formula F-101  REV. 3 (batch 1)", "f-101 rev. 3")).toBe(true);
    expect(containsNormalized("formula F-098", "F-101 rev. 3")).toBe(false);
  });
});
