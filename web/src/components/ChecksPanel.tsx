import type { ReactNode } from "react";
import type { AssessResponse } from "../../../shared/schema";
import { ASSESSMENT_LABELS } from "../../../shared/vocabulary";

function Row({ ok, title, children }: { ok: boolean | null; title: string; children?: ReactNode }) {
  return (
    <li className="check-row">
      <span className={`check-mark ${ok === null ? "neutral" : ok ? "ok" : "bad"}`}>{ok === null ? "–" : ok ? "✓" : "✗"}</span>
      <div>
        <div className="check-title">{title}</div>
        {children}
      </div>
    </li>
  );
}

export function ChecksPanel({ result }: { result: AssessResponse }) {
  const { checks, meta } = result;
  const verified = checks.citations.filter((c) => c.status === "verified").length;
  const failedCitations = checks.citations.filter((c) => c.status !== "verified");
  const badReferences = checks.references.filter((r) => !r.ok);
  const proposedClearance = result.modelAssessment === "no_issue_found";

  return (
    <section className="card checks">
      <h3>What the code checked</h3>
      <p className="hint">These checks are deterministic. They can block a clearance but can never create one.</p>
      <ul className="check-list">
        <Row ok={checks.output.ok} title={checks.output.ok ? "Model output parsed and matched the schema" : "Model output could not be used"}>
          {checks.output.problem && <p className="check-detail">{checks.output.problem}</p>}
        </Row>
        {checks.output.ok && (
          <Row ok={failedCitations.length === 0} title={`${verified} of ${checks.citations.length} quotes found word for word in the cited source`}>
            {failedCitations.map((c) => (
              <p key={c.path} className="check-detail">
                {c.path} → {c.refId}: {c.status.replace(/_/g, " ")}
                {c.quote ? ` ("${c.quote}")` : ""}
              </p>
            ))}
          </Row>
        )}
        {checks.output.ok && (
          <Row ok={badReferences.length === 0} title={badReferences.length === 0 ? "Every referenced rule, evidence and element ID exists" : "Unknown IDs referenced"}>
            {badReferences.map((r) => (
              <p key={`${r.path}-${r.refId}`} className="check-detail">
                {r.path}: {r.refId}
              </p>
            ))}
          </Row>
        )}
        <Row ok={checks.identity.length === 0 ? null : checks.identity.every((i) => i.confirmed)} title="Product identity in each evidence item">
          {checks.identity.length === 0 && <p className="check-detail">No evidence supplied.</p>}
          {checks.identity.map((i) => (
            <p key={i.evidenceId} className="check-detail">
              {i.confirmed ? "✓" : "✗"} {i.evidenceId}: {i.note}
            </p>
          ))}
        </Row>
        <Row
          ok={proposedClearance ? !result.downgraded : !checks.output.ok ? false : null}
          title={
            !checks.output.ok
              ? "Clearance not possible: the output was unusable"
              : proposedClearance
                ? result.downgraded
                  ? "Clearance proposed by the model and blocked"
                  : "Clearance proposed by the model and allowed"
                : `No clearance proposed (model: ${ASSESSMENT_LABELS[result.modelAssessment ?? "needs_evidence_or_review"]})`
          }
        >
          {result.downgradeReasons.map((reason) => (
            <p key={reason} className="check-detail">
              {reason}
            </p>
          ))}
          {result.warnings.map((warning) => (
            <p key={warning} className="check-detail warning-text">
              Warning: {warning}
            </p>
          ))}
        </Row>
      </ul>
      <dl className="meta">
        <dt>Model</dt>
        <dd>{meta.model}</dd>
        <dt>Prompt</dt>
        <dd>{meta.promptVersion}</dd>
        <dt>Rule pack</dt>
        <dd>
          {meta.rulePack.name ?? "custom"} · {meta.rulePack.passages} passages · #{meta.rulePack.hash}
        </dd>
        <dt>Time</dt>
        <dd>
          {(meta.latencyMs / 1000).toFixed(1)} s · {new Date(meta.assessedAt).toLocaleTimeString()}
        </dd>
      </dl>
    </section>
  );
}
