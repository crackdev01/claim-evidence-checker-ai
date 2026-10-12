import { useEffect, useState } from "react";
import type { AssessResponse } from "../../../shared/schema";
import { ASSESSMENT_DEFINITIONS, ASSESSMENT_LABELS, ELEMENT_TYPE_LABELS, NEXT_ACTION_LABELS } from "../../../shared/vocabulary";
import type { RunDiff as RunDiffData } from "../diff";
import { AssessmentPill } from "./bits";
import { ChecksPanel } from "./ChecksPanel";
import { RelevanceMatrix } from "./RelevanceMatrix";
import { RuleExcerpts } from "./RuleExcerpts";
import { RunDiff } from "./RunDiff";

type Props = {
  status: "idle" | "loading" | "done" | "error";
  result: AssessResponse | null;
  error: { title: string; message: string } | null;
  diff: RunDiffData | null;
  inputsChanged: boolean;
  modeNote: string | null;
};

export function ResultPanel({ status, result, error, diff, inputsChanged, modeNote }: Props) {
  const stale = status === "loading" || status === "error" || inputsChanged;
  return (
    <div className="result-panel">
      {status === "loading" && <Loading />}
      {status === "error" && error && (
        <section className="card error-card" role="alert">
          <h3>{error.title}</h3>
          <p>{error.message}</p>
          {modeNote && <p className="hint">{modeNote}</p>}
        </section>
      )}
      {!result && status !== "loading" && status !== "error" && <EmptyState />}
      {result && stale && status !== "loading" && (
        <p className="stale-note">
          {status === "error" ? "Below is the last successful result, for earlier inputs." : "The inputs have changed since this result. Assess again to update it."}
        </p>
      )}
      {result && (
        <div className={stale ? "stale" : undefined}>
          {diff && <RunDiff diff={diff} />}
          <Verdict result={result} />
          <RelevanceMatrix result={result} />
          <MissingEvidence result={result} />
          <RuleExcerpts result={result} />
          <Findings result={result} />
          <ChecksPanel result={result} />
        </div>
      )}
    </div>
  );
}

function Verdict({ result }: { result: AssessResponse }) {
  const { finalAssessment, modelAssessment, downgraded, output, nextAction } = result;
  const [copied, setCopied] = useState(false);
  return (
    <section className={`card verdict verdict-${finalAssessment}`}>
      <div className="verdict-head">
        <span className="verdict-label">{ASSESSMENT_LABELS[finalAssessment]}</span>
        {!output && <span className="tag bad">Manual review required</span>}
      </div>
      <p className="verdict-definition">{ASSESSMENT_DEFINITIONS[finalAssessment]}</p>
      {downgraded && modelAssessment && (
        <div className="downgrade">
          <p>
            The model proposed <AssessmentPill assessment={modelAssessment} />, but the automatic checks blocked it:
          </p>
          <ul>
            {result.downgradeReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {!output && (
        <div className="downgrade">
          <p>{result.downgradeReasons[0]}</p>
        </div>
      )}
      <div className="next-action">
        <div className="field-label">Next action: {NEXT_ACTION_LABELS[nextAction.type]}</div>
        <p>{nextAction.detail}</p>
        {nextAction.suggestedRewrite && (
          <div className="rewrite">
            <span className="field-label">Suggested rewrite</span>
            <p className="rewrite-text">{nextAction.suggestedRewrite}</p>
            <button
              type="button"
              className="link"
              onClick={() => {
                void navigator.clipboard?.writeText(nextAction.suggestedRewrite ?? "");
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
      {output && <p className="explanation">{output.explanation}</p>}
    </section>
  );
}

function MissingEvidence({ result }: { result: AssessResponse }) {
  const output = result.output;
  if (!output || output.missingEvidence.length === 0) return null;
  const elements = new Map(output.claimElements.map((element) => [element.id, element]));
  return (
    <section className="card">
      <h3>Missing evidence</h3>
      <ul className="plain">
        {output.missingEvidence.map((gap, index) => {
          const element = gap.elementId ? elements.get(gap.elementId) : undefined;
          return (
            <li key={index}>
              {element && (
                <span className="tag">
                  {ELEMENT_TYPE_LABELS[element.type]}: {element.text}
                </span>
              )}{" "}
              {gap.description}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Findings({ result }: { result: AssessResponse }) {
  const output = result.output;
  if (!output || output.findings.length === 0) return null;
  return (
    <section className="card">
      <h3>Findings</h3>
      <ul className="plain findings">
        {output.findings.map((finding, index) => (
          <li key={index}>
            <span className={`tag severity-${finding.severity}`}>{finding.severity}</span> {finding.summary}
            <div className="refs">
              {[...finding.ruleIds, ...finding.evidenceIds, ...finding.elementIds].map((id) => (
                <span key={id} className="id-chip small">
                  {id}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Loading() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <section className="card loading" aria-live="polite">
      <div className="spinner" />
      <div>
        <strong>Assessing... {seconds} s</strong>
        <p className="hint">One model call reads the claim, the supplied rules and the evidence; then the code verifies every citation.</p>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="card empty">
      <h3>Does the supplied evidence support this claim under the supplied rules?</h3>
      <p>
        Paste a marketing claim, the product context, the legal text you want to check against, and the evidence you have. The result shows which parts of
        the claim the evidence actually covers, the exact rule passages that apply, what is missing, and what to do next.
      </p>
      <p className="hint">Try the demo: load "Demo A", assess, then switch to Demo B and Demo C and assess again.</p>
    </section>
  );
}
