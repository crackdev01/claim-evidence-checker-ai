import { useMemo } from "react";
import { parseRulePack } from "../../../shared/rules";
import type { ProductContext, Scenario } from "../../../shared/schema";
import type { EvidenceDraft, FormState } from "../diff";

type Props = {
  form: FormState;
  onChange: (form: FormState) => void;
  scenarios: Scenario[];
  scenarioId: string;
  edited: boolean;
  onLoadScenario: (id: string) => void;
  defaultRulesText: string;
  onAssess: () => void;
  loading: boolean;
  newEvidenceKey: () => number;
};

const PRODUCT_FIELDS: { key: keyof ProductContext; label: string; placeholder: string }[] = [
  { key: "sku", label: "SKU", placeholder: "NV-HYD-050" },
  { key: "formulationId", label: "Formulation ID", placeholder: "F-101 rev. 3" },
  { key: "name", label: "Product name", placeholder: "NordVita Hydra Serum 50 ml" },
  { key: "market", label: "Market", placeholder: "DK" },
  { key: "category", label: "Category", placeholder: "Cosmetics > Skin care > Leave-on face serum" },
];

export function InputPanel(props: Props) {
  const { form, onChange, scenarios, scenarioId, edited, onLoadScenario, defaultRulesText, onAssess, loading, newEvidenceKey } = props;
  const pack = useMemo(() => parseRulePack(form.rulesText), [form.rulesText]);
  const groups = useMemo(() => {
    const byGroup = new Map<string, Scenario[]>();
    for (const scenario of scenarios) byGroup.set(scenario.group, [...(byGroup.get(scenario.group) ?? []), scenario]);
    return [...byGroup.entries()];
  }, [scenarios]);

  const setProduct = (key: keyof ProductContext, value: string) => onChange({ ...form, product: { ...form.product, [key]: value } });
  const setEvidence = (evidence: EvidenceDraft[]) => onChange({ ...form, evidence });
  const updateEvidence = (key: number, patch: Partial<EvidenceDraft>) =>
    setEvidence(form.evidence.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const canAssess = !loading && form.claim.trim().length > 0 && pack.errors.length === 0 && form.evidence.every((e) => e.text.trim());

  return (
    <form
      className="input-panel"
      onSubmit={(event) => {
        event.preventDefault();
        if (canAssess) onAssess();
      }}
    >
      <section className="card">
        <label className="field">
          <span className="field-label">
            Load scenario {edited && scenarioId && <span className="tag">edited</span>}
          </span>
          <select value={scenarioId} onChange={(event) => onLoadScenario(event.target.value)}>
            <option value="" disabled>
              Choose a preset...
            </option>
            {groups.map(([group, items]) => (
              <optgroup key={group} label={group === "demo" ? "Demo: same claim, different evidence" : "More cases from the evaluation"}>
                {items.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </section>

      <section className="card">
        <h2>Marketing claim</h2>
        <textarea
          className="claim"
          rows={3}
          value={form.claim}
          placeholder="Clinically proven 24-hour hydration."
          onChange={(event) => onChange({ ...form, claim: event.target.value })}
        />
      </section>

      <section className="card">
        <h2>Product context</h2>
        <div className="product-grid">
          {PRODUCT_FIELDS.map((field) => (
            <label key={field.key} className={`field ${field.key === "category" || field.key === "name" ? "wide" : ""}`}>
              <span className="field-label">{field.label}</span>
              <input value={form.product[field.key]} placeholder={field.placeholder} onChange={(event) => setProduct(field.key, event.target.value)} />
            </label>
          ))}
        </div>
        <p className="hint">The formulation ID is used for a deterministic check that each piece of evidence concerns this exact product.</p>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Supporting evidence</h2>
          <button
            type="button"
            className="secondary small"
            disabled={form.evidence.length >= 8}
            onClick={() => setEvidence([...form.evidence, { key: newEvidenceKey(), title: "", text: "" }])}
          >
            Add evidence
          </button>
        </div>
        {form.evidence.length === 0 && <p className="hint">No evidence. Paste text from a study report, certificate or data sheet.</p>}
        {form.evidence.map((item, index) => (
          <div key={item.key} className="evidence-item">
            <div className="evidence-head">
              <span className="id-chip">E{index + 1}</span>
              <input
                className="evidence-title"
                value={item.title}
                placeholder="Document title"
                onChange={(event) => updateEvidence(item.key, { title: event.target.value })}
              />
              <button type="button" className="link danger" onClick={() => setEvidence(form.evidence.filter((e) => e.key !== item.key))}>
                Remove
              </button>
            </div>
            <textarea
              rows={7}
              value={item.text}
              placeholder="Paste the evidence text here."
              onChange={(event) => updateEvidence(item.key, { text: event.target.value })}
            />
          </div>
        ))}
      </section>

      <section className="card">
        <details className="rules-details">
          <summary>
            <h2>Supplied legal text</h2>
            <span className="hint">
              {pack.passages.length} passages{pack.name ? ` · ${pack.name}` : ""}
              {form.rulesText !== defaultRulesText ? " · edited" : ""}
            </span>
          </summary>
          <p className="hint">
            Each passage starts with <code>[RULE-ID] Title | Source | Applicability</code>. Text without headers is split into paragraphs R1, R2, ...
          </p>
          <textarea className="mono" rows={16} value={form.rulesText} onChange={(event) => onChange({ ...form, rulesText: event.target.value })} />
          {pack.errors.map((error) => (
            <p key={error} className="error-text">
              {error}
            </p>
          ))}
          {pack.notes.map((note) => (
            <p key={note} className="hint">
              {note}
            </p>
          ))}
          <button type="button" className="secondary small" disabled={form.rulesText === defaultRulesText} onClick={() => onChange({ ...form, rulesText: defaultRulesText })}>
            Reset to default rule pack
          </button>
        </details>
      </section>

      <div className="assess-bar">
        <button type="submit" className="primary" disabled={!canAssess}>
          {loading ? "Assessing..." : "Assess claim"}
        </button>
        <span className="hint">One model call, then deterministic checks on its output.</span>
      </div>
    </form>
  );
}
