import { describe, expect, it } from "vitest";
import { createAdmissionBudget } from "./admission";

describe("process-local live request admission", () => {
  it("admits six bundles and refuses the seventh until the rolling window expires", () => {
    const admit = createAdmissionBudget();
    for (let i = 0; i < 6; i++) expect(admit(1000 + i)).toBe(true);
    expect(admit(1006)).toBe(false);
    expect(admit(60_999)).toBe(false);
    expect(admit(61_000)).toBe(true);
    expect(admit(61_000)).toBe(false);
    expect(admit(61_001)).toBe(true);
  });
});
