import { createHash } from "node:crypto";
import { parseRulePack } from "../shared/rules";
import {
  ModelOutputSchema,
  type AssessRequest,
  type AssessResponse,
  type EvidenceItem,
  type ModelOutput,
  type NextAction,
  type ProductContext,
} from "../shared/schema";
import { checkCitations, checkReferences } from "./citations";
import { applyGuards } from "./guards";
import { checkIdentity } from "./identity";
import type { ModelClient, ModelRawResult } from "./llm";
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";

/** The request itself is unusable (for example duplicate rule IDs). Nothing was sent to the model. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export async function assess(request: AssessRequest, client: ModelClient): Promise<AssessResponse> {
  const started = Date.now();

  const pack = parseRulePack(request.rulesText);
  if (pack.errors.length > 0) throw new InputError(pack.errors.join(" "));

  const evidence: EvidenceItem[] = request.evidence.map((item, index) => ({
    id: `E${index + 1}`,
    title: item.title || `Evidence ${index + 1}`,
    text: item.text,
  }));
  const identity = checkIdentity(request.product, evidence);

  const raw = await client.complete({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt({ claim: request.claim, product: request.product, rules: pack.passages, evidence }),
  });

  const parsed = parseModelOutput(raw);
  const output = parsed.output ? ensureProductElement(parsed.output, request.product) : null;
  const citations = output ? checkCitations(output, pack.passages, evidence) : [];
  const references = output ? checkReferences(output, pack.passages, evidence) : [];
  const guard = applyGuards({ output, outputProblem: parsed.problem, citations, references, identity });

  return {
    finalAssessment: guard.finalAssessment,
    modelAssessment: output?.assessment ?? null,
    downgraded: guard.downgraded,
    downgradeReasons: guard.reasons,
    warnings: guard.warnings,
    nextAction: guard.downgraded || !output ? manualReview(output) : output.nextAction,
    output,
    checks: { output: { ok: output !== null, problem: parsed.problem }, citations, references, identity },
    rules: pack.passages,
    evidence,
    meta: {
      model: client.id,
      promptVersion: PROMPT_VERSION,
      rulePack: {
        name: pack.name,
        hash: createHash("sha256").update(request.rulesText.trim()).digest("hex").slice(0, 12),
        passages: pack.passages.length,
        notes: pack.notes,
      },
      latencyMs: Date.now() - started,
      assessedAt: new Date().toISOString(),
    },
  };
}

export function parseModelOutput(raw: ModelRawResult): { output: ModelOutput | null; problem: string | null } {
  if (raw.kind === "refusal") return { output: null, problem: `the model refused to answer (${raw.message})` };
  if (raw.kind === "incomplete") return { output: null, problem: `the model's response was cut off (${raw.reason})` };

  let json: unknown;
  try {
    json = JSON.parse(raw.text);
  } catch (error) {
    return { output: null, problem: `the response is not valid JSON (${error instanceof Error ? error.message : "parse error"})` };
  }
  const result = ModelOutputSchema.safeParse(lowercaseEnums(json));
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return { output: null, problem: `the response does not match the expected schema (${issues})` };
  }
  return { output: result.data, problem: null };
}

/** Structured outputs do not guarantee the capitalisation of enum values; all of ours are lower case. */
function lowercaseEnums(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const output = json as Record<string, unknown>;
  const lower = (value: unknown) => (typeof value === "string" ? value.toLowerCase() : value);
  const mapField = (list: unknown, field: string) =>
    Array.isArray(list) ? list.map((item) => (item && typeof item === "object" ? { ...item, [field]: lower((item as Record<string, unknown>)[field]) } : item)) : list;
  return {
    ...output,
    claimElements: mapField(output.claimElements, "type"),
    evidenceRelevance: mapField(output.evidenceRelevance, "verdict"),
    findings: mapField(output.findings, "severity"),
    assessment: lower(output.assessment),
    nextAction:
      output.nextAction && typeof output.nextAction === "object"
        ? { ...output.nextAction, type: lower((output.nextAction as Record<string, unknown>).type) }
        : output.nextAction,
  };
}

/** The product element is part of every assessment, even if the model leaves it out. */
function ensureProductElement(output: ModelOutput, product: ProductContext): ModelOutput {
  if (output.claimElements.some((element) => element.type === "product")) return output;
  const identity = [product.name, product.formulationId && `formulation ${product.formulationId}`].filter(Boolean).join(", ");
  return {
    ...output,
    claimElements: [
      {
        id: "P",
        type: "product",
        text: identity || "The product",
        requirement: "Evidence must concern this exact product and formulation.",
        requiresSubstantiation: output.claimElements.some((element) => element.requiresSubstantiation),
      },
      ...output.claimElements,
    ],
  };
}

function manualReview(output: ModelOutput | null): NextAction {
  return {
    type: "manual_review",
    detail: output
      ? "Do not approve on this result. Review the claim and evidence manually; the reasons above say what the automatic checks could not confirm."
      : "Nothing was assessed automatically. Run the assessment again, or review the claim and evidence manually.",
    suggestedRewrite: output?.nextAction.suggestedRewrite ?? null,
  };
}
