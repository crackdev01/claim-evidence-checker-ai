import { containsNormalized, normalizeText } from "../shared/quotes";
import type { EvidenceItem, IdentityCheck, ProductContext } from "../shared/schema";

/**
 * Builds a pattern for identifiers shaped like the product's formulation ID,
 * so "F-101 rev. 3" yields /\bF-\d+\b/ and the check can report "F-098" as another formulation.
 */
function identifierPattern(formulationId: string): { base: string; pattern: RegExp } | null {
  const match = /^([A-Za-z]+)([-_ ]?)(\d+)/.exec(formulationId.trim());
  if (!match) return null;
  const [, prefix, separator] = match;
  const escapedSeparator = separator ? `[-_ ]` : "";
  return { base: match[0], pattern: new RegExp(`\\b${prefix}${escapedSeparator}\\d+\\b`, "gi") };
}

export function checkIdentity(product: ProductContext, evidence: EvidenceItem[]): IdentityCheck[] {
  const formulation = product.formulationId.trim();
  const sku = product.sku.trim();
  const shape = formulation ? identifierPattern(formulation) : null;

  return evidence.map((item) => {
    const haystack = `${item.title}\n${item.text}`;
    const formulationFound = formulation ? containsNormalized(haystack, formulation) : null;
    const skuFound = sku ? containsNormalized(haystack, sku) : null;

    const otherIdentifiers = shape
      ? [...new Set((haystack.match(shape.pattern) ?? []).map((id) => id.toUpperCase()))].filter(
          (id) => normalizeText(id).replace(/[-_ ]/g, "") !== normalizeText(shape.base).replace(/[-_ ]/g, ""),
        )
      : [];

    let confirmed: boolean;
    let note: string;
    if (formulation) {
      confirmed = formulationFound === true;
      if (confirmed) note = `Names formulation ${formulation}.`;
      else if (otherIdentifiers.length > 0)
        note = `Names ${otherIdentifiers.join(", ")}, not the product's formulation ${formulation}.`;
      else if (shape && containsNormalized(haystack, shape.base))
        note = `Names ${shape.base} but not the full formulation ID "${formulation}". Check the revision.`;
      else note = `Does not name formulation ${formulation}.`;
    } else if (sku) {
      confirmed = skuFound === true;
      note = confirmed ? `Names SKU ${sku} (no formulation ID supplied).` : `Does not name SKU ${sku}, and no formulation ID was supplied.`;
    } else {
      confirmed = false;
      note = "No SKU or formulation ID supplied, so product identity cannot be checked.";
    }

    return { evidenceId: item.id, formulationFound, skuFound, otherIdentifiers, confirmed, note };
  });
}
