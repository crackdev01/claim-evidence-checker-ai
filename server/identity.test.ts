import { describe, expect, it } from "vitest";
import { checkIdentity } from "./identity";

const product = { sku: "NV-HYD-050", name: "Hydra Serum", category: "Serum", market: "DK", formulationId: "F-101 rev. 3" };

describe("checkIdentity", () => {
  it("confirms evidence that names the full formulation ID", () => {
    const [check] = checkIdentity(product, [{ id: "E1", title: "Study", text: "Test product: formula F-101 rev. 3 (batch 1)" }]);
    expect(check).toMatchObject({ confirmed: true, formulationFound: true, otherIdentifiers: [] });
  });

  it("reports a different formulation by name", () => {
    const [check] = checkIdentity(product, [{ id: "E1", title: "Study", text: "Test product: formula F-098 (batch D-2510)" }]);
    expect(check).toMatchObject({ confirmed: false, otherIdentifiers: ["F-098"] });
    expect(check?.note).toBe("Names F-098, not the product's formulation F-101 rev. 3.");
  });

  it("flags a matching base ID with a different or missing revision", () => {
    const [check] = checkIdentity(product, [{ id: "E1", title: "Study", text: "Test product: formula F-101 rev. 2" }]);
    expect(check?.confirmed).toBe(false);
    expect(check?.note).toMatch(/Check the revision/);
  });

  it("falls back to the SKU when no formulation ID is supplied, and fails closed when neither is", () => {
    const bySku = checkIdentity({ ...product, formulationId: "" }, [{ id: "E1", title: "", text: "SKU NV-HYD-050" }]);
    expect(bySku[0]).toMatchObject({ confirmed: true, formulationFound: null, skuFound: true });
    const none = checkIdentity({ ...product, formulationId: "", sku: "" }, [{ id: "E1", title: "", text: "anything" }]);
    expect(none[0]?.confirmed).toBe(false);
  });
});
