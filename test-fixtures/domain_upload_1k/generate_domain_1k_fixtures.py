#!/usr/bin/env python3
"""Generate ~1k-row cross-domain upload/mapping validation CSV fixtures."""

from __future__ import annotations

import csv
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 20260627
TARGET_ROWS = 1000
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


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def _jitter(base: float, spread: float = 0.15) -> float:
    return base * random.uniform(1.0 - spread, 1.0 + spread)


def _fill_to_target(rows: list[dict], n: int) -> list[dict]:
    """Pad or trim row list to exactly n rows."""
    if not rows:
        return rows
    out = list(rows[:n])
    i = 0
    while len(out) < n:
        base = dict(rows[i % len(rows)])
        out.append(base)
        i += 1
    return out


def generate_retail(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    regions = ["North", "South", "East", "West"]
    segments = ["Consumer", "SMB", "Enterprise", "Premium"]
    categories = ["Electronics", "Furniture", "Clothing", "Home", "Sports"]
    months = month_starts(date(2024, 1, 1), 14)
    rows: list[dict] = []
    idx = 0
    for d in months:
        season = 1.0 + 0.1 * math.sin(2 * math.pi * d.month / 12)
        for region in regions:
            for seg in segments:
                for cat in categories:
                    if len(rows) >= n:
                        break
                    idx += 1
                    qty = max(1, int(_jitter(12, 0.35)))
                    unit = _jitter(85, 0.4)
                    sales = qty * unit * season * random.uniform(0.8, 1.3)
                    disc = round(random.uniform(0.0, 0.22), 4)
                    profit = sales * random.uniform(0.12, 0.32) * (1 - disc * 0.5)
                    rows.append(
                        {
                            "order_id": f"ORD-{idx:06d}",
                            "order_date": d.isoformat(),
                            "product_category": cat,
                            "region": region,
                            "customer_segment": seg,
                            "sales_amount": round(sales, 2),
                            "profit": round(profit, 2),
                            "quantity": qty,
                            "discount_pct": disc,
                        }
                    )
                if len(rows) >= n:
                    break
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "order_id",
        "order_date",
        "product_category",
        "region",
        "customer_segment",
        "sales_amount",
        "profit",
        "quantity",
        "discount_pct",
    ]
    return fields, _fill_to_target(rows, n)


def generate_banking(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    products = ["Mortgage", "Personal Loan", "Auto Loan", "Credit Card", "Term Deposit"]
    segments = ["Retail", "SME", "Corporate", "Premium", "Mass Affluent"]
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for product in products:
            for seg in segments:
                if len(rows) >= n:
                    break
                idx += 1
                loan = _jitter(random.uniform(180000, 3200000), 0.25)
                deposit = _jitter(random.uniform(120000, 2800000), 0.22)
                spend = _jitter(random.uniform(8000, 72000), 0.2)
                util = round(min(0.98, random.uniform(0.18, 0.92)), 4)
                delinq = round(random.uniform(0.002, 0.08), 4)
                rows.append(
                    {
                        "account_id": f"ACC-{idx:06d}",
                        "report_month": d.isoformat(),
                        "product_type": product,
                        "customer_segment": seg,
                        "loan_balance": round(loan, 2),
                        "deposit_balance": round(deposit, 2),
                        "spend_amount": round(spend, 2),
                        "credit_utilization": util,
                        "delinquency_rate": delinq,
                    }
                )
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "account_id",
        "report_month",
        "product_type",
        "customer_segment",
        "loan_balance",
        "deposit_balance",
        "spend_amount",
        "credit_utilization",
        "delinquency_rate",
    ]
    return fields, _fill_to_target(rows, n)


def generate_hr(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    departments = ["Engineering", "Sales", "Marketing", "Operations", "Finance", "HR", "Support"]
    levels = ["IC1", "IC2", "IC3", "M1", "M2", "Director", "VP"]
    statuses = ["Active", "Active", "Active", "On Leave", "Terminated"]
    start = date(2015, 1, 1)
    rows: list[dict] = []
    for i in range(1, n + 1):
        dept = random.choice(departments)
        level = random.choice(levels)
        status = random.choice(statuses)
        hire = start + timedelta(days=random.randint(0, 3500))
        salary = _jitter(
            {"Engineering": 115000, "Sales": 95000, "Marketing": 88000}.get(dept, 78000),
            0.22,
        )
        bonus = salary * random.uniform(0.03, 0.18)
        perf = round(random.uniform(2.2, 4.8), 1)
        attr = 1 if status == "Terminated" and random.random() < 0.7 else 0
        rows.append(
            {
                "employee_id": f"EMP-{i:05d}",
                "hire_date": hire.isoformat(),
                "department": dept,
                "job_level": level,
                "employee_status": status,
                "salary": round(salary, 2),
                "bonus": round(bonus, 2),
                "performance_rating": perf,
                "attrition_flag": attr,
            }
        )
    fields = [
        "employee_id",
        "hire_date",
        "department",
        "job_level",
        "employee_status",
        "salary",
        "bonus",
        "performance_rating",
        "attrition_flag",
    ]
    return fields, _fill_to_target(rows, n)


def generate_healthcare(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    departments = ["Emergency", "Cardiology", "Orthopedics", "Oncology", "Pediatrics", "Radiology"]
    payers = ["Commercial", "Medicare", "Medicaid", "Self Pay"]
    segments = ["Inpatient", "Outpatient", "Emergency", "Chronic Care"]
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for dept in departments:
            for payer in payers:
                if len(rows) >= n:
                    break
                idx += 1
                seg = random.choice(segments)
                visits = max(5, int(_jitter(180, 0.35)))
                claim = visits * _jitter(420, 0.3)
                readmit = round(random.uniform(0.04, 0.16), 4)
                wait = round(_jitter(28, 0.4), 1)
                rows.append(
                    {
                        "patient_id": f"PAT-{idx:06d}",
                        "visit_date": d.isoformat(),
                        "department": dept,
                        "payer_type": payer,
                        "patient_segment": seg,
                        "visit_count": visits,
                        "claim_amount": round(claim, 2),
                        "readmission_rate": readmit,
                        "wait_time_minutes": wait,
                    }
                )
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "patient_id",
        "visit_date",
        "department",
        "payer_type",
        "patient_segment",
        "visit_count",
        "claim_amount",
        "readmission_rate",
        "wait_time_minutes",
    ]
    return fields, _fill_to_target(rows, n)


def generate_manufacturing(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    plants = ["Plant-A", "Plant-B", "Plant-C", "Plant-D"]
    lines = ["Line-1", "Line-2", "Line-3", "Line-4"]
    shifts = ["Day", "Swing", "Night"]
    months = month_starts(date(2024, 1, 1), 10)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for plant in plants:
            for line in lines:
                for shift in shifts:
                    if len(rows) >= n:
                        break
                    idx += 1
                    units = max(50, int(_jitter(4200, 0.28)))
                    defect = round(random.uniform(0.004, 0.045), 4)
                    downtime = round(_jitter(3.5, 0.5), 1)
                    scrap = units * random.uniform(0.8, 2.4)
                    rows.append(
                        {
                            "batch_id": f"BATCH-{idx:06d}",
                            "production_date": d.isoformat(),
                            "plant": plant,
                            "product_line": line,
                            "shift": shift,
                            "units_produced": units,
                            "defect_rate": defect,
                            "downtime_minutes": downtime,
                            "scrap_cost": round(scrap, 2),
                        }
                    )
                if len(rows) >= n:
                    break
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "batch_id",
        "production_date",
        "plant",
        "product_line",
        "shift",
        "units_produced",
        "defect_rate",
        "downtime_minutes",
        "scrap_cost",
    ]
    return fields, _fill_to_target(rows, n)


def generate_marketing(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    channels = ["Paid Search", "Paid Social", "Email", "Display", "Affiliate"]
    campaigns = ["Spring Launch", "Brand Q1", "Retargeting", "Holiday Promo", "ABM Enterprise"]
    regions = ["North", "South", "East", "West", "Central"]
    months = month_starts(date(2024, 1, 1), 10)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for campaign in campaigns:
            for channel in channels:
                if len(rows) >= n:
                    break
                idx += 1
                region = random.choice(regions)
                spend = _jitter(random.uniform(12000, 85000), 0.25)
                impressions = int(spend / random.uniform(5, 14) * 1000)
                ctr = random.uniform(0.01, 0.06)
                clicks = max(1, int(impressions * ctr))
                cvr = random.uniform(0.015, 0.09)
                conversions = max(0, int(clicks * cvr))
                revenue = conversions * _jitter(120, 0.35)
                conv_rate = round(conversions / max(clicks, 1), 4)
                rows.append(
                    {
                        "campaign_date": d.isoformat(),
                        "channel": channel,
                        "campaign_name": campaign,
                        "region": region,
                        "impressions": impressions,
                        "clicks": clicks,
                        "conversions": conversions,
                        "spend": round(spend, 2),
                        "revenue": round(revenue, 2),
                        "conversion_rate": conv_rate,
                    }
                )
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "campaign_date",
        "channel",
        "campaign_name",
        "region",
        "impressions",
        "clicks",
        "conversions",
        "spend",
        "revenue",
        "conversion_rate",
    ]
    return fields, _fill_to_target(rows, n)


def generate_saas(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    plans = ["Starter", "Professional", "Business", "Enterprise"]
    segments = ["SMB", "Mid-Market", "Enterprise", "Startup"]
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for plan in plans:
            for seg in segments:
                if len(rows) >= n:
                    break
                idx += 1
                mrr = _jitter({"Starter": 12000, "Professional": 45000, "Business": 98000, "Enterprise": 210000}[plan], 0.2)
                users = max(10, int(mrr / random.uniform(8, 22)))
                signups = max(1, int(_jitter(users * 0.08, 0.4)))
                churn = round(random.uniform(0.01, 0.06), 4)
                expansion = mrr * random.uniform(0.02, 0.12)
                rows.append(
                    {
                        "account_id": f"SaaS-{idx:06d}",
                        "month": d.isoformat(),
                        "plan_type": plan,
                        "customer_segment": seg,
                        "mrr": round(mrr, 2),
                        "churn_rate": churn,
                        "active_users": users,
                        "new_signups": signups,
                        "expansion_revenue": round(expansion, 2),
                    }
                )
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "account_id",
        "month",
        "plan_type",
        "customer_segment",
        "mrr",
        "churn_rate",
        "active_users",
        "new_signups",
        "expansion_revenue",
    ]
    return fields, _fill_to_target(rows, n)


def generate_supply_chain(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    origins = ["North Hub", "South Hub", "East Hub", "West Hub"]
    destinations = ["Metro A", "Metro B", "Metro C", "Metro D", "Metro E"]
    carriers = ["FedEx", "UPS", "DHL", "Regional Freight", "OceanLine"]
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for origin in origins:
            for dest in destinations:
                if len(rows) >= n:
                    break
                carrier = random.choice(carriers)
                idx += 1
                count = max(1, int(_jitter(85, 0.35)))
                freight = count * _jitter(42, 0.3)
                days = round(_jitter(4.2, 0.35), 1)
                on_time = round(random.uniform(0.82, 0.99), 4)
                rows.append(
                    {
                        "shipment_id": f"SHP-{idx:06d}",
                        "ship_date": d.isoformat(),
                        "origin_region": origin,
                        "destination_region": dest,
                        "carrier": carrier,
                        "shipment_count": count,
                        "freight_cost": round(freight, 2),
                        "delivery_days": days,
                        "on_time_rate": on_time,
                    }
                )
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "shipment_id",
        "ship_date",
        "origin_region",
        "destination_region",
        "carrier",
        "shipment_count",
        "freight_cost",
        "delivery_days",
        "on_time_rate",
    ]
    return fields, _fill_to_target(rows, n)


def generate_insurance(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    claim_types = ["Auto", "Home", "Life", "Health", "Commercial"]
    policy_types = ["Standard", "Premium", "Basic", "Enterprise", "Family"]
    regions = ["North", "South", "East", "West", "Central"]
    months = month_starts(date(2024, 1, 1), 10)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for claim_type in claim_types:
            for policy in policy_types:
                if len(rows) >= n:
                    break
                idx += 1
                region = random.choice(regions)
                claim_amt = _jitter(random.uniform(2500, 85000), 0.3)
                loss_ratio = round(random.uniform(0.35, 0.92), 4)
                settlement = round(_jitter(18, 0.4), 1)
                fraud = 1 if random.random() < 0.04 else 0
                rows.append(
                    {
                        "claim_id": f"CLM-{idx:06d}",
                        "claim_date": d.isoformat(),
                        "claim_type": claim_type,
                        "policy_type": policy,
                        "region": region,
                        "claim_amount": round(claim_amt, 2),
                        "loss_ratio": loss_ratio,
                        "settlement_days": settlement,
                        "fraud_flag": fraud,
                    }
                )
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "claim_id",
        "claim_date",
        "claim_type",
        "policy_type",
        "region",
        "claim_amount",
        "loss_ratio",
        "settlement_days",
        "fraud_flag",
    ]
    return fields, _fill_to_target(rows, n)


def generate_real_estate(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    property_types = ["Single Family", "Condo", "Townhouse", "Multi-Family", "Commercial"]
    markets = ["Urban Core", "Suburban North", "Suburban South", "Coastal", "Inland"]
    statuses = ["Active", "Pending", "Sold", "Withdrawn"]
    months = month_starts(date(2024, 1, 1), 10)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for prop_type in property_types:
            for market in markets:
                if len(rows) >= n:
                    break
                idx += 1
                status = random.choice(statuses)
                price = _jitter(random.uniform(185000, 1250000), 0.28)
                dom = max(5, int(_jitter(42, 0.45)))
                sqft = max(600, int(_jitter(1850, 0.35)))
                cap = round(random.uniform(0.035, 0.095), 4)
                rows.append(
                    {
                        "property_id": f"PROP-{idx:06d}",
                        "list_date": d.isoformat(),
                        "property_type": prop_type,
                        "market_region": market,
                        "listing_status": status,
                        "sale_price": round(price, 2),
                        "days_on_market": dom,
                        "sqft": sqft,
                        "cap_rate": cap,
                    }
                )
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "property_id",
        "list_date",
        "property_type",
        "market_region",
        "listing_status",
        "sale_price",
        "days_on_market",
        "sqft",
        "cap_rate",
    ]
    return fields, _fill_to_target(rows, n)


def generate_telecom(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    plans = ["Basic", "Plus", "Unlimited", "Family", "Business"]
    regions = ["Metro A", "Metro B", "Metro C", "Rural North", "Rural South"]
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for plan in plans:
            for region in regions:
                if len(rows) >= n:
                    break
                idx += 1
                usage = round(_jitter(random.uniform(8, 95), 0.3), 1)
                revenue = _jitter(random.uniform(45, 220), 0.22)
                churn = round(random.uniform(0.01, 0.08), 4)
                calls = max(0, int(_jitter(random.uniform(0.5, 4.2), 0.5)))
                rows.append(
                    {
                        "subscriber_id": f"SUB-{idx:06d}",
                        "billing_month": d.isoformat(),
                        "plan_tier": plan,
                        "market_region": region,
                        "data_usage_gb": usage,
                        "monthly_revenue": round(revenue, 2),
                        "churn_rate": churn,
                        "support_calls": calls,
                    }
                )
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "subscriber_id",
        "billing_month",
        "plan_tier",
        "market_region",
        "data_usage_gb",
        "monthly_revenue",
        "churn_rate",
        "support_calls",
    ]
    return fields, _fill_to_target(rows, n)


def generate_hospitality(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    brands = ["Grand Plaza", "Harbor Inn", "Summit Lodge", "City Suites", "Coastal Resort"]
    room_types = ["Standard", "Deluxe", "Suite", "Executive", "Family"]
    markets = ["Downtown", "Airport", "Beach", "Business District", "Suburban"]
    months = month_starts(date(2024, 1, 1), 10)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for brand in brands:
            for room in room_types:
                if len(rows) >= n:
                    break
                idx += 1
                market = random.choice(markets)
                revenue = _jitter(random.uniform(12000, 98000), 0.25)
                occupancy = round(random.uniform(0.52, 0.94), 4)
                adr = round(_jitter(145, 0.3), 2)
                rating = round(random.uniform(3.2, 4.9), 1)
                rows.append(
                    {
                        "booking_id": f"BKG-{idx:06d}",
                        "check_in_date": d.isoformat(),
                        "hotel_brand": brand,
                        "room_type": room,
                        "market": market,
                        "room_revenue": round(revenue, 2),
                        "occupancy_rate": occupancy,
                        "avg_daily_rate": adr,
                        "guest_rating": rating,
                    }
                )
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "booking_id",
        "check_in_date",
        "hotel_brand",
        "room_type",
        "market",
        "room_revenue",
        "occupancy_rate",
        "avg_daily_rate",
        "guest_rating",
    ]
    return fields, _fill_to_target(rows, n)


def generate_energy(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    facility_types = ["Office", "Warehouse", "Factory", "Campus", "Retail"]
    grid_regions = ["North Grid", "South Grid", "East Grid", "West Grid"]
    months = month_starts(date(2024, 1, 1), 12)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for facility in facility_types:
            for grid in grid_regions:
                if len(rows) >= n:
                    break
                idx += 1
                kwh = _jitter(random.uniform(12000, 185000), 0.28)
                peak = round(_jitter(kwh / random.uniform(180, 320), 0.25), 1)
                cost = kwh * random.uniform(0.08, 0.14)
                efficiency = round(random.uniform(0.62, 0.96), 4)
                rows.append(
                    {
                        "meter_id": f"MTR-{idx:06d}",
                        "reading_date": d.isoformat(),
                        "facility_type": facility,
                        "grid_region": grid,
                        "energy_kwh": round(kwh, 2),
                        "peak_demand_kw": peak,
                        "utility_cost": round(cost, 2),
                        "efficiency_score": efficiency,
                    }
                )
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "meter_id",
        "reading_date",
        "facility_type",
        "grid_region",
        "energy_kwh",
        "peak_demand_kw",
        "utility_cost",
        "efficiency_score",
    ]
    return fields, _fill_to_target(rows, n)


def generate_support_tickets(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    categories = ["Billing", "Technical", "Account", "Shipping", "Product"]
    priorities = ["Low", "Medium", "High", "Critical"]
    regions = ["North", "South", "East", "West", "EMEA"]
    months = month_starts(date(2024, 1, 1), 10)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for category in categories:
            for priority in priorities:
                if len(rows) >= n:
                    break
                idx += 1
                region = random.choice(regions)
                resolution = round(_jitter(random.uniform(2, 48), 0.35), 1)
                tickets_opened = max(1, int(_jitter(random.uniform(18, 120), 0.35)))
                tickets_resolved = max(0, int(tickets_opened * random.uniform(0.72, 0.98)))
                escalations = max(0, int(random.uniform(0, 6)))
                csat = round(random.uniform(2.8, 4.9), 1)
                sla_breach = round(random.uniform(0.01, 0.12), 4)
                rows.append(
                    {
                        "ticket_id": f"TKT-{idx:06d}",
                        "opened_date": d.isoformat(),
                        "ticket_category": category,
                        "priority": priority,
                        "region": region,
                        "tickets_opened": tickets_opened,
                        "tickets_resolved": tickets_resolved,
                        "resolution_hours": resolution,
                        "escalations": escalations,
                        "csat_score": csat,
                        "sla_breach_rate": sla_breach,
                    }
                )
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "ticket_id",
        "opened_date",
        "ticket_category",
        "priority",
        "region",
        "tickets_opened",
        "tickets_resolved",
        "resolution_hours",
        "escalations",
        "csat_score",
        "sla_breach_rate",
    ]
    return fields, _fill_to_target(rows, n)


def generate_education(n: int = TARGET_ROWS) -> tuple[list[str], list[dict]]:
    grades = ["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"]
    subjects = ["Math", "Science", "English", "History", "Arts"]
    regions = ["Urban North", "Urban South", "Suburban East", "Rural West"]
    months = month_starts(date(2024, 1, 1), 10)
    rows: list[dict] = []
    idx = 0
    for d in months:
        for grade in grades:
            for subject in subjects:
                if len(rows) >= n:
                    break
                idx += 1
                region = random.choice(regions)
                enrollment = max(20, int(_jitter(180, 0.25)))
                attendance = round(random.uniform(0.82, 0.98), 4)
                score = round(_jitter(72, 0.12), 1)
                pass_rate = round(random.uniform(0.68, 0.96), 4)
                rows.append(
                    {
                        "student_id": f"STU-{idx:06d}",
                        "term_date": d.isoformat(),
                        "grade_level": grade,
                        "subject": subject,
                        "school_region": region,
                        "enrollment_count": enrollment,
                        "attendance_rate": attendance,
                        "test_score": score,
                        "pass_rate": pass_rate,
                    }
                )
            if len(rows) >= n:
                break
        if len(rows) >= n:
            break
    fields = [
        "student_id",
        "term_date",
        "grade_level",
        "subject",
        "school_region",
        "enrollment_count",
        "attendance_rate",
        "test_score",
        "pass_rate",
    ]
    return fields, _fill_to_target(rows, n)


GENERATORS = [
    ("retail_1k", "retail_ecommerce_1k.csv", generate_retail),
    ("banking_1k", "banking_financial_1k.csv", generate_banking),
    ("hr_1k", "hr_workforce_1k.csv", generate_hr),
    ("healthcare_1k", "healthcare_patient_1k.csv", generate_healthcare),
    ("manufacturing_1k", "manufacturing_quality_1k.csv", generate_manufacturing),
    ("marketing_1k", "marketing_campaign_1k.csv", generate_marketing),
    ("saas_1k", "saas_subscription_1k.csv", generate_saas),
    ("supply_chain_1k", "supply_chain_logistics_1k.csv", generate_supply_chain),
    ("education_1k", "education_student_1k.csv", generate_education),
    ("insurance_1k", "insurance_claims_1k.csv", generate_insurance),
    ("real_estate_1k", "real_estate_property_1k.csv", generate_real_estate),
    ("telecom_1k", "telecom_usage_1k.csv", generate_telecom),
    ("hospitality_1k", "hospitality_bookings_1k.csv", generate_hospitality),
    ("energy_1k", "energy_utilization_1k.csv", generate_energy),
    ("support_1k", "support_tickets_1k.csv", generate_support_tickets),
]


def main() -> None:
    summary: list[dict] = []
    for key, filename, fn in GENERATORS:
        fields, rows = fn()
        path = OUT_DIR / filename
        n = write_csv(path, fields, rows)
        summary.append(
            {
                "domain_key": key,
                "file": filename,
                "rows": n,
                "columns": len(fields),
                "column_names": fields,
            }
        )
        print(f"{filename}: {n} rows, {len(fields)} columns")

    manifest = OUT_DIR / "manifest.json"
    manifest.write_text(
        json.dumps({"seed": SEED, "target_rows": TARGET_ROWS, "datasets": summary}, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {manifest}")


if __name__ == "__main__":
    main()
