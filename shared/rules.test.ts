import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRulePack } from "./rules";

describe("parseRulePack", () => {
  it("parses headers, titles, sources and multi-line text, and skips comments", () => {
    const pack = parseRulePack(`# Version: test-pack.v2, compiled today
[A-1] First rule | Source A | In force
Line one
line two

# a comment between passages
[B.2] Second rule
Only text`);
    expect(pack.errors).toEqual([]);
    expect(pack.name).toBe("test-pack.v2");
    expect(pack.passages).toEqual([
      { id: "A-1", title: "First rule", source: "Source A", applicability: "In force", text: "Line one\nline two" },
      { id: "B.2", title: "Second rule", source: "", applicability: "", text: "Only text" },
    ]);
  });

  it("rejects duplicate IDs and empty passages, because citations would be ambiguous", () => {
    const pack = parseRulePack("[X] One\ntext\n[X] Two\nmore\n[Y] Empty");
    expect(pack.errors).toContain("Rule ID X appears more than once.");
    expect(pack.errors).toContain("Rule Y has a header but no text.");
  });

  it("splits pasted text without headers into paragraphs R1..Rn", () => {
    const pack = parseRulePack("§ 1. First paragraph.\n\n§ 2. Second paragraph\nstill second.");
    expect(pack.errors).toEqual([]);
    expect(pack.passages.map((p) => p.id)).toEqual(["R1", "R2"]);
    expect(pack.passages[1]?.text).toBe("§ 2. Second paragraph\nstill second.");
    expect(pack.notes[0]).toMatch(/split into 2 paragraphs/);
  });

  it("parses the default rule pack into 20 uniquely identified passages", () => {
    const text = readFileSync(new URL("../data/rules/dk-cosmetic-claims.v1.txt", import.meta.url), "utf8");
    const pack = parseRulePack(text);
    expect(pack.errors).toEqual([]);
    expect(pack.name).toBe("dk-cosmetic-claims.v1");
    expect(pack.passages).toHaveLength(20);
    expect(pack.passages.map((p) => p.id)).toContain("DK-MFL-5.2.2");
    expect(pack.passages.find((p) => p.id === "DK-MFL-5.2.2")?.applicability).toBe("In force from 27/09/2026");
  });
});
