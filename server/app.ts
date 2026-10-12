import { existsSync } from "node:fs";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { AssessRequestSchema, type ApiError, type ScenariosResponse } from "../shared/schema";
import { assess, InputError } from "./assess";
import type { ModelMode } from "./config";
import { loadDefaultRulesText, loadScenarios, ROOT } from "./data";
import { ModelUnavailableError } from "./llm";

export function createApp(mode: ModelMode): Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const fail = (res: Response, status: number, kind: string, message: string) =>
    res.status(status).json({ error: { kind, message } } satisfies ApiError);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode: mode.kind, model: mode.model });
  });

  app.get("/api/scenarios", (_req, res) => {
    const body: ScenariosResponse = {
      defaultRulesText: loadDefaultRulesText(),
      scenarios: loadScenarios(),
      mode: { kind: mode.kind, model: mode.model, note: mode.note },
    };
    res.json(body);
  });

  app.post("/api/assess", async (req, res) => {
    const parsed = AssessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return fail(res, 400, "bad_request", message);
    }
    try {
      res.json(await assess(parsed.data, mode.client));
    } catch (error) {
      if (error instanceof InputError) return fail(res, 400, "bad_request", error.message);
      if (error instanceof ModelUnavailableError) return fail(res, 502, "model_unavailable", error.message);
      console.error(error);
      return fail(res, 500, "internal_error", "Unexpected server error. See the server log.");
    }
  });

  const webDist = `${ROOT}dist/web`;
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
      res.sendFile(`${webDist}/index.html`);
    });
  }

  return app;
}
