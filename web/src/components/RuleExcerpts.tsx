import { findQuote } from "../../../shared/quotes";
import type { AssessResponse } from "../../../shared/schema";
import { CitationBadge } from "./bits";

function Highlighted({ text, quote }: { text: string; quote: string }) {
  const match = findQuote(text, quote);
  if (!match.found) return <>{text}</>;
  return (
    <>
      {text.slice(0, match.start)}
      <mark>{text.slice(match.start, match.end)}</mark>
      {text.slice(match.end)}
    </>
  );
}

export function RuleExcerpts({ result }: { result: AssessResponse }) {
  const output = result.output;
  if (!output) return null;
  const passages = new Map(result.rules.map((rule) => [rule.id, rule]));
  const status = new Map(result.checks.citations.map((c) => [c.path, c.status]));

  return (
    <section className="card">
      <h3>Applicable supplied rules</h3>
      {output.applicableRules.length === 0 && <p className="hint">The model did not cite any supplied rule.</p>}
      {output.applicableRules.map((rule, index) => {
        const passage = passages.get(rule.ruleId);
        return (
          <article key={`${rule.ruleId}-${index}`} className="rule">
            <header className="rule-head">
              <span className="id-chip rule-id">{rule.ruleId}</span>
              <span className="rule-title">{passage?.title ?? "Not in the supplied legal text"}</span>
              <CitationBadge status={status.get(`applicableRules[${index}]`)} />
            </header>
            {passage && (
              <p className="rule-source">
                {passage.source}
                {passage.applicability ? ` · ${passage.applicability}` : ""}
              </p>
            )}
            <blockquote className="rule-text">{passage ? <Highlighted text={passage.text} quote={rule.quote} /> : rule.quote}</blockquote>
            <p className="rule-application">{rule.application}</p>
          </article>
        );
      })}
    </section>
  );
}
