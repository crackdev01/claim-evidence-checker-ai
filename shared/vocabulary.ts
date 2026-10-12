// Vocabulary shared by the prompt, the server checks, the UI and the eval.
// Kept free of runtime dependencies so the browser bundle can import it.

export const ASSESSMENTS = ["no_issue_found", "potential_violation", "needs_evidence_or_review"] as const;
export type Assessment = (typeof ASSESSMENTS)[number];

export const ASSESSMENT_LABELS: Record<Assessment, string> = {
  no_issue_found: "No issue found",
  potential_violation: "Potential violation",
  needs_evidence_or_review: "Needs evidence or review",
};

export const ASSESSMENT_DEFINITIONS: Record<Assessment, string> = {
  no_issue_found:
    "Every element of the claim that needs substantiation is supported by supplied evidence about this exact product, no supplied evidence contradicts the claim, and no supplied rule is breached. This is not a legal clearance.",
  potential_violation:
    "As worded, the claim likely breaches a supplied rule: it falls under a rule that always applies, or the supplied evidence contradicts it (the evidence measured what the claim asserts and found no effect, or a smaller effect than claimed). Evidence that simply stops short of what the claim asserts is a gap, not a contradiction.",
  needs_evidence_or_review:
    "The claim may be lawful but has not been shown to be: evidence is missing, partial, about something else or conflicting, the case falls outside the supplied rules, or the output failed validation.",
};

export const ELEMENT_TYPES = ["product", "outcome", "magnitude", "duration", "method", "population", "other"] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const ELEMENT_TYPE_LABELS: Record<ElementType, string> = {
  product: "Product",
  outcome: "Outcome",
  magnitude: "Size of effect",
  duration: "Duration",
  method: "Method",
  population: "Population",
  other: "Other",
};

export const VERDICTS = ["supports", "partial", "mismatch", "not_addressed", "contradicts"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABELS: Record<Verdict, string> = {
  supports: "Supports",
  partial: "Partial",
  mismatch: "Mismatch",
  not_addressed: "Not addressed",
  contradicts: "Contradicts",
};

export const VERDICT_DEFINITIONS: Record<Verdict, string> = {
  supports: "Directly establishes this element for this exact product.",
  partial:
    "Addresses the element but establishes less than the claim asserts, for example a shorter duration, a smaller effect, a narrower group or a weaker method.",
  mismatch:
    "Concerns something different from the element, for example another product or formulation, another outcome, the raw material instead of the finished product, or a laboratory test instead of people.",
  not_addressed: "Says nothing about this element.",
  contradicts:
    "Measured the element and shows it is not true for this product, for example no significant effect at the claimed time point, or a smaller effect at the claimed time. Not measuring the claimed point is partial or not addressed, not a contradiction.",
};

export const NEXT_ACTION_TYPES = ["approve", "request_evidence", "revise_claim", "escalate"] as const;
export type ModelNextActionType = (typeof NEXT_ACTION_TYPES)[number];
/** "manual_review" is never chosen by the model; the server sets it when a clearance is blocked. */
export type NextActionType = ModelNextActionType | "manual_review";

export const NEXT_ACTION_LABELS: Record<NextActionType, string> = {
  approve: "Approve",
  request_evidence: "Request evidence",
  revise_claim: "Revise the claim",
  escalate: "Escalate to legal",
  manual_review: "Manual review",
};

export const SEVERITIES = ["blocking", "warning", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];
