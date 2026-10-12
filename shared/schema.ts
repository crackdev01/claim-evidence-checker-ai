import { z } from "zod";
import {
  ASSESSMENTS,
  ELEMENT_TYPES,
  NEXT_ACTION_TYPES,
  SEVERITIES,
  VERDICTS,
  type Assessment,
  type NextActionType,
} from "./vocabulary";

export * from "./vocabulary";

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export const ProductContextSchema = z.object({
  sku: z.string().trim().max(100),
  name: z.string().trim().max(200),
  category: z.string().trim().max(200),
  market: z.string().trim().max(100),
  formulationId: z.string().trim().max(100),
});
export type ProductContext = z.infer<typeof ProductContextSchema>;

export const EvidenceInputSchema = z.object({
  title: z.string().trim().max(200),
  text: z.string().trim().min(1, "An evidence item has no text").max(40_000),
});
export type EvidenceInput = z.infer<typeof EvidenceInputSchema>;

export const AssessRequestSchema = z.object({
  claim: z.string().trim().min(1, "Enter a claim").max(2_000),
  product: ProductContextSchema,
  rulesText: z.string().trim().min(1, "Supply at least one rule").max(150_000),
  evidence: z.array(EvidenceInputSchema).max(8, "At most 8 evidence items"),
});
export type AssessRequest = z.infer<typeof AssessRequestSchema>;

// ---------------------------------------------------------------------------
// Model output. Sent to the model as a structured-output JSON schema, so every
// field is required and optional values are nullable. Field order matters: the
// model works through elements, evidence and rules before it commits to a verdict.
// ---------------------------------------------------------------------------

export const ClaimElementSchema = z.object({
  id: z.string().describe('"P" for the product element, then "C1", "C2", ... for the claim elements.'),
  type: z.enum(ELEMENT_TYPES),
  text: z.string().describe("The words of the claim this element comes from. For P: the product name and formulation."),
  requirement: z.string().describe("What evidence would have to show to support this element."),
  requiresSubstantiation: z
    .boolean()
    .describe("False only for hyperbole or abstract, subjective statements that the average consumer would not take literally."),
});

export const EvidenceRelevanceSchema = z.object({
  elementId: z.string(),
  evidenceId: z.string(),
  verdict: z.enum(VERDICTS),
  evidenceShows: z.string().describe("One sentence: what this evidence item actually shows about this element."),
  quote: z
    .string()
    .nullable()
    .describe("Words copied verbatim from the evidence item that justify the verdict. Null only when the verdict is not_addressed."),
});

export const RuleApplicationSchema = z.object({
  ruleId: z.string(),
  quote: z.string().describe("Words copied verbatim from the text of this rule passage."),
  application: z.string().describe("How this rule applies to this claim and this evidence."),
});

export const FindingSchema = z.object({
  severity: z.enum(SEVERITIES),
  summary: z.string(),
  ruleIds: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  elementIds: z.array(z.string()),
});

export const MissingEvidenceSchema = z.object({
  elementId: z.string().nullable(),
  description: z.string().describe("The specific document or data that would close the gap."),
});

export const ModelNextActionSchema = z.object({
  type: z.enum(NEXT_ACTION_TYPES),
  detail: z.string().describe("What the reviewer should do, concretely."),
  suggestedRewrite: z.string().nullable().describe("A rewording that the supplied evidence would support, if one exists."),
});

export const ModelOutputSchema = z.object({
  claimElements: z.array(ClaimElementSchema),
  evidenceRelevance: z.array(EvidenceRelevanceSchema),
  applicableRules: z.array(RuleApplicationSchema),
  findings: z.array(FindingSchema),
  missingEvidence: z.array(MissingEvidenceSchema),
  assessment: z.enum(ASSESSMENTS),
  explanation: z.string().describe("A short paragraph connecting the claim, the rules and the evidence."),
  nextAction: ModelNextActionSchema,
});

export type ClaimElement = z.infer<typeof ClaimElementSchema>;
export type EvidenceRelevance = z.infer<typeof EvidenceRelevanceSchema>;
export type RuleApplication = z.infer<typeof RuleApplicationSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type MissingEvidence = z.infer<typeof MissingEvidenceSchema>;
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

// ---------------------------------------------------------------------------
// Server response
// ---------------------------------------------------------------------------

export type RulePassage = {
  id: string;
  title: string;
  source: string;
  applicability: string;
  text: string;
};

export type EvidenceItem = { id: string; title: string; text: string };

export type CitationStatus = "verified" | "unknown_id" | "quote_not_found" | "missing_quote";

export type CitationCheck = {
  path: string;
  kind: "rule" | "evidence";
  refId: string;
  quote: string | null;
  status: CitationStatus;
};

export type ReferenceCheck = {
  path: string;
  kind: "rule" | "evidence" | "element";
  refId: string;
  ok: boolean;
};

export type IdentityCheck = {
  evidenceId: string;
  /** null when the product context has no formulation ID. */
  formulationFound: boolean | null;
  /** null when the product context has no SKU. */
  skuFound: boolean | null;
  /** Identifiers in the evidence that look like formulation IDs but differ from the product's. */
  otherIdentifiers: string[];
  confirmed: boolean;
  note: string;
};

export type NextAction = {
  type: NextActionType;
  detail: string;
  suggestedRewrite: string | null;
};

export type AssessResponse = {
  finalAssessment: Assessment;
  /** null when the model output could not be used at all. */
  modelAssessment: Assessment | null;
  downgraded: boolean;
  downgradeReasons: string[];
  warnings: string[];
  nextAction: NextAction;
  output: ModelOutput | null;
  checks: {
    output: { ok: boolean; problem: string | null };
    citations: CitationCheck[];
    references: ReferenceCheck[];
    identity: IdentityCheck[];
  };
  rules: RulePassage[];
  evidence: EvidenceItem[];
  meta: {
    model: string;
    promptVersion: string;
    rulePack: { name: string | null; hash: string; passages: number; notes: string[] };
    latencyMs: number;
    assessedAt: string;
  };
};

export type ApiError = { error: { kind: string; message: string } };

// ---------------------------------------------------------------------------
// Presets served to the UI and used by the eval
// ---------------------------------------------------------------------------

export type Scenario = {
  id: string;
  group: string;
  label: string;
  claim: string;
  product: ProductContext;
  evidence: EvidenceInput[];
};

export type ScenariosResponse = {
  defaultRulesText: string;
  scenarios: Scenario[];
  mode: { kind: "live" | "replay" | "scripted"; model: string; note: string };
};
