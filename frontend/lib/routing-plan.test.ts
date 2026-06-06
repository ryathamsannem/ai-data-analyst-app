import { describe, expect, it } from "vitest";
import {
  followUpLensFromRouting,
  parseRoutingPlan,
} from "@/lib/routing-plan";

describe("routing-plan", () => {
  it("parses routing plan payload", () => {
    const plan = parseRoutingPlan({
      intent: "executive",
      executiveLens: "risk",
      metricColumn: "revenue",
      chartType: "bar",
      confidence: 0.72,
    });
    expect(plan?.intent).toBe("executive");
    expect(plan?.executiveLens).toBe("risk");
    expect(plan?.metricColumn).toBe("revenue");
  });

  it("prefers routing plan lens for follow-ups", () => {
    expect(
      followUpLensFromRouting(
        { intent: "profitability", executiveLens: null },
        "opportunity"
      )
    ).toBe("loss");
    expect(
      followUpLensFromRouting(
        { intent: "executive", executiveLens: "strategy" },
        "risk"
      )
    ).toBe("strategy");
  });
});
