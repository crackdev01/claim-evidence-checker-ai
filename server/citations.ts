import { findQuote } from "../shared/quotes";
import type { CitationCheck, EvidenceItem, ModelOutput, ReferenceCheck, RulePassage } from "../shared/schema";

/** Every quote the model gives must occur in the passage or evidence item it cites. */
export function checkCitations(output: ModelOutput, rules: RulePassage[], evidence: EvidenceItem[]): CitationCheck[] {
  const ruleText = new Map(rules.map((rule) => [rule.id, rule.text]));
  const evidenceText = new Map(evidence.map((item) => [item.id, item.text]));
  const checks: CitationCheck[] = [];

  output.applicableRules.forEach((rule, index) => {
    const source = ruleText.get(rule.ruleId);
    checks.push({
      path: `applicableRules[${index}]`,
      kind: "rule",
      refId: rule.ruleId,
      quote: rule.quote,
      status: source === undefined ? "unknown_id" : !rule.quote.trim() ? "missing_quote" : findQuote(source, rule.quote).found ? "verified" : "quote_not_found",
    });
  });

  output.evidenceRelevance.forEach((entry, index) => {
    if (entry.verdict === "not_addressed" && !entry.quote) return;
    const source = evidenceText.get(entry.evidenceId);
    checks.push({
      path: `evidenceRelevance[${index}]`,
      kind: "evidence",
      refId: entry.evidenceId,
      quote: entry.quote,
      status:
        source === undefined ? "unknown_id" : !entry.quote?.trim() ? "missing_quote" : findQuote(source, entry.quote).found ? "verified" : "quote_not_found",
    });
  });

  return checks;
}

/** IDs referenced without a quote (findings, missing evidence, relevance rows) must also exist. */
export function checkReferences(output: ModelOutput, rules: RulePassage[], evidence: EvidenceItem[]): ReferenceCheck[] {
  const ruleIds = new Set(rules.map((rule) => rule.id));
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const elementIds = new Set(output.claimElements.map((element) => element.id));
  const checks: ReferenceCheck[] = [];

  output.evidenceRelevance.forEach((entry, index) => {
    checks.push({ path: `evidenceRelevance[${index}].elementId`, kind: "element", refId: entry.elementId, ok: elementIds.has(entry.elementId) });
  });
  output.findings.forEach((finding, index) => {
    finding.ruleIds.forEach((id) => checks.push({ path: `findings[${index}].ruleIds`, kind: "rule", refId: id, ok: ruleIds.has(id) }));
    finding.evidenceIds.forEach((id) => checks.push({ path: `findings[${index}].evidenceIds`, kind: "evidence", refId: id, ok: evidenceIds.has(id) }));
    finding.elementIds.forEach((id) => checks.push({ path: `findings[${index}].elementIds`, kind: "element", refId: id, ok: elementIds.has(id) }));
  });
  output.missingEvidence.forEach((gap, index) => {
    if (gap.elementId !== null)
      checks.push({ path: `missingEvidence[${index}].elementId`, kind: "element", refId: gap.elementId, ok: elementIds.has(gap.elementId) });
  });

  return checks;
}
