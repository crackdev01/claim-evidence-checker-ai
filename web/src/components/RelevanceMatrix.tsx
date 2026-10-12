import type { AssessResponse, CitationStatus, ClaimElement, EvidenceRelevance } from "../../../shared/schema";
import { ELEMENT_TYPE_LABELS, VERDICTS } from "../../../shared/vocabulary";
import { CitationBadge, IdentityBadge, VerdictChip } from "./bits";

type Entry = { entry: EvidenceRelevance; index: number };

export function RelevanceMatrix({ result }: { result: AssessResponse }) {
  const output = result.output;
  if (!output) return null;

  const citationStatus = new Map(result.checks.citations.map((c) => [c.path, c.status]));
  const identity = new Map(result.checks.identity.map((check) => [check.evidenceId, check]));
  const cells = new Map<string, Entry[]>();
  output.evidenceRelevance.forEach((entry, index) => {
    const key = `${entry.elementId}|${entry.evidenceId}`;
    cells.set(key, [...(cells.get(key) ?? []), { entry, index }]);
  });
  const gaps = (element: ClaimElement) => output.missingEvidence.filter((gap) => gap.elementId === element.id);

  return (
    <section className="card">
      <h3>Evidence relevance</h3>
      <p className="hint">
        Each row is something the claim asserts; each column is a piece of evidence. A report can mention the right ingredient or outcome and still test a
        different product, formulation, duration or method.
      </p>
      <div className="matrix-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th className="element-col">Claim element</th>
              {result.evidence.map((item) => (
                <th key={item.id}>
                  <div className="evidence-col-head">
                    <span className="id-chip">{item.id}</span>
                    <span className="evidence-col-title">{item.title}</span>
                  </div>
                  <IdentityBadge check={identity.get(item.id)} />
                </th>
              ))}
              {result.evidence.length === 0 && <th>No evidence supplied</th>}
            </tr>
          </thead>
          <tbody>
            {output.claimElements.map((element) => (
              <tr key={element.id}>
                <th scope="row" className="element-col">
                  <div className="element-type">
                    {element.id} · {ELEMENT_TYPE_LABELS[element.type]}
                  </div>
                  <div className="element-text">{element.text}</div>
                  <div className="element-req">
                    {element.requiresSubstantiation ? element.requirement : "No substantiation needed (hyperbole or subjective)."}
                  </div>
                </th>
                {result.evidence.map((item) => (
                  <Cell key={item.id} element={element} entries={cells.get(`${element.id}|${item.id}`) ?? []} citationStatus={citationStatus} />
                ))}
                {result.evidence.length === 0 && (
                  <td className="cell">
                    {element.requiresSubstantiation ? (
                      <>
                        <span className="chip verdict-missing">Missing</span>
                        {gaps(element).map((gap) => (
                          <p key={gap.description} className="shows">
                            {gap.description}
                          </p>
                        ))}
                      </>
                    ) : (
                      <span className="muted">Not required</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend">
        {VERDICTS.map((verdict) => (
          <VerdictChip key={verdict} verdict={verdict} />
        ))}
        <span className="hint">Hover a label for its definition.</span>
      </div>
    </section>
  );
}

function Cell({ element, entries, citationStatus }: { element: ClaimElement; entries: Entry[]; citationStatus: Map<string, CitationStatus> }) {
  if (!element.requiresSubstantiation) return <td className="cell muted">Not required</td>;
  if (entries.length === 0) return <td className="cell muted">Not assessed by the model</td>;
  return (
    <td className="cell">
      {entries.map(({ entry, index }) => (
        <div key={index} className="cell-entry">
          <VerdictChip verdict={entry.verdict} />
          <p className="shows">{entry.evidenceShows}</p>
          {entry.quote && (
            <details className="quote" open={entry.verdict !== "supports"}>
              <summary>
                Quote <CitationBadge status={citationStatus.get(`evidenceRelevance[${index}]`)} />
              </summary>
              <blockquote>{entry.quote}</blockquote>
            </details>
          )}
        </div>
      ))}
    </td>
  );
}
