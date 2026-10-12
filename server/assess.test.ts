import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRulePack } from "../shared/rules";
import { AssessRequestSchema, type AssessRequest } from "../shared/schema";
import { assess, InputError } from "./assess";
import { loadDefaultRulesText, loadScenarios } from "./data";
import { StubModelClient } from "./llm";

const rulesText = loadDefaultRulesText();
const scenarios = loadScenarios();
const stub = (name: string) => new StubModelClient({ kind: "text", text: readFileSync(new URL(`../eval/stubs/${name}`, import.meta.url), "utf8") }, `stub:${name}`);

function requestFor(scenarioId: string): AssessRequest {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`no scenario ${scenarioId}`);
  return AssessRequestSchema.parse({ claim: scenario.claim, product: scenario.product, rulesText, evidence: scenario.evidence });
}

describe("assess with scripted model output", () => {
  it("keeps a valid clearance whose every citation and identity check passes (positive control)", async () => {
    const result = await assess(requestFor("demo-b"), stub("valid-clearance.json"));
    expect(result.downgradeReasons).toEqual([]);
    expect(result.finalAssessment).toBe("no_issue_found");
    expect(result.nextAction.type).toBe("approve");
    expect(result.checks.citations.every((c) => c.status === "verified")).toBe(true);
  });

  it("fails closed on malformed JSON", async () => {
    const result = await assess(requestFor("demo-b"), stub("malformed.txt"));
    expect(result.finalAssessment).toBe("needs_evidence_or_review");
    expect(result.modelAssessment).toBeNull();
    expect(result.checks.output.ok).toBe(false);
    expect(result.nextAction.type).toBe("manual_review");
  });

  it("downgrades a clearance that cites an unknown rule and an invented quote", async () => {
    const result = await assess(requestFor("demo-b"), stub("fabricated-citations.json"));
    expect(result.modelAssessment).toBe("no_issue_found");
    expect(result.finalAssessment).toBe("needs_evidence_or_review");
    const statuses = result.checks.citations.map((c) => `${c.refId}:${c.status}`);
    expect(statuses).toContain("DK-MFL-99:unknown_id");
    expect(statuses).toContain("E1:quote_not_found");
  });

  it("blocks a clearance based on another formulation even when every quote is genuine", async () => {
    const result = await assess(requestFor("demo-c"), stub("clears-wrong-formulation.json"));
    expect(result.checks.citations.every((c) => c.status === "verified")).toBe(true);
    expect(result.checks.identity[0]).toMatchObject({ confirmed: false, otherIdentifiers: ["F-098"] });
    expect(result.finalAssessment).toBe("needs_evidence_or_review");
    expect(result.downgradeReasons.join(" ")).toMatch(/Names F-098, not the product's formulation F-101 rev\. 3/);
  });

  it("never turns a non-clearing model verdict into a clearance", async () => {
    const output = JSON.parse(readFileSync(new URL("../eval/stubs/valid-clearance.json", import.meta.url), "utf8"));
    output.assessment = "potential_violation";
    const result = await assess(requestFor("demo-b"), new StubModelClient({ kind: "text", text: JSON.stringify(output) }));
    expect(result.finalAssessment).toBe("potential_violation");
  });

  it("accepts enum values that differ only in capitalisation", async () => {
    const output = JSON.parse(readFileSync(new URL("../eval/stubs/valid-clearance.json", import.meta.url), "utf8"));
    output.assessment = "No_issue_found";
    output.evidenceRelevance[0].verdict = "Supports";
    const result = await assess(requestFor("demo-b"), new StubModelClient({ kind: "text", text: JSON.stringify(output) }));
    expect(result.checks.output.ok).toBe(true);
    expect(result.finalAssessment).toBe("no_issue_found");
  });

  it("treats a refusal or a cut-off response as unusable output", async () => {
    const refused = await assess(requestFor("demo-b"), new StubModelClient({ kind: "refusal", message: "no" }));
    const cut = await assess(requestFor("demo-b"), new StubModelClient({ kind: "incomplete", reason: "max_output_tokens", text: "{" }));
    expect([refused.finalAssessment, cut.finalAssessment]).toEqual(["needs_evidence_or_review", "needs_evidence_or_review"]);
  });

  it("rejects rule packs with duplicate IDs before calling the model", async () => {
    const request = { ...requestFor("demo-b"), rulesText: "[A] one\ntext\n[A] two\ntext" };
    await expect(assess(request, stub("valid-clearance.json"))).rejects.toBeInstanceOf(InputError);
  });
});

describe("fixtures", () => {
  it("every rule ID used in the eval exists in the default rule pack", () => {
    const ids = new Set(parseRulePack(rulesText).passages.map((p) => p.id));
    const cases = JSON.parse(readFileSync(new URL("../eval/cases.json", import.meta.url), "utf8")) as {
      cases: { id: string; scenario: string; expected: { citeAnyOf: string[] } }[];
    };
    for (const testCase of cases.cases) {
      for (const id of testCase.expected.citeAnyOf) expect(ids.has(id), `${testCase.id} cites ${id}`).toBe(true);
      expect(scenarios.some((s) => s.id === testCase.scenario), `${testCase.id} scenario`).toBe(true);
    }
  });
});
