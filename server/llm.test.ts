import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { describe, expect, it } from "vitest";
import { rawResultFromMessage, structuredOutputSchema } from "./llm";

type Node = Record<string, unknown>;

function walk(node: unknown, visit: (node: Node) => void) {
  if (Array.isArray(node)) node.forEach((child) => walk(child, visit));
  else if (node && typeof node === "object") {
    visit(node as Node);
    Object.values(node).forEach((child) => walk(child, visit));
  }
}

describe("structuredOutputSchema", () => {
  const schema = structuredOutputSchema();

  it("keeps enums so the API enforces the allowed values", () => {
    const properties = schema.properties as Record<string, Node>;
    expect(properties.assessment).toEqual({ type: "string", enum: ["no_issue_found", "potential_violation", "needs_evidence_or_review"] });
  });

  it("closes every object and requires every property", () => {
    walk(schema, (node) => {
      if (node.type !== "object") return;
      expect(node.additionalProperties).toBe(false);
      expect(new Set(node.required as string[])).toEqual(new Set(Object.keys(node.properties as object)));
    });
  });

  it("expresses nullable fields with anyOf and drops keywords the API does not need", () => {
    const quote = ((schema.properties as Record<string, Node>).evidenceRelevance!.items as Node).properties as Record<string, Node>;
    expect(quote.quote).toMatchObject({ anyOf: [{ type: "string" }, { type: "null" }] });
    walk(schema, (node) => {
      expect(Array.isArray(node.type)).toBe(false);
      expect(node).not.toHaveProperty("$schema");
    });
  });
});

describe("rawResultFromMessage", () => {
  const message = (overrides: Partial<Message>) =>
    ({ content: [{ type: "text", text: '{"a":1}', citations: null }], stop_reason: "end_turn", stop_details: null, ...overrides }) as Message;

  it("returns the text of a completed response", () => {
    expect(rawResultFromMessage(message({}))).toEqual({ kind: "text", text: '{"a":1}' });
  });

  it("treats a refusal as unusable output, with the explanation when there is one", () => {
    const refused = message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms", explanation: "Declined." } });
    expect(rawResultFromMessage(refused)).toEqual({ kind: "refusal", message: "Declined." });
  });

  it("treats a response cut off by the token or context limit as incomplete", () => {
    expect(rawResultFromMessage(message({ stop_reason: "max_tokens" }))).toMatchObject({ kind: "incomplete", reason: "max_tokens" });
    expect(rawResultFromMessage(message({ stop_reason: "model_context_window_exceeded" }))).toMatchObject({ kind: "incomplete" });
  });
});
