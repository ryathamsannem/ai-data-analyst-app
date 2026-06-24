import { describe, expect, it } from "vitest";
import { aiAnswerLeadIn } from "@/lib/ux-narrative";

describe("aiAnswerLeadIn", () => {
  it("uses Workforce insight for HR attrition ranking, not Trend over time", () => {
    expect(
      aiAnswerLeadIn("hr", "bar_horizontal", {
        routingIntent: "ranking",
        categoryColumn: "department",
        metricColumn: "attrition_flag",
        isTimeSeries: false,
      })
    ).toBe("Workforce insight");
  });

  it("uses Trend over time for true monthly trend charts", () => {
    expect(
      aiAnswerLeadIn("retail", "area", {
        routingIntent: "trend",
        categoryColumn: "order_date",
        metricColumn: "sales_amount",
        isTimeSeries: true,
      })
    ).toBe("Trend over time");
  });

  it("does not label ranking charts as Trend over time when intent is ranking", () => {
    expect(
      aiAnswerLeadIn("generic", "area", {
        routingIntent: "ranking",
        categoryColumn: "region",
        metricColumn: "sales_amount",
        isTimeSeries: false,
      })
    ).toBe("Business comparison");
  });

  it("uses Distribution insight for histograms", () => {
    expect(
      aiAnswerLeadIn("hr", "histogram", {
        routingIntent: "distribution",
        categoryColumn: "salary",
        metricColumn: "salary",
      })
    ).toBe("Distribution insight");
  });

  it("uses Relationship insight for scatter charts", () => {
    expect(
      aiAnswerLeadIn("banking", "scatter", {
        routingIntent: "relationship",
        categoryColumn: "credit_score",
        metricColumn: "loan_balance",
      })
    ).toBe("Relationship insight");
  });

  it("uses Risk insight for banking loan ranking", () => {
    expect(
      aiAnswerLeadIn("banking", "bar_horizontal", {
        routingIntent: "ranking",
        categoryColumn: "customer_segment",
        metricColumn: "loan_balance",
      })
    ).toBe("Risk insight");
  });
});
