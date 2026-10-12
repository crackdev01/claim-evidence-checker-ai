import type { ApiError, AssessRequest, AssessResponse, ScenariosResponse } from "../../shared/schema";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly kind: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function handle<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let kind = "http_error";
  let message = `The server answered with status ${response.status}.`;
  try {
    const body = (await response.json()) as ApiError;
    kind = body.error.kind;
    message = body.error.message;
  } catch {
    // Not a JSON error body; keep the generic message.
  }
  throw new ApiRequestError(message, kind, response.status);
}

export async function fetchScenarios(): Promise<ScenariosResponse> {
  return handle<ScenariosResponse>(await fetch("/api/scenarios"));
}

export async function assessClaim(request: AssessRequest, signal?: AbortSignal): Promise<AssessResponse> {
  return handle<AssessResponse>(
    await fetch("/api/assess", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    }),
  );
}

export function describeError(error: unknown): { title: string; message: string } {
  if (error instanceof ApiRequestError) {
    switch (error.kind) {
      case "model_unavailable":
        return { title: "The model could not be reached. Nothing was assessed.", message: error.message };
      case "bad_request":
        return { title: "The request was rejected. Nothing was assessed.", message: error.message };
      default:
        return { title: "Server error. Nothing was assessed.", message: error.message };
    }
  }
  return {
    title: "Could not reach the server.",
    message: "Check that the API server is running (npm run dev).",
  };
}
