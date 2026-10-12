// Shows the reviewer screen without an API key: the real server and deterministic
// checks, with hand-written model outputs for the three demo scenarios.
//
//   npm run demo:scripted, then open http://localhost:5173
//
// Add "[downgrade]" to the claim on Demo C to see a clearance blocked by the identity
// check, or "[malformed]" to see how unusable model output is handled.
import { readFileSync } from "node:fs";
import { createApp } from "../server/app";
import { ModelUnavailableError, type ModelClient, type ModelRawResult, type ModelRequest } from "../server/llm";
import type { ModelOutput } from "../shared/schema";

const stub = (name: string) => readFileSync(new URL(`../eval/stubs/${name}`, import.meta.url), "utf8");

const demoA: ModelOutput = {
  claimElements: [
    { id: "P", type: "product", text: "NordVita Hydra Serum 50 ml, formulation F-101 rev. 3", requirement: "Evidence must concern formulation F-101 rev. 3.", requiresSubstantiation: true },
    { id: "C1", type: "method", text: "Clinically proven", requirement: "A controlled study on people.", requiresSubstantiation: true },
    { id: "C2", type: "duration", text: "24-hour", requirement: "A significant hydration effect measured 24 hours after application.", requiresSubstantiation: true },
    { id: "C3", type: "outcome", text: "hydration", requirement: "An instrumental measurement of skin hydration.", requiresSubstantiation: true },
  ],
  evidenceRelevance: [
    { elementId: "P", evidenceId: "E1", verdict: "supports", evidenceShows: "The study tested the marketed formula.", quote: "Test product: NordVita Hydra Serum, formula F-101 rev. 3" },
    { elementId: "C1", evidenceId: "E1", verdict: "supports", evidenceShows: "A randomised, controlled study on 32 women.", quote: "Single-centre, randomised, controlled study." },
    { elementId: "C2", evidenceId: "E1", verdict: "partial", evidenceShows: "Hydration was only measured up to 12 hours; there is no data at 24 hours.", quote: "at baseline and 1, 4, 8 and 12 hours after application" },
    { elementId: "C3", evidenceId: "E1", verdict: "supports", evidenceShows: "Hydration was measured with a Corneometer.", quote: "Skin surface hydration was measured with a Corneometer CM 825" },
  ],
  applicableRules: [
    { ruleId: "EU-655-4.1", quote: "shall not go beyond the available supporting evidence", application: "A 24-hour claim goes beyond a study that stops at 12 hours." },
    { ruleId: "DK-MFL-13", quote: "Den erhvervsdrivende skal kunne dokumentere rigtigheden af oplysninger om faktiske forhold.", application: "The 24-hour duration is a factual statement that must be documented." },
  ],
  findings: [{ severity: "blocking", summary: "The supplied study does not measure hydration at 24 hours.", ruleIds: ["EU-655-4.1"], evidenceIds: ["E1"], elementIds: ["C2"] }],
  missingEvidence: [{ elementId: "C2", description: "Corneometer measurements 24 hours after a single application of F-101 rev. 3, compared with an untreated control." }],
  assessment: "needs_evidence_or_review",
  explanation: "The study supports clinically measured hydration on the marketed formula, but only up to 12 hours. The 24-hour part of the claim is not documented.",
  nextAction: { type: "revise_claim", detail: "Either obtain 24-hour data on F-101 rev. 3 or limit the claim to what the study shows.", suggestedRewrite: "Clinically proven hydration for up to 12 hours." },
};

const demoC: ModelOutput = {
  ...demoA,
  evidenceRelevance: [
    { elementId: "P", evidenceId: "E1", verdict: "mismatch", evidenceShows: "The study tested development formula F-098, not the marketed F-101 rev. 3.", quote: "formula F-098 (batch D-2510)" },
    { elementId: "C1", evidenceId: "E1", verdict: "supports", evidenceShows: "A randomised, controlled study, but on F-098.", quote: "Single-centre, randomised, controlled study." },
    { elementId: "C2", evidenceId: "E1", verdict: "supports", evidenceShows: "A significant effect at 24 hours, but for F-098.", quote: "24 hours: +14 % (p < 0.01)" },
    { elementId: "C3", evidenceId: "E1", verdict: "supports", evidenceShows: "Hydration measured with a Corneometer, on F-098.", quote: "Skin surface hydration was measured with a Corneometer CM 825" },
  ],
  applicableRules: [
    { ruleId: "EU-655-3.3", quote: "relevant to the product and to the benefit claimed", application: "A study on another formulation is not relevant to F-101 rev. 3 without bridging evidence." },
    { ruleId: "EU-655-ART2", quote: "consistent with the documentation proving the effect claimed for the cosmetic product", application: "The documentation must prove the effect for the marketed product." },
  ],
  findings: [{ severity: "blocking", summary: "The study tested formula F-098, not the marketed F-101 rev. 3.", ruleIds: ["EU-655-3.3"], evidenceIds: ["E1"], elementIds: ["P"] }],
  missingEvidence: [{ elementId: "P", description: "A 24-hour study on F-101 rev. 3, or evidence that F-098 and F-101 rev. 3 are equivalent for hydration." }],
  explanation: "The study design and results would support the claim, but they concern development formula F-098. Nothing links that result to the marketed F-101 rev. 3.",
  nextAction: { type: "request_evidence", detail: "Ask R&D for a 24-hour study on F-101 rev. 3 or a bridging assessment showing equivalence with F-098.", suggestedRewrite: null },
};

class ScriptedClient implements ModelClient {
  readonly id = "scripted (no model)";

  async complete({ user }: ModelRequest): Promise<ModelRawResult> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (user.includes("[downgrade]")) return { kind: "text", text: stub("clears-wrong-formulation.json") };
    if (user.includes("[malformed]")) return { kind: "text", text: stub("malformed.txt") };
    if (user.includes("DNL-2026-014")) return { kind: "text", text: JSON.stringify(demoA) };
    if (user.includes("DNL-2026-021")) return { kind: "text", text: stub("valid-clearance.json") };
    if (user.includes("DNL-2025-087")) return { kind: "text", text: JSON.stringify(demoC) };
    throw new ModelUnavailableError("The scripted demo only covers Demo A, B and C. Set ANTHROPIC_API_KEY and run npm run dev to assess anything else.");
  }
}

const port = Number(process.env.PORT ?? 8787);
createApp({
  kind: "scripted",
  model: "scripted",
  note: "Scripted demo: hand-written model outputs for Demo A, B and C, so the interface can be seen without an API key. The deterministic checks run for real.",
  client: new ScriptedClient(),
}).listen(port, () => console.log(`Scripted demo API on http://localhost:${port}`));
