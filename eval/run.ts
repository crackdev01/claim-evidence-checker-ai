// Runs the labelled cases through the same assess() pipeline the UI uses and
// reports agreement with the provisional labels and false clearances, as counts.
//
//   npm run eval                       all cases, 1 run each (live cases need ANTHROPIC_API_KEY)
//   npm run eval -- --runs 3           repeat every live case to see how stable the verdicts are
//   npm run eval -- --stub-only        only the scripted cases (no key needed)
//   npm run eval -- --only demo-a-duration-gap,demo-b-clean-pass
//   npm run eval -- --no-record        do not update data/recordings.json
//   npm run eval -- --print-prompt demo-a-duration-gap   print the exact model input for one case and exit
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseRulePack } from "../shared/rules";
import { AssessRequestSchema, type Assessment, type AssessResponse } from "../shared/schema";
import { ELEMENT_TYPES } from "../shared/vocabulary";
import { assess } from "../server/assess";
import { resolveModelMode } from "../server/config";
import { loadDefaultRulesText, loadScenarios, RECORDINGS_PATH, ROOT } from "../server/data";
import { ModelUnavailableError, RecordingModelClient, StubModelClient, type ModelClient } from "../server/llm";
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from "../server/prompt";

type Expected = { assessment: Assessment; flaggedAnyOf: string[]; citeAnyOf: string[] };
type EvalCase = { id: string; scenario: string; category: string; heldOut: boolean; stub?: string; expected: Expected; rationale: string };
type CaseFile = { labelSource: string; labelledOn: string; cases: EvalCase[] };

type RunOutcome = {
  final: Assessment | null;
  model: Assessment | null;
  error: string | null;
  assessmentMatch: boolean;
  falseClearance: boolean;
  flaggedOk: boolean | null;
  citedOk: boolean | null;
  flaggedTypes: string[];
  citedRules: string[];
  downgradeReasons: string[];
  citations: { verified: number; total: number };
  nextAction: string | null;
  latencyMs: number | null;
  result: AssessResponse | null;
};

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const runs = Math.max(1, Number(option("--runs") ?? 1));
const only = option("--only")?.split(",").map((id) => id.trim());
const stubOnly = flag("--stub-only");
const record = !flag("--no-record");

const caseFile = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8")) as CaseFile;
const scenarios = new Map(loadScenarios().map((scenario) => [scenario.id, scenario]));
const rulesText = loadDefaultRulesText();
const rulePack = parseRulePack(rulesText);
const printPrompt = option("--print-prompt");
if (printPrompt) {
  const testCase = caseFile.cases.find((c) => c.id === printPrompt);
  const scenario = testCase && scenarios.get(testCase.scenario);
  if (!scenario) throw new Error(`Unknown case ${printPrompt}`);
  const evidence = scenario.evidence.map((item, index) => ({ id: `E${index + 1}`, title: item.title, text: item.text }));
  console.log(`=== SYSTEM (${PROMPT_VERSION}) ===\n${SYSTEM_PROMPT}\n\n=== USER ===\n${buildUserPrompt({ claim: scenario.claim, product: scenario.product, rules: rulePack.passages, evidence })}`);
  process.exit(0);
}

const mode = resolveModelMode();
// Without a key, recorded outputs (if any) are re-scored, so changes to the deterministic checks can be evaluated offline.
const liveClient: ModelClient | null =
  mode.kind === "live"
    ? record
      ? new RecordingModelClient(mode.client, RECORDINGS_PATH)
      : mode.client
    : existsSync(RECORDINGS_PATH)
      ? mode.client
      : null;

/** An element is flagged when it needs substantiation and ends up unsupported, contradicted or listed as missing. */
function flaggedTypes(result: AssessResponse): string[] {
  const output = result.output;
  if (!output) return [];
  const missing = new Set(output.missingEvidence.map((gap) => gap.elementId));
  const types = output.claimElements
    .filter((element) => element.requiresSubstantiation)
    .filter((element) => {
      const entries = output.evidenceRelevance.filter((entry) => entry.elementId === element.id);
      return !entries.some((e) => e.verdict === "supports") || entries.some((e) => e.verdict === "contradicts") || missing.has(element.id);
    })
    .map((element) => element.type);
  return [...new Set(types)];
}

function citedRules(result: AssessResponse): string[] {
  const output = result.output;
  if (!output) return [];
  const verified = result.checks.citations.filter((c) => c.kind === "rule" && c.status === "verified").map((c) => c.refId);
  const known = new Set(rulePack.passages.map((p) => p.id));
  const fromFindings = output.findings.flatMap((finding) => finding.ruleIds).filter((id) => known.has(id));
  return [...new Set([...verified, ...fromFindings])];
}

function score(testCase: EvalCase, result: AssessResponse | null, error: string | null): RunOutcome {
  if (!result) {
    return {
      final: null, model: null, error, assessmentMatch: false, falseClearance: false, flaggedOk: null, citedOk: null,
      flaggedTypes: [], citedRules: [], downgradeReasons: [], citations: { verified: 0, total: 0 }, nextAction: null, latencyMs: null, result: null,
    };
  }
  const { expected } = testCase;
  const flagged = flaggedTypes(result);
  const cited = citedRules(result);
  const wanted = expected.flaggedAnyOf.includes("*") ? ELEMENT_TYPES.filter((t) => t !== "product") : expected.flaggedAnyOf;
  return {
    final: result.finalAssessment,
    model: result.modelAssessment,
    error: null,
    assessmentMatch: result.finalAssessment === expected.assessment,
    falseClearance: result.finalAssessment === "no_issue_found" && expected.assessment !== "no_issue_found",
    flaggedOk: expected.flaggedAnyOf.length === 0 ? null : wanted.some((type) => flagged.includes(type)),
    citedOk: expected.citeAnyOf.length === 0 ? null : expected.citeAnyOf.some((id) => cited.includes(id)),
    flaggedTypes: flagged,
    citedRules: cited,
    downgradeReasons: result.downgradeReasons,
    citations: { verified: result.checks.citations.filter((c) => c.status === "verified").length, total: result.checks.citations.length },
    nextAction: result.nextAction.type,
    latencyMs: result.meta.latencyMs,
    result,
  };
}

const selected = caseFile.cases.filter((c) => (!only || only.includes(c.id)) && (!stubOnly || c.stub));
const results: { testCase: EvalCase; outcomes: RunOutcome[]; skipped: string | null }[] = [];

for (const testCase of selected) {
  const scenario = scenarios.get(testCase.scenario);
  if (!scenario) throw new Error(`Case ${testCase.id}: unknown scenario ${testCase.scenario}`);
  const request = AssessRequestSchema.parse({ claim: scenario.claim, product: scenario.product, rulesText, evidence: scenario.evidence });

  let client: ModelClient | null;
  if (testCase.stub) {
    client = new StubModelClient({ kind: "text", text: readFileSync(new URL(testCase.stub, import.meta.url), "utf8") }, `stub:${testCase.stub}`);
  } else {
    client = liveClient;
  }
  if (!client) {
    results.push({ testCase, outcomes: [], skipped: "not run (no Anthropic API key)" });
    console.log(`- ${testCase.id}: not run (no Anthropic API key)`);
    continue;
  }

  const outcomes: RunOutcome[] = [];
  for (let run = 0; run < (testCase.stub ? 1 : runs); run++) {
    let result: AssessResponse | null = null;
    let error: string | null = null;
    try {
      result = await assess(request, client);
    } catch (err) {
      error = err instanceof ModelUnavailableError ? err.message : String(err);
    }
    const outcome = score(testCase, result, error);
    outcomes.push(outcome);
    const mark = outcome.error ? "ERROR" : outcome.assessmentMatch ? "ok" : "MISMATCH";
    console.log(
      `- ${testCase.id}${runs > 1 && !testCase.stub ? ` (run ${run + 1})` : ""}: ${mark} expected=${testCase.expected.assessment} final=${outcome.final ?? "-"}` +
        `${outcome.model && outcome.model !== outcome.final ? ` (model: ${outcome.model})` : ""}${outcome.error ? ` ${outcome.error}` : ""}`,
    );
  }
  results.push({ testCase, outcomes, skipped: null });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

type Group = { label: string; items: typeof results };
const live = results.filter((r) => !r.testCase.stub);
const groups: Group[] = [
  { label: "Live model, all cases", items: live },
  { label: "Live model, development cases", items: live.filter((r) => !r.testCase.heldOut) },
  { label: "Live model, held-out cases", items: live.filter((r) => r.testCase.heldOut) },
  { label: "Scripted stubs (deterministic layer only)", items: results.filter((r) => r.testCase.stub) },
];

function summarize(items: typeof results) {
  const ran = items.filter((r) => r.outcomes.length > 0);
  const outcomes = ran.flatMap((r) => r.outcomes);
  const scored = outcomes.filter((o) => !o.error);
  const shouldReview = ran.flatMap((r) => r.outcomes.filter((o) => !o.error).map(() => r.testCase.expected.assessment)).filter((a) => a !== "no_issue_found").length;
  const flaggedApplicable = scored.filter((o) => o.flaggedOk !== null);
  const citedApplicable = scored.filter((o) => o.citedOk !== null);
  const stable = ran.filter((r) => r.outcomes.length > 1 && new Set(r.outcomes.map((o) => o.final)).size === 1).length;
  const multi = ran.filter((r) => r.outcomes.length > 1).length;
  return {
    cases: items.length,
    casesRun: ran.length,
    runs: outcomes.length,
    errors: outcomes.length - scored.length,
    assessmentMatches: scored.filter((o) => o.assessmentMatch).length,
    scored: scored.length,
    falseClearances: scored.filter((o) => o.falseClearance).length,
    shouldReview,
    flaggedOk: flaggedApplicable.filter((o) => o.flaggedOk).length,
    flaggedApplicable: flaggedApplicable.length,
    citedOk: citedApplicable.filter((o) => o.citedOk).length,
    citedApplicable: citedApplicable.length,
    stableCases: multi ? `${stable} of ${multi}` : "n/a",
  };
}

const summaries = groups.map((group) => ({ label: group.label, ...summarize(group.items) }));
const firstResult = results.flatMap((r) => r.outcomes).find((o) => o.result)?.result;
const meta = {
  ranAt: new Date().toISOString(),
  model: liveClient?.id ?? "none (stub cases only)",
  promptVersion: PROMPT_VERSION,
  rulePack: { name: rulePack.name, hash: firstResult?.meta.rulePack.hash ?? null, passages: rulePack.passages.length },
  runsPerLiveCase: runs,
  labelSource: caseFile.labelSource,
  labelledOn: caseFile.labelledOn,
};

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${n} of ${d}`);
const lines: string[] = [];
lines.push("# Evaluation results", "");
lines.push(
  `Run ${meta.ranAt.slice(0, 16).replace("T", " ")} UTC · model \`${meta.model}\` · prompt \`${meta.promptVersion}\` · rule pack \`${meta.rulePack.name}\` (#${meta.rulePack.hash ?? "-"}, ${meta.rulePack.passages} passages) · ${runs} run(s) per live case.`,
  "",
  `Labels are **${meta.labelSource}**, written ${meta.labelledOn}. ${caseFile.cases.length} cases in total. This is a small development benchmark, not a measure of production accuracy.`,
  "",
);
const notRun = results.filter((r) => r.skipped).length;
if (notRun > 0) {
  lines.push(
    `> **Live-model results pending.** ${notRun} live case(s) were not run because no Anthropic API key was available. Set \`ANTHROPIC_API_KEY\` in \`.env\` and run \`npm run eval\` to fill them in.`,
    "",
  );
}
lines.push("| Group | Cases run | Expected assessment reached | False clearances | Expected element flagged | Expected rule cited | Errors |");
lines.push("| --- | --- | --- | --- | --- | --- | --- |");
for (const s of summaries) {
  lines.push(
    `| ${s.label} | ${s.casesRun} of ${s.cases}${s.runs !== s.casesRun ? ` (${s.runs} runs)` : ""} | ${pct(s.assessmentMatches, s.scored)} | ${s.shouldReview ? `${s.falseClearances} of ${s.shouldReview} that should need review` : "n/a"} | ${pct(s.flaggedOk, s.flaggedApplicable)} | ${pct(s.citedOk, s.citedApplicable)} | ${s.errors} |`,
  );
}
if (runs > 1) lines.push("", `Cases with the same final assessment in every run: ${summaries[0]?.stableCases}.`);
lines.push("", "## Cases", "");
lines.push("| Case | Category | Held out | Expected | Final (model) | Match | Flagged types | Rules cited |");
lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const { testCase, outcomes, skipped } of results) {
  if (skipped) {
    lines.push(`| ${testCase.id} | ${testCase.category} | ${testCase.heldOut ? "yes" : ""} | ${testCase.expected.assessment} | ${skipped} | | | |`);
    continue;
  }
  for (const [index, o] of outcomes.entries()) {
    const finalText = o.error ? `error: ${o.error}` : `${o.final}${o.model && o.model !== o.final ? ` (model: ${o.model})` : ""}`;
    lines.push(
      `| ${testCase.id}${outcomes.length > 1 ? ` #${index + 1}` : ""} | ${testCase.category} | ${testCase.heldOut ? "yes" : ""} | ${testCase.expected.assessment} | ${finalText} | ${o.assessmentMatch ? "yes" : "**no**"}${o.falseClearance ? " (false clearance)" : ""} | ${o.flaggedTypes.join(", ") || "-"} | ${o.citedRules.join(", ") || "-"} |`,
    );
  }
}
const misses = results.filter((r) => r.outcomes.some((o) => !o.assessmentMatch));
if (misses.length > 0) {
  lines.push("", "## Disagreements with the provisional labels", "");
  for (const { testCase, outcomes } of misses) {
    const o = outcomes.find((x) => !x.assessmentMatch)!;
    lines.push(`### ${testCase.id}`, "", `- Expected **${testCase.expected.assessment}**: ${testCase.rationale}`);
    if (o.error) lines.push(`- Error: ${o.error}`);
    else {
      lines.push(`- Got **${o.final}**${o.model !== o.final ? ` (model proposed ${o.model})` : ""}. Model explanation: ${o.result?.output?.explanation ?? "(no usable output)"}`);
      if (o.downgradeReasons.length) lines.push(`- Downgrade reasons: ${o.downgradeReasons.join(" ")}`);
    }
    lines.push("");
  }
}

const outDir = `${ROOT}eval/results`;
mkdirSync(`${outDir}/runs`, { recursive: true });
const json = JSON.stringify(
  {
    meta,
    summaries,
    cases: results.map(({ testCase, outcomes, skipped }) => ({
      ...testCase,
      skipped,
      outcomes: outcomes.map(({ result, ...rest }) => ({ ...rest, output: result?.output ?? null, checks: result?.checks ?? null })),
    })),
  },
  null,
  1,
);
const stamp = meta.ranAt.replace(/[:.]/g, "-");
writeFileSync(`${outDir}/runs/${stamp}.json`, json);
writeFileSync(`${outDir}/runs/${stamp}.md`, `${lines.join("\n")}\n`);
const fullRun = !only && !stubOnly;
if (fullRun) {
  writeFileSync(`${outDir}/latest.json`, json);
  writeFileSync(`${outDir}/latest.md`, `${lines.join("\n")}\n`);
}

console.log("");
for (const s of summaries) {
  if (s.casesRun === 0) continue;
  console.log(
    `${s.label}: expected assessment ${pct(s.assessmentMatches, s.scored)}; false clearances ${pct(s.falseClearances, s.shouldReview)}; element flagged ${pct(s.flaggedOk, s.flaggedApplicable)}; rule cited ${pct(s.citedOk, s.citedApplicable)}; errors ${s.errors}`,
  );
}
console.log(`\nWrote eval/results/runs/${stamp}.md${fullRun ? " and eval/results/latest.md" : ""}`);
