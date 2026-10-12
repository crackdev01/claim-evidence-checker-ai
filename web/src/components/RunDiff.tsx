import type { RunDiff as RunDiffData } from "../diff";
import { AssessmentPill } from "./bits";

export function RunDiff({ diff }: { diff: RunDiffData }) {
  const changed = diff.from !== diff.to;
  return (
    <section className="card run-diff">
      <h3>What changed since the last run</h3>
      {diff.inputChanges.length === 0 ? (
        <p className="hint">Same inputs as the last run{changed ? "." : ", and the same assessment."}</p>
      ) : (
        <ul className="plain">
          {diff.inputChanges.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      )}
      <p className="diff-assessment">
        <AssessmentPill assessment={diff.from} />
        <span className="arrow">→</span>
        <AssessmentPill assessment={diff.to} />
        {!changed && <span className="hint">unchanged</span>}
      </p>
      {diff.elementChanges.length > 0 && (
        <>
          <p className="field-label">Because</p>
          <ul className="plain">
            {diff.elementChanges.map((change) => (
              <li key={change.label}>
                <strong>{change.label}</strong>: {change.from} → {change.to}
                {change.reason && <div className="hint">{change.reason}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
