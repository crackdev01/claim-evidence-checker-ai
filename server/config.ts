import { existsSync } from "node:fs";
import { RECORDINGS_PATH } from "./data";
import { AnthropicModelClient, ReplayModelClient, type Effort, type ModelClient } from "./llm";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export type ModelMode = { kind: "live" | "replay" | "scripted"; model: string; note: string; client: ModelClient };

/** Live Anthropic calls when a key is set; otherwise replay of outputs recorded by the eval. */
export function resolveModelMode(env: NodeJS.ProcessEnv = process.env): ModelMode {
  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const effort = (env.ANTHROPIC_EFFORT?.trim() || null) as Effort | null;
  const maxTokens = Number(env.ANTHROPIC_MAX_TOKENS?.trim() || 16_000);
  const apiKey = env.ANTHROPIC_API_KEY?.trim();

  if (apiKey && env.MODEL_MODE !== "replay") {
    return { kind: "live", model, note: `Live calls to ${model}.`, client: new AnthropicModelClient(apiKey, model, effort, maxTokens) };
  }
  const hasRecordings = existsSync(RECORDINGS_PATH);
  return {
    kind: "replay",
    model: "replay",
    note: hasRecordings
      ? "Replay mode: no ANTHROPIC_API_KEY is set, so the server returns model outputs recorded during the evaluation. Only the unedited preset scenarios can be assessed."
      : "No ANTHROPIC_API_KEY is set and there are no recorded outputs, so assessments will fail. Add a key to .env.",
    client: new ReplayModelClient(RECORDINGS_PATH),
  };
}
