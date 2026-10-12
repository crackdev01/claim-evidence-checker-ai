import type { CitationStatus, IdentityCheck } from "../../../shared/schema";
import { ASSESSMENT_LABELS, VERDICT_DEFINITIONS, VERDICT_LABELS, type Assessment, type Verdict } from "../../../shared/vocabulary";

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`chip verdict-${verdict}`} title={VERDICT_DEFINITIONS[verdict]}>
      {VERDICT_LABELS[verdict]}
    </span>
  );
}

export function AssessmentPill({ assessment }: { assessment: Assessment }) {
  return <span className={`pill assessment-${assessment}`}>{ASSESSMENT_LABELS[assessment]}</span>;
}

const CITATION_TEXT: Record<CitationStatus, string> = {
  verified: "Verified in source",
  quote_not_found: "Not found in source",
  unknown_id: "Unknown source ID",
  missing_quote: "No quote given",
};

export function CitationBadge({ status }: { status: CitationStatus | undefined }) {
  if (!status) return null;
  return <span className={`badge ${status === "verified" ? "ok" : "bad"}`}>{status === "verified" ? "✓ " : "✗ "}{CITATION_TEXT[status]}</span>;
}

export function IdentityBadge({ check }: { check: IdentityCheck | undefined }) {
  if (!check) return null;
  return (
    <span className={`badge ${check.confirmed ? "ok" : "bad"}`} title={check.note}>
      {check.confirmed ? "✓ " : "✗ "}
      {check.note}
    </span>
  );
}
