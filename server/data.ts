import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProductContext, Scenario } from "../shared/schema";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
export const DEFAULT_RULE_PACK_PATH = `${DATA_DIR}rules/dk-cosmetic-claims.v1.txt`;
export const RECORDINGS_PATH = `${DATA_DIR}recordings.json`;

type ScenarioFile = {
  products: Record<string, ProductContext>;
  evidence: Record<string, { title: string; file: string }>;
  scenarios: { id: string; group: string; label: string; claim: string; product: string; evidence: string[] }[];
};

export function loadDefaultRulesText(): string {
  return readFileSync(DEFAULT_RULE_PACK_PATH, "utf8");
}

/** Resolves the preset file into complete inputs (product context and evidence texts). */
export function loadScenarios(): Scenario[] {
  const file = JSON.parse(readFileSync(`${DATA_DIR}scenarios.json`, "utf8")) as ScenarioFile;
  return file.scenarios.map((scenario) => {
    const product = file.products[scenario.product];
    if (!product) throw new Error(`Scenario ${scenario.id} refers to unknown product ${scenario.product}`);
    return {
      id: scenario.id,
      group: scenario.group,
      label: scenario.label,
      claim: scenario.claim,
      product,
      evidence: scenario.evidence.map((key) => {
        const ref = file.evidence[key];
        if (!ref) throw new Error(`Scenario ${scenario.id} refers to unknown evidence ${key}`);
        return { title: ref.title, text: readFileSync(`${DATA_DIR}evidence/${ref.file}`, "utf8").trim() };
      }),
    };
  });
}
