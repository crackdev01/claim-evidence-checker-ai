import { useEffect, useMemo, useRef, useState } from "react";
import type { Scenario, ScenariosResponse } from "../../shared/schema";
import { assessClaim, describeError, fetchScenarios } from "./api";
import { InputPanel } from "./components/InputPanel";
import { ResultPanel } from "./components/ResultPanel";
import { diffRuns, sameInputs, type FormState, type RunRecord } from "./diff";

let evidenceKey = 0;
const newEvidenceKey = () => ++evidenceKey;

const EMPTY_FORM: FormState = {
  claim: "",
  product: { sku: "", name: "", category: "", market: "DK", formulationId: "" },
  rulesText: "",
  evidence: [],
};

function formFromScenario(scenario: Scenario, rulesText: string): FormState {
  return {
    claim: scenario.claim,
    product: { ...scenario.product },
    rulesText,
    evidence: scenario.evidence.map((item) => ({ key: newEvidenceKey(), ...item })),
  };
}

export default function App() {
  const [config, setConfig] = useState<ScenariosResponse | null>(null);
  const [configError, setConfigError] = useState<{ title: string; message: string } | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [scenarioId, setScenarioId] = useState("");
  const [edited, setEdited] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [current, setCurrent] = useState<RunRecord | null>(null);
  const [previous, setPrevious] = useState<RunRecord | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchScenarios()
      .then((loaded) => {
        if (cancelled) return;
        setConfig(loaded);
        const first = loaded.scenarios[0];
        if (first) {
          setForm(formFromScenario(first, loaded.defaultRulesText));
          setScenarioId(first.id);
        } else {
          setForm({ ...EMPTY_FORM, rulesText: loaded.defaultRulesText });
        }
      })
      .catch((err: unknown) => !cancelled && setConfigError(describeError(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const loadScenario = (id: string) => {
    const scenario = config?.scenarios.find((s) => s.id === id);
    if (!scenario || !config) return;
    setForm(formFromScenario(scenario, form.rulesText || config.defaultRulesText));
    setScenarioId(id);
    setEdited(false);
  };

  const runAssessment = async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const inputs = form;
    setStatus("loading");
    setError(null);
    try {
      const result = await assessClaim(
        {
          claim: inputs.claim,
          product: inputs.product,
          rulesText: inputs.rulesText,
          evidence: inputs.evidence.map(({ title, text }) => ({ title, text })),
        },
        controller.signal,
      );
      setPrevious(current);
      setCurrent({ result, inputs });
      setStatus("done");
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(describeError(err));
      setStatus("error");
    }
  };

  const diff = useMemo(() => (previous && current ? diffRuns(previous, current) : null), [previous, current]);
  const inputsChanged = useMemo(() => (current ? !sameInputs(form, current.inputs) : false), [form, current]);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Claim evidence check</h1>
          <p className="subtitle">Does the supplied evidence support this claim under the supplied rules, and what should the reviewer do next?</p>
        </div>
        {config && (
          <span className={`mode mode-${config.mode.kind}`} title={config.mode.note}>
            {config.mode.kind === "live"
              ? `Live · ${config.mode.model}`
              : config.mode.kind === "replay"
                ? "Replay mode · recorded outputs"
                : "Scripted demo · no model"}
          </span>
        )}
      </header>

      {configError && (
        <div className="card error-card page-error" role="alert">
          <h3>{configError.title}</h3>
          <p>{configError.message}</p>
        </div>
      )}

      <main className="layout">
        <InputPanel
          form={form}
          onChange={(next) => {
            setForm(next);
            setEdited(true);
          }}
          scenarios={config?.scenarios ?? []}
          scenarioId={scenarioId}
          edited={edited}
          onLoadScenario={loadScenario}
          defaultRulesText={config?.defaultRulesText ?? ""}
          onAssess={runAssessment}
          loading={status === "loading"}
          newEvidenceKey={newEvidenceKey}
        />
        <ResultPanel
          status={status}
          result={current?.result ?? null}
          error={error}
          diff={diff}
          inputsChanged={inputsChanged}
          modeNote={config && config.mode.kind !== "live" ? config.mode.note : null}
        />
      </main>
    </div>
  );
}
