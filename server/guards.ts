import type { Assessment, CitationCheck, IdentityCheck, ModelOutput, ReferenceCheck } from "../shared/schema";

export type GuardInput = {
  output: ModelOutput | null;
  outputProblem: string | null;
  citations: CitationCheck[];
  references: ReferenceCheck[];
  identity: IdentityCheck[];
};

export type GuardResult = {
  finalAssessment: Assessment;
  downgraded: boolean;
  /** Why a proposed clearance was blocked. */
  reasons: string[];
  /** Problems that do not change a non-clearing result but that the reviewer should see. */
  warnings: string[];
};

/**
 * Decides whether the model's proposed assessment can stand. The guards can only
 * make the result stricter: "no_issue_found" survives only if every check passes,
 * and nothing is ever changed into "no_issue_found".
 */
export function applyGuards({ output, outputProblem, citations, references, identity }: GuardInput): GuardResult {
  if (!output) {
    return {
      finalAssessment: "needs_evidence_or_review",
      downgraded: true,
      reasons: [`The model output could not be used: ${outputProblem ?? "unknown problem"}.`],
      warnings: [],
    };
  }

  const unverified = citations.filter((c) => c.status !== "verified");
  const badReferences = references.filter((r) => !r.ok);
  const integrityProblems: string[] = [];
  if (unverified.length > 0) {
    const examples = unverified
      .slice(0, 3)
      .map((c) => `${c.refId} (${describeStatus(c.status)})`)
      .join(", ");
    integrityProblems.push(`${unverified.length} of ${citations.length} citations could not be verified against the supplied text: ${examples}.`);
  }
  if (badReferences.length > 0) {
    const ids = [...new Set(badReferences.map((r) => r.refId))].slice(0, 5).join(", ");
    integrityProblems.push(`The output refers to IDs that do not exist: ${ids}.`);
  }

  if (output.assessment !== "no_issue_found") {
    return { finalAssessment: output.assessment, downgraded: false, reasons: [], warnings: integrityProblems };
  }

  const reasons = [...integrityProblems];
  const verifiedEvidence = new Set(
    citations.filter((c) => c.kind === "evidence" && c.status === "verified").map((c) => c.path),
  );
  const confirmedIdentity = new Map(identity.map((check) => [check.evidenceId, check]));
  const unsupported: string[] = [];
  const wrongProduct = new Map<string, string[]>();
  const contradicted: string[] = [];

  for (const element of output.claimElements.filter((e) => e.requiresSubstantiation)) {
    const label = `${element.id} ("${element.text}")`;
    const entries = output.evidenceRelevance
      .map((entry, index) => ({ entry, path: `evidenceRelevance[${index}]` }))
      .filter(({ entry }) => entry.elementId === element.id);
    const supporting = entries.filter(({ entry, path }) => entry.verdict === "supports" && verifiedEvidence.has(path));
    const onThisProduct = supporting.filter(({ entry }) => confirmedIdentity.get(entry.evidenceId)?.confirmed === true);

    if (supporting.length === 0) {
      unsupported.push(label);
    } else if (onThisProduct.length === 0) {
      const notes = supporting.map(({ entry }) => `${entry.evidenceId}: ${confirmedIdentity.get(entry.evidenceId)?.note ?? "unknown"}`).join("; ");
      wrongProduct.set(notes, [...(wrongProduct.get(notes) ?? []), element.id]);
    }
    for (const { entry } of entries.filter(({ entry }) => entry.verdict === "contradicts")) {
      contradicted.push(`${entry.evidenceId} contradicts ${label}`);
    }
  }

  if (unsupported.length > 0) reasons.push(`No supporting evidence with a verified quote for ${unsupported.join(", ")}.`);
  for (const [notes, elementIds] of wrongProduct) {
    reasons.push(`${elementIds.join(", ")} ${elementIds.length === 1 ? "is" : "are"} only supported by evidence that does not identify this product (${notes}).`);
  }
  if (contradicted.length > 0) reasons.push(`${contradicted.join("; ")}.`);

  if (output.missingEvidence.length > 0) {
    reasons.push(`The model listed ${output.missingEvidence.length} missing evidence item(s) but still proposed no issue.`);
  }
  const blocking = output.findings.filter((f) => f.severity === "blocking");
  if (blocking.length > 0) {
    reasons.push(`The model reported ${blocking.length} blocking finding(s) but still proposed no issue.`);
  }
  if (!citations.some((c) => c.kind === "rule" && c.status === "verified")) {
    reasons.push("No supplied rule was cited with a verified quote, so it is unclear what the claim was checked against.");
  }

  if (reasons.length > 0) {
    return { finalAssessment: "needs_evidence_or_review", downgraded: true, reasons, warnings: [] };
  }
  return { finalAssessment: "no_issue_found", downgraded: false, reasons: [], warnings: [] };
}

function describeStatus(status: CitationCheck["status"]): string {
  switch (status) {
    case "unknown_id":
      return "unknown ID";
    case "quote_not_found":
      return "quote not found in source";
    case "missing_quote":
      return "no quote given";
    case "verified":
      return "verified";
  }
}
