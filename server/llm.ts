import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";
import { ModelOutputSchema } from "../shared/schema";

export type ModelRequest = { system: string; user: string };

/** What came back from the model, before any parsing or validation. */
export type ModelRawResult =
  | { kind: "text"; text: string }
  | { kind: "refusal"; message: string }
  | { kind: "incomplete"; reason: string; text: string };

export interface ModelClient {
  /** Shown in results, e.g. "anthropic:claude-sonnet-5-5". */
  readonly id: string;
  complete(request: ModelRequest): Promise<ModelRawResult>;
}

/** The model could not be reached or refused the request at the API level. Nothing was assessed. */
export class ModelUnavailableError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * JSON schema for Anthropic structured outputs, generated from the same Zod schema the
 * server validates against. Built here rather than with the SDK's zodOutputFormat helper,
 * which moves `enum` into descriptions; the API enforces string enums, so they stay.
 */
export function structuredOutputSchema(): Record<string, unknown> {
  const adapt = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(adapt);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "$schema") continue;
      out[key] =
        key === "properties" ? Object.fromEntries(Object.entries(value as object).map(([name, schema]) => [name, adapt(schema)])) : adapt(value);
    }
    if (Array.isArray(out.type)) {
      const { type, description, ...constraints } = out;
      return {
        ...(description === undefined ? {} : { description }),
        anyOf: (type as string[]).map((t) => (t === "null" ? { type: "null" } : { type: t, ...constraints })),
      };
    }
    return out;
  };
  return adapt(z.toJSONSchema(ModelOutputSchema, { target: "draft-2020-12" })) as Record<string, unknown>;
}

/** Maps a Messages API response onto the provider-neutral result the pipeline validates. */
export function rawResultFromMessage(message: Pick<Message, "content" | "stop_reason" | "stop_details">): ModelRawResult {
  const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  if (message.stop_reason === "refusal") {
    const details = message.stop_details;
    return { kind: "refusal", message: details?.explanation ?? details?.category ?? "no explanation given" };
  }
  if (message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded") {
    return { kind: "incomplete", reason: message.stop_reason, text };
  }
  return { kind: "text", text };
}

export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic;
  private readonly schema = structuredOutputSchema();

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly effort: Effort | null = null,
    private readonly maxTokens = 16_000,
  ) {
    this.client = new Anthropic({ apiKey, timeout: 180_000, maxRetries: 1 });
  }

  get id(): string {
    return `anthropic:${this.model}`;
  }

  async complete({ system, user }: ModelRequest): Promise<ModelRawResult> {
    let message: Message;
    try {
      message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        messages: [{ role: "user", content: user }],
        output_config: {
          format: { type: "json_schema", schema: this.schema },
          ...(this.effort ? { effort: this.effort } : {}),
        },
      });
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new ModelUnavailableError(`Anthropic API error${error.status ? ` ${error.status}` : ""}: ${error.message}`, error.status ?? null);
      }
      throw new ModelUnavailableError(`Could not reach Anthropic: ${error instanceof Error ? error.message : String(error)}`);
    }
    return rawResultFromMessage(message);
  }
}

/** Returns a scripted response. Used by the eval to test the deterministic layer without a model. */
export class StubModelClient implements ModelClient {
  constructor(
    private readonly result: ModelRawResult,
    readonly id = "stub",
  ) {}

  async complete(): Promise<ModelRawResult> {
    return this.result;
  }
}

// ---------------------------------------------------------------------------
// Recordings: the eval stores live outputs so the preset scenarios can be
// replayed without an API key. Keyed by a hash of the exact prompt.
// ---------------------------------------------------------------------------

type Recording = { model: string; recordedAt: string; result: ModelRawResult };
type RecordingFile = { note: string; entries: Record<string, Recording> };

export function promptHash({ system, user }: ModelRequest): string {
  return createHash("sha256").update(system).update("\u0000").update(user).digest("hex").slice(0, 32);
}

export function loadRecordings(path: string): RecordingFile {
  if (!existsSync(path)) return { note: "", entries: {} };
  return JSON.parse(readFileSync(path, "utf8")) as RecordingFile;
}

/** Wraps a client and stores every result it returns. */
export class RecordingModelClient implements ModelClient {
  constructor(
    private readonly inner: ModelClient,
    private readonly path: string,
  ) {}

  get id(): string {
    return this.inner.id;
  }

  async complete(request: ModelRequest): Promise<ModelRawResult> {
    const result = await this.inner.complete(request);
    const file = loadRecordings(this.path);
    file.note = "Model outputs recorded by `npm run eval`, replayed by the server when no ANTHROPIC_API_KEY is set.";
    file.entries[promptHash(request)] = { model: this.inner.id, recordedAt: new Date().toISOString(), result };
    writeFileSync(this.path, `${JSON.stringify(file, null, 1)}\n`);
    return result;
  }
}

export class ReplayModelClient implements ModelClient {
  readonly id: string;

  constructor(private readonly path: string) {
    const models = [...new Set(Object.values(loadRecordings(path).entries).map((entry) => entry.model))];
    this.id = models.length > 0 ? `replay of ${models.join(", ")}` : "replay";
  }

  async complete(request: ModelRequest): Promise<ModelRawResult> {
    const recording = loadRecordings(this.path).entries[promptHash(request)];
    if (!recording) {
      throw new ModelUnavailableError(
        "Replay mode has no recorded output for these exact inputs. It only covers the unedited preset scenarios; set ANTHROPIC_API_KEY to assess anything else.",
      );
    }
    return recording.result;
  }
}
