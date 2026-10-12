import { normalizeText } from "../../shared/quotes";
import type { AssessResponse, ClaimElement, ProductContext } from "../../shared/schema";
import {
  ASSESSMENT_LABELS,
  ELEMENT_TYPE_LABELS,
  VERDICT_LABELS,
  type Assessment,
  type ElementType,
  type Verdict,
} from "../../shared/vocabulary";

export type EvidenceDraft = { key: number; title: string; text: string };
export type FormState = { claim: string; product: ProductContext; rulesText: string; evidence: EvidenceDraft[] };
export type RunRecord = { result: AssessResponse; inputs: FormState };

type ElementStatus = Verdict | "missing" | "not_required";

const STATUS_LABELS: Record<ElementStatus, string> = { ...VERDICT_LABELS, missing: "No evidence", not_required: "Not required" };

type ElementSummary = { type: ElementType; text: string; status: ElementStatus; reason: string | null };

/** One status per claim element across all evidence: a contradiction outweighs support, support outweighs gaps. */
function summarize(result: AssessResponse): ElementSummary[] {
  const output = result.output;
  if (!output) return [];
  const order: Verdict[] = ["contradicts", "supports", "partial", "mismatch", "not_addressed"];
  return output.claimElements.map((element: ClaimElement) => {
    if (!element.requiresSubstantiation) return { type: element.type, text: element.text, status: "not_required", reason: null };
    const entries = output.evidenceRelevance.filter((entry) => entry.elementId === element.id);
    const best = order.map((verdict) => entries.find((entry) => entry.verdict === verdict)).find(Boolean);
    return {
      type: element.type,
      text: element.text,
      status: best ? best.verdict : "missing",
      reason: best ? `${best.evidenceId}: ${best.evidenceShows}` : null,
    };
  });
}

function matchElement(target: ElementSummary, candidates: ElementSummary[]): ElementSummary | undefined {
  const key = normalizeText(target.text).replace(/[^\p{L}\p{N}]+/gu, "");
  const exact = candidates.find((c) => c.type === target.type && normalizeText(c.text).replace(/[^\p{L}\p{N}]+/gu, "") === key);
  if (exact) return exact;
  const sameType = candidates.filter((c) => c.type === target.type);
  return sameType.length === 1 ? sameType[0] : undefined;
}

export type RunDiff = {
  from: Assessment;
  to: Assessment;
  inputChanges: string[];
  elementChanges: { label: string; from: string; to: string; reason: string | null }[];
};

export function diffRuns(previous: RunRecord, current: RunRecord): RunDiff {
  const inputChanges: string[] = [];
  const a = previous.inputs;
  const b = current.inputs;
  if (a.claim.trim() !== b.claim.trim()) inputChanges.push(`Claim changed to "${b.claim.trim()}".`);
  const productFields: (keyof ProductContext)[] = ["sku", "name", "formulationId", "category", "market"];
  for (const field of productFields) {
    if (a.product[field].trim() !== b.product[field].trim()) inputChanges.push(`Product ${field} changed to "${b.product[field].trim()}".`);
  }
  const fingerprint = (e: EvidenceDraft) => `${e.title.trim()}\u0000${e.text.trim()}`;
  const before = new Set(a.evidence.map(fingerprint));
  const after = new Set(b.evidence.map(fingerprint));
  const removed = a.evidence.filter((e) => !after.has(fingerprint(e))).map((e) => `"${e.title || "untitled"}"`);
  const added = b.evidence.filter((e) => !before.has(fingerprint(e))).map((e) => `"${e.title || "untitled"}"`);
  if (removed.length) inputChanges.push(`Evidence removed: ${removed.join(", ")}.`);
  if (added.length) inputChanges.push(`Evidence added: ${added.join(", ")}.`);
  if (previous.result.meta.rulePack.hash !== current.result.meta.rulePack.hash) inputChanges.push("The supplied legal text changed.");

  const previousElements = summarize(previous.result);
  const elementChanges = summarize(current.result).flatMap((element) => {
    const match = matchElement(element, previousElements);
    if (!match || match.status === element.status) return [];
    return [
      {
        label: `${ELEMENT_TYPE_LABELS[element.type]} "${element.text}"`,
        from: STATUS_LABELS[match.status],
        to: STATUS_LABELS[element.status],
        reason: element.reason,
      },
    ];
  });

  return { from: previous.result.finalAssessment, to: current.result.finalAssessment, inputChanges, elementChanges };
}

export const assessmentLabel = (assessment: Assessment) => ASSESSMENT_LABELS[assessment];

/** Compares what was assessed, ignoring React keys and surrounding whitespace. */
export function sameInputs(a: FormState, b: FormState): boolean {
  const canonical = (form: FormState) =>
    JSON.stringify([
      form.claim.trim(),
      Object.values(form.product).map((value) => value.trim()),
      form.rulesText.trim(),
      form.evidence.map((item) => [item.title.trim(), item.text.trim()]),
    ]);
  return canonical(a) === canonical(b);
}
