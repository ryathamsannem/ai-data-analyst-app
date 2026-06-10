#!/usr/bin/env python3
"""Generate realistic synthetic domain CSV fixtures for AI Insights QA."""

from __future__ import annotations

import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 20260609
OUT_DIR = Path(__file__).resolve().parent

random.seed(SEED)


def month_starts(start: date, months: int) -> list[date]:
    out: list[date] = []
    y, m = start.year, start.month
    for _ in range(months):
        out.append(date(y, m, 1))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def maybe_missing(value, rate: float = 0.03):
    if random.random() < rate:
        return ""
    return value


def add_outlier_multiplier(base: float, outlier_rate: float = 0.02, low=0.35, high=2.8) -> float:
    if random.random() < outlier_rate:
        return base * random.uniform(low, high)
    return base * random.uniform(0.82, 1.18)


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def generate_retail(n_target: int = 360) -> tuple[list[str], list[dict]]:
    regions = ["North", "South", "East", "West"]
    cities = {
        "North": ["Delhi", "Chandigarh", "Jaipur"],
        "South": ["Bengaluru", "Chennai", "Hyderabad"],
        "East": ["Kolkata", "Patna", "Bhubaneswar"],
        "West": ["Mumbai", "Pune", "Ahmedabad"],
    }
    categories = {
        "Electronics": ["Laptop", "Phone", "Tablet", "Monitor"],
        "Furniture": ["Chair", "Desk", "Sofa"],
        "Clothing": ["Jacket", "Tshirt", "Jeans"],
        "Home": ["Blender", "Vacuum", "Lamp"],
    }
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    base_idx = 0
    for mi, d in enumerate(months):
        season = 1.0 + 0.12 * math.sin(2 * math.pi * mi / 12)
        for region in regions:
            for city in cities[region]:
                for cat, products in categories.items():
                    for product in products:
                        if len(rows) >= n_target:
                            break
                        base_idx += 1
                        cat_boost = {"Electronics": 1.35, "Furniture": 0.95, "Clothing": 1.05, "Home": 0.88}[cat]
                        city_boost = {"Mumbai": 1.4, "Delhi": 1.25, "Bengaluru": 1.2}.get(city, 1.0)
                        revenue = add_outlier_multiplier(
                            random.uniform(45000, 180000) * season * cat_boost * city_boost
                        )
                        margin = random.uniform(0.14, 0.32)
                        profit = revenue * margin
                        customers = int(add_outlier_multiplier(random.uniform(120, 520), 0.015, 0.5, 2.2))
                        orders = max(20, int(customers * random.uniform(0.35, 0.75)))
                        quantity = max(orders, int(orders * random.uniform(1.0, 1.6)))
                        growth = round(random.uniform(-0.05, 0.38) * season, 4)
                        rows.append(
                            {
                                "order_date": d.isoformat(),
                                "region": region,
                                "city": city,
                                "product_category": cat,
                                "product": product,
                                "revenue": round(revenue, 2),
                                "profit": round(profit, 2),
                                "customers": maybe_missing(customers, 0.025),
                                "orders": orders,
                                "quantity": quantity,
                                "growth_rate": maybe_missing(growth, 0.02),
                            }
                        )
                    if len(rows) >= n_target:
                        break
                if len(rows) >= n_target:
                    break
            if len(rows) >= n_target:
                break
        if len(rows) >= n_target:
            break
    fields = [
        "order_date",
        "region",
        "city",
        "product_category",
        "product",
        "revenue",
        "profit",
        "customers",
        "orders",
        "quantity",
        "growth_rate",
    ]
    return fields, rows[:n_target]


def generate_marketing(n_target: int = 320) -> tuple[list[str], list[dict]]:
    channels = ["Paid Search", "Paid Social", "Email", "Display", "Affiliate", "Organic"]
    campaigns = [
        "Spring Launch",
        "Brand Awareness Q1",
        "Retargeting Cart",
        "Holiday Promo",
        "Product Demo Webinar",
        "Referral Boost",
        "Mobile App Install",
        "Enterprise ABM",
    ]
    regions = ["North", "South", "East", "West", "Central"]
    months = month_starts(date(2024, 1, 1), 10)
    rows: list[dict] = []
    for d in months:
        for campaign in campaigns:
            for channel in channels:
                if len(rows) >= n_target:
                    break
                region = random.choice(regions)
                spend = add_outlier_multiplier(random.uniform(8000, 65000))
                cpm = random.uniform(4.5, 18.0)
                impressions = int(spend / cpm * 1000 * random.uniform(0.85, 1.15))
                ctr = random.uniform(0.008, 0.065)
                clicks = max(1, int(impressions * ctr))
                cvr = random.uniform(0.012, 0.09)
                conversions = max(0, int(clicks * cvr))
                revenue = add_outlier_multiplier(conversions * random.uniform(85, 420))
                cost = spend * random.uniform(1.02, 1.12)
                sat = round(random.uniform(3.2, 4.8) - (0.3 if channel == "Display" else 0), 2)
                rows.append(
                    {
                        "report_date": d.isoformat(),
                        "campaign_name": campaign,
                        "channel": channel,
                        "region": region,
                        "spend": round(spend, 2),
                        "impressions": impressions,
                        "clicks": clicks,
                        "conversions": conversions,
                        "revenue": round(revenue, 2),
                        "cost": round(cost, 2),
                        "satisfaction_score": maybe_missing(sat, 0.04),
                    }
                )
            if len(rows) >= n_target:
                break
        if len(rows) >= n_target:
            break
    fields = [
        "report_date",
        "campaign_name",
        "channel",
        "region",
        "spend",
        "impressions",
        "clicks",
        "conversions",
        "revenue",
        "cost",
        "satisfaction_score",
    ]
    return fields, rows[:n_target]


def generate_sales(n_target: int = 340) -> tuple[list[str], list[dict]]:
    regions = ["North", "South", "East", "West"]
    territories = {
        "North": ["N-T1", "N-T2", "N-T3"],
        "South": ["S-T1", "S-T2", "S-T3"],
        "East": ["E-T1", "E-T2"],
        "West": ["W-T1", "W-T2", "W-T3"],
    }
    reps = [f"Rep-{i:02d}" for i in range(1, 19)]
    product_lines = ["Enterprise Suite", "Mid-Market Core", "SMB Starter", "Add-On Services"]
    departments = ["Inside Sales", "Field Sales", "Channel Sales"]
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    for d in months:
        month_factor = 1.0 + 0.08 * math.sin(2 * math.pi * (d.month - 1) / 12)
        for region in regions:
            for territory in territories[region]:
                for pl in product_lines:
                    if len(rows) >= n_target:
                        break
                    rep = random.choice(reps)
                    dept = random.choice(departments)
                    quota = random.uniform(120000, 420000)
                    attainment = random.uniform(0.55, 1.35) * month_factor
                    revenue = add_outlier_multiplier(quota * attainment)
                    units = max(1, int(revenue / random.uniform(800, 4500)))
                    cost = revenue * random.uniform(0.42, 0.68)
                    rows.append(
                        {
                            "report_date": d.isoformat(),
                            "region": region,
                            "territory": territory,
                            "sales_rep": maybe_missing(rep, 0.02),
                            "product_line": pl,
                            "department": dept,
                            "revenue": round(revenue, 2),
                            "units": maybe_missing(units, 0.025),
                            "cost": round(cost, 2),
                            "quota": round(quota, 2),
                            "attainment_pct": maybe_missing(round(attainment * 100, 2), 0.02),
                        }
                    )
                if len(rows) >= n_target:
                    break
            if len(rows) >= n_target:
                break
        if len(rows) >= n_target:
            break
    fields = [
        "report_date",
        "region",
        "territory",
        "sales_rep",
        "product_line",
        "department",
        "revenue",
        "units",
        "cost",
        "quota",
        "attainment_pct",
    ]
    return fields, rows[:n_target]


def generate_geography(n_target: int = 300) -> tuple[list[str], list[dict]]:
    zones = {
        "North": [
            ("Delhi", "Delhi"),
            ("Chandigarh", "Punjab"),
            ("Lucknow", "Uttar Pradesh"),
            ("Amritsar", "Punjab"),
            ("Dehradun", "Uttarakhand"),
        ],
        "South": [
            ("Bengaluru", "Karnataka"),
            ("Chennai", "Tamil Nadu"),
            ("Hyderabad", "Telangana"),
            ("Kochi", "Kerala"),
            ("Coimbatore", "Tamil Nadu"),
        ],
        "East": [
            ("Kolkata", "West Bengal"),
            ("Patna", "Bihar"),
            ("Guwahati", "Assam"),
            ("Ranchi", "Jharkhand"),
        ],
        "West": [
            ("Mumbai", "Maharashtra"),
            ("Pune", "Maharashtra"),
            ("Ahmedabad", "Gujarat"),
            ("Surat", "Gujarat"),
            ("Jaipur", "Rajasthan"),
        ],
    }
    market_types = ["Flagship", "Standard", "Express"]
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    for d in months:
        for zone, cities in zones.items():
            for city, state in cities:
                for market_type in market_types:
                    if len(rows) >= n_target:
                        break
                    stores = random.randint(1, 22)
                    tier_boost = {"Flagship": 1.35, "Standard": 1.0, "Express": 0.78}[market_type]
                    base = random.uniform(80000, 240000) * tier_boost * (1 + stores / 40)
                    revenue = add_outlier_multiplier(base * (1 + 0.06 * (d.month % 4)))
                    profit = revenue * random.uniform(0.11, 0.24)
                    customers = int(revenue / random.uniform(450, 950))
                    growth = round(random.uniform(0.05, 0.42), 4)
                    rows.append(
                        {
                            "report_date": d.isoformat(),
                            "zone": zone,
                            "state": state,
                            "city": city,
                            "market_type": market_type,
                            "store_count": stores,
                            "revenue": round(revenue, 2),
                            "profit": round(profit, 2),
                            "customers": maybe_missing(customers, 0.03),
                            "growth_rate": maybe_missing(growth, 0.025),
                        }
                    )
                if len(rows) >= n_target:
                    break
            if len(rows) >= n_target:
                break
        if len(rows) >= n_target:
            break
    fields = [
        "report_date",
        "zone",
        "state",
        "city",
        "market_type",
        "store_count",
        "revenue",
        "profit",
        "customers",
        "growth_rate",
    ]
    return fields, rows[:n_target]


def generate_banking(n_target: int = 360) -> tuple[list[str], list[dict]]:
    regions = ["North", "South", "East", "West", "Central"]
    branches = [f"BR-{i:03d}" for i in range(1, 25)]
    segments = ["Retail", "SME", "Corporate", "Premium", "Mass Affluent"]
    products = ["Mortgage", "Personal Loan", "Auto Loan", "Credit Card", "Term Deposit"]
    spend_cats = ["Operations", "Technology", "Marketing", "Compliance", "Facilities"]
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    for d in months:
        for branch in branches:
            for segment in segments:
                if len(rows) >= n_target:
                    break
                region = random.choice(regions)
                product = random.choice(products)
                loan = add_outlier_multiplier(random.uniform(250000, 4200000))
                deposit = add_outlier_multiplier(random.uniform(180000, 3800000))
                interest = loan * random.uniform(0.0045, 0.011)
                npl = loan * random.uniform(0.0, 0.045)
                if random.random() < 0.015:
                    npl = loan * random.uniform(0.08, 0.18)  # outlier NPL
                delinq = round(min(0.25, npl / loan + random.uniform(0.005, 0.02)), 4)
                util = round(random.uniform(0.22, 0.88), 4)
                spend = random.uniform(12000, 95000)
                rows.append(
                    {
                        "report_date": d.isoformat(),
                        "branch": branch,
                        "region": region,
                        "customer_segment": segment,
                        "product_type": product,
                        "loan_balance": round(loan, 2),
                        "deposit_balance": round(deposit, 2),
                        "interest_income": round(interest, 2),
                        "npl_amount": round(npl, 2),
                        "delinquency_rate": maybe_missing(delinq, 0.03),
                        "credit_utilization": maybe_missing(util, 0.025),
                        "spend_category": random.choice(spend_cats),
                        "spend_amount": round(spend, 2),
                    }
                )
            if len(rows) >= n_target:
                break
        if len(rows) >= n_target:
            break
    fields = [
        "report_date",
        "branch",
        "region",
        "customer_segment",
        "product_type",
        "loan_balance",
        "deposit_balance",
        "interest_income",
        "npl_amount",
        "delinquency_rate",
        "credit_utilization",
        "spend_category",
        "spend_amount",
    ]
    return fields, rows[:n_target]


def generate_finance_fpa(n_target: int = 330) -> tuple[list[str], list[dict]]:
    departments = ["Sales", "Marketing", "Operations", "Engineering", "Finance", "HR", "Support"]
    cost_centers = [f"CC-{d[:3].upper()}-{i}" for d in departments for i in range(1, 3)]
    categories = ["Personnel", "Software", "Travel", "Facilities", "Contractors"]
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    for d in months:
        for dept in departments:
            for cat in categories:
                if len(rows) >= n_target:
                    break
                cc = random.choice([c for c in cost_centers if dept[:3].upper() in c])
                budget = random.uniform(35000, 220000)
                variance_pct = random.uniform(-0.18, 0.22)
                if random.random() < 0.02:
                    variance_pct = random.uniform(0.35, 0.65)  # overrun outlier
                actual = budget * (1 + variance_pct)
                revenue = actual * random.uniform(1.05, 2.4) if dept in ("Sales", "Marketing") else actual * random.uniform(0.2, 0.9)
                cost = actual
                units = int(random.uniform(80, 1200))
                rows.append(
                    {
                        "report_date": d.isoformat(),
                        "department": dept,
                        "cost_center": cc,
                        "category": cat,
                        "budget": round(budget, 2),
                        "actual": round(actual, 2),
                        "variance": round(actual - budget, 2),
                        "revenue": round(revenue, 2),
                        "cost": round(cost, 2),
                        "units": maybe_missing(units, 0.03),
                    }
                )
            if len(rows) >= n_target:
                break
        if len(rows) >= n_target:
            break
    fields = [
        "report_date",
        "department",
        "cost_center",
        "category",
        "budget",
        "actual",
        "variance",
        "revenue",
        "cost",
        "units",
    ]
    return fields, rows[:n_target]


def generate_operations(n_target: int = 310) -> tuple[list[str], list[dict]]:
    facilities = ["Plant-A", "Plant-B", "Plant-C", "Warehouse-1", "Warehouse-2"]
    departments = ["Assembly", "Packaging", "Quality", "Logistics", "Maintenance"]
    lines = ["Line-1", "Line-2", "Line-3", "Line-4"]
    shifts = ["Day", "Swing", "Night"]
    months = month_starts(date(2024, 1, 1), 10)
    rows: list[dict] = []
    for d in months:
        for facility in facilities:
            for dept in departments:
                for line in lines:
                    if len(rows) >= n_target:
                        break
                    shift = random.choice(shifts)
                    units = int(add_outlier_multiplier(random.uniform(900, 8500)))
                    downtime = round(random.uniform(0.5, 14.0), 2)
                    if random.random() < 0.02:
                        downtime = random.uniform(18, 36)
                    cost = units * random.uniform(8.5, 22.0) + downtime * 1200
                    defect = round(random.uniform(0.002, 0.045), 4)
                    sla = round(random.uniform(3.1, 4.9) - downtime * 0.04, 2)
                    rows.append(
                        {
                            "report_date": d.isoformat(),
                            "facility": facility,
                            "department": dept,
                            "production_line": line,
                            "shift": shift,
                            "units_produced": units,
                            "downtime_hours": maybe_missing(downtime, 0.03),
                            "cost": round(cost, 2),
                            "defect_rate": maybe_missing(defect, 0.025),
                            "sla_score": maybe_missing(sla, 0.04),
                        }
                    )
                if len(rows) >= n_target:
                    break
            if len(rows) >= n_target:
                break
        if len(rows) >= n_target:
            break
    fields = [
        "report_date",
        "facility",
        "department",
        "production_line",
        "shift",
        "units_produced",
        "downtime_hours",
        "cost",
        "defect_rate",
        "sla_score",
    ]
    return fields, rows[:n_target]


def generate_customer_support(n_target: int = 320) -> tuple[list[str], list[dict]]:
    departments = ["Tier-1", "Tier-2", "Tier-3", "Billing", "Technical"]
    categories = ["Account", "Billing", "Bug", "Feature Request", "Outage", "Onboarding"]
    priorities = ["Low", "Medium", "High", "Critical"]
    channels = ["Email", "Chat", "Phone", "Portal"]
    months = month_starts(date(2024, 1, 1), 10)
    rows: list[dict] = []
    for d in months:
        for dept in departments:
            for cat in categories:
                if len(rows) >= n_target:
                    break
                priority = random.choice(priorities)
                channel = random.choice(channels)
                opened = int(random.uniform(40, 520))
                resolved = max(0, int(opened * random.uniform(0.78, 0.99)))
                res_hours = add_outlier_multiplier(random.uniform(2.5, 28.0), 0.02, 0.4, 3.5)
                sat = round(random.uniform(3.0, 4.9) - (0.4 if priority == "Critical" else 0), 2)
                esc = int(opened * random.uniform(0.02, 0.16))
                rows.append(
                    {
                        "report_date": d.isoformat(),
                        "department": dept,
                        "ticket_category": cat,
                        "priority": priority,
                        "channel": channel,
                        "tickets_opened": opened,
                        "tickets_resolved": maybe_missing(resolved, 0.02),
                        "avg_resolution_hours": round(res_hours, 2),
                        "satisfaction_score": maybe_missing(sat, 0.035),
                        "escalations": esc,
                    }
                )
            if len(rows) >= n_target:
                break
        if len(rows) >= n_target:
            break
    fields = [
        "report_date",
        "department",
        "ticket_category",
        "priority",
        "channel",
        "tickets_opened",
        "tickets_resolved",
        "avg_resolution_hours",
        "satisfaction_score",
        "escalations",
    ]
    return fields, rows[:n_target]


def generate_hr(n_target: int = 300) -> tuple[list[str], list[dict]]:
    departments = ["Engineering", "Sales", "Marketing", "Operations", "Finance", "HR", "Support"]
    locations = ["HQ", "Remote-US", "Remote-EMEA", "NYC", "London", "Bengaluru"]
    job_families = ["Individual Contributor", "Manager", "Director", "VP"]
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    for d in months:
        for dept in departments:
            for loc in locations:
                if len(rows) >= n_target:
                    break
                jf = random.choice(job_families)
                hc = int(add_outlier_multiplier(random.uniform(8, 120)))
                hires = max(0, int(hc * random.uniform(0.01, 0.08)))
                terms = max(0, int(hc * random.uniform(0.005, 0.06)))
                if random.random() < 0.015:
                    terms = int(hc * random.uniform(0.12, 0.2))
                attr = round(terms / max(hc, 1), 4)
                sat = round(random.uniform(3.4, 4.7), 2)
                cpe = random.uniform(65000, 145000) / max(hc, 1) * hc
                rows.append(
                    {
                        "report_date": d.isoformat(),
                        "department": dept,
                        "location": loc,
                        "job_family": jf,
                        "headcount": hc,
                        "hires": maybe_missing(hires, 0.03),
                        "terminations": maybe_missing(terms, 0.03),
                        "attrition_rate": maybe_missing(attr, 0.025),
                        "satisfaction_score": maybe_missing(sat, 0.04),
                        "personnel_cost": round(cpe, 2),
                    }
                )
            if len(rows) >= n_target:
                break
        if len(rows) >= n_target:
            break
    fields = [
        "report_date",
        "department",
        "location",
        "job_family",
        "headcount",
        "hires",
        "terminations",
        "attrition_rate",
        "satisfaction_score",
        "personnel_cost",
    ]
    return fields, rows[:n_target]


def generate_healthcare(n_target: int = 340) -> tuple[list[str], list[dict]]:
    departments = ["Emergency", "Cardiology", "Orthopedics", "Oncology", "Pediatrics", "Radiology"]
    wards = ["Ward-A", "Ward-B", "Ward-C", "ICU", "Outpatient"]
    regions = ["Metro", "Suburban", "Rural"]
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    for d in months:
        for dept in departments:
            for ward in wards:
                if len(rows) >= n_target:
                    break
                region = random.choice(regions)
                volume = int(add_outlier_multiplier(random.uniform(120, 1800)))
                admissions = int(volume * random.uniform(0.55, 0.92))
                readmit = int(admissions * random.uniform(0.04, 0.14))
                if random.random() < 0.02:
                    readmit = int(admissions * random.uniform(0.18, 0.28))
                los = round(random.uniform(2.5, 8.5), 2)
                sat = round(random.uniform(3.2, 4.8), 2)
                cost = volume * random.uniform(420, 1850)
                rows.append(
                    {
                        "report_date": d.isoformat(),
                        "department": dept,
                        "ward": ward,
                        "region": region,
                        "patient_volume": volume,
                        "admissions": maybe_missing(admissions, 0.025),
                        "readmissions": maybe_missing(readmit, 0.03),
                        "length_of_stay_days": maybe_missing(los, 0.02),
                        "satisfaction_score": maybe_missing(sat, 0.035),
                        "cost": round(cost, 2),
                    }
                )
            if len(rows) >= n_target:
                break
        if len(rows) >= n_target:
            break
    fields = [
        "report_date",
        "department",
        "ward",
        "region",
        "patient_volume",
        "admissions",
        "readmissions",
        "length_of_stay_days",
        "satisfaction_score",
        "cost",
    ]
    return fields, rows[:n_target]


GENERATORS = [
    ("retail", "retail.csv", generate_retail),
    ("marketing", "marketing.csv", generate_marketing),
    ("sales", "sales.csv", generate_sales),
    ("geography", "geography.csv", generate_geography),
    ("banking_financial_services", "banking_financial_services.csv", generate_banking),
    ("finance_fpa", "finance_fpa.csv", generate_finance_fpa),
    ("operations", "operations.csv", generate_operations),
    ("customer_support", "customer_support.csv", generate_customer_support),
    ("hr", "hr.csv", generate_hr),
    ("healthcare", "healthcare.csv", generate_healthcare),
]


def main() -> None:
    summary: list[tuple[str, str, int, int]] = []
    for key, filename, fn in GENERATORS:
        fields, rows = fn()
        path = OUT_DIR / filename
        n = write_csv(path, fields, rows)
        missing = sum(1 for r in rows for v in r.values() if v == "")
        summary.append((key, filename, n, missing))
        print(f"{filename}: {n} rows, ~{missing} missing cells")

    manifest = OUT_DIR / "manifest.json"
    import json

    manifest.write_text(
        json.dumps(
            {
                "seed": SEED,
                "datasets": [
                    {"domain": k, "file": f, "rows": n, "missing_cells": m}
                    for k, f, n, m in summary
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote manifest.json")


if __name__ == "__main__":
    main()
