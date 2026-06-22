#!/usr/bin/env python3
"""
Production-quality golden regression datasets for AI Analytics SaaS.

Generates row-level business data with realistic trends, seasonality,
concentration, correlations, skew, and outliers — not random noise.
"""

from __future__ import annotations

import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 20260621
OUT_DIR = Path(__file__).resolve().parent

random.seed(SEED)


def month_label(d: date) -> str:
    return d.strftime("%Y-%m")


def quarter_label(d: date) -> str:
    return f"Q{(d.month - 1) // 3 + 1} {d.year}"


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def seasonality_factor(month: int) -> float:
    """Retail seasonality — Q4 peak, post-holiday dip."""
    return 1.0 + 0.22 * math.sin(2 * math.pi * (month - 10.5) / 12) + (
        0.08 if month in (11, 12) else 0.0
    )


def trend_factor(year: int, base_year: int = 2022) -> float:
    return 1.0 + 0.09 * (year - base_year)


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def generate_retail_gold(n_rows: int = 10_000) -> tuple[list[str], list[dict]]:
    fields = [
        "order_date",
        "month",
        "quarter",
        "year",
        "region",
        "state",
        "city",
        "customer_segment",
        "customer_age_group",
        "product_category",
        "sub_category",
        "product_name",
        "quantity",
        "sales_amount",
        "profit",
        "discount_pct",
        "shipping_cost",
        "delivery_days",
        "customer_rating",
        "campaign_name",
        "marketing_channel",
    ]

    geo = {
        "North": [("Delhi", "Delhi"), ("Chandigarh", "Punjab"), ("Jaipur", "Rajasthan")],
        "South": [("Bengaluru", "Karnataka"), ("Chennai", "Tamil Nadu"), ("Hyderabad", "Telangana")],
        "East": [("Kolkata", "West Bengal"), ("Patna", "Bihar"), ("Bhubaneswar", "Odisha")],
        "West": [("Mumbai", "Maharashtra"), ("Pune", "Maharashtra"), ("Ahmedabad", "Gujarat")],
    }
    region_weights = {"North": 0.34, "South": 0.28, "West": 0.24, "East": 0.14}

    catalog = {
        "Electronics": {
            "Laptops": [("ProBook 15", 1.45, 0.22), ("UltraAir 13", 1.55, 0.24)],
            "Phones": [("Nova X", 1.2, 0.18), ("Pixel One", 1.1, 0.16)],
            "Accessories": [("Wireless Buds", 0.85, 0.28), ("Smart Watch", 0.95, 0.26)],
        },
        "Furniture": {
            "Office": [("Ergo Chair", 0.75, 0.14), ("Standing Desk", 0.9, 0.12)],
            "Home": [("Sectional Sofa", 0.8, 0.11), ("Dining Set", 0.7, 0.10)],
        },
        "Clothing": {
            "Outerwear": [("Winter Parka", 0.65, 0.20), ("Rain Jacket", 0.6, 0.18)],
            "Basics": [("Cotton Tee", 0.4, 0.22), ("Denim Jeans", 0.55, 0.19)],
        },
        "Home & Kitchen": {
            "Appliances": [("Air Fryer", 0.7, 0.17), ("Blender Pro", 0.65, 0.16)],
            "Clearance": [("Open-box Mixer", 0.35, -0.08), ("Damaged Kettle", 0.25, -0.15)],
        },
    }

    segments = ["Consumer", "SMB", "Enterprise"]
    segment_w = [0.52, 0.30, 0.18]
    age_groups = ["18-24", "25-34", "35-44", "45-54", "55+"]
    campaigns = [
        "Spring Savings",
        "Back to School",
        "Holiday Mega Sale",
        "New Year Refresh",
        "Loyalty Rewards",
        "Flash Weekend",
    ]
    channels = ["Paid Search", "Paid Social", "Email", "Affiliate", "Organic", "In-Store"]

    start = date(2022, 1, 1)
    end = date(2024, 12, 31)
    span_days = (end - start).days

    rows: list[dict] = []
    for i in range(n_rows):
        order_date = start + timedelta(days=random.randint(0, span_days))
        month = month_label(order_date)
        quarter = quarter_label(order_date)
        year = order_date.year

        region = random.choices(list(region_weights.keys()), weights=list(region_weights.values()))[0]
        city, state = random.choice(geo[region])

        category = random.choices(
            list(catalog.keys()),
            weights=[0.38, 0.18, 0.22, 0.22],
        )[0]
        sub_category = random.choice(list(catalog[category].keys()))
        product_name, price_mult, base_margin = random.choice(catalog[category][sub_category])

        seg = random.choices(segments, weights=segment_w)[0]
        seg_price = {"Consumer": 1.0, "SMB": 1.12, "Enterprise": 1.28}[seg]

        qty = random.choices([1, 2, 3, 4, 5, 8, 12], weights=[40, 22, 14, 10, 7, 5, 2])[0]
        if random.random() < 0.012:
            qty = random.randint(25, 80)

        unit_price = random.uniform(45, 420) * price_mult * seg_price
        unit_price *= seasonality_factor(order_date.month) * trend_factor(year)
        if random.random() < 0.015:
            unit_price *= random.uniform(2.5, 4.5)

        sales_amount = round(unit_price * qty, 2)

        discount = random.uniform(0, 0.12)
        if category == "Home & Kitchen" and sub_category == "Clearance":
            discount = random.uniform(0.25, 0.45)
        elif random.random() < 0.08:
            discount = random.uniform(0.15, 0.30)
        discount = round(discount, 4)

        margin = base_margin - (discount * 0.85)
        if region == "North":
            margin += 0.02
        profit = round(sales_amount * margin - random.uniform(2, 18), 2)

        ship = round(random.uniform(4.5, 28.0) + qty * 0.6, 2)
        delivery = int(clamp(random.gauss(5.5, 2.2), 1, 14))
        if random.random() < 0.02:
            delivery = random.randint(15, 28)
        if region == "West" and city == "Mumbai":
            delivery = max(1, delivery - 1)

        rating = round(clamp(random.gauss(4.2 - discount * 2.5, 0.45), 1.0, 5.0), 1)

        campaign = random.choice(campaigns)
        if order_date.month in (11, 12):
            campaign = "Holiday Mega Sale"
        channel = random.choices(
            channels,
            weights=[0.22, 0.18, 0.16, 0.10, 0.20, 0.14],
        )[0]

        rows.append(
            {
                "order_date": order_date.isoformat(),
                "month": month,
                "quarter": quarter,
                "year": year,
                "region": region,
                "state": state,
                "city": city,
                "customer_segment": seg,
                "customer_age_group": random.choice(age_groups),
                "product_category": category,
                "sub_category": sub_category,
                "product_name": product_name,
                "quantity": qty,
                "sales_amount": sales_amount,
                "profit": profit,
                "discount_pct": discount,
                "shipping_cost": ship,
                "delivery_days": delivery,
                "customer_rating": rating,
                "campaign_name": campaign,
                "marketing_channel": channel,
            }
        )

    return fields, rows


def generate_hr_gold(n_rows: int = 5_000) -> tuple[list[str], list[dict]]:
    fields = [
        "employee_id",
        "gender",
        "age",
        "age_band",
        "department",
        "job_family",
        "job_level",
        "location",
        "hire_date",
        "exit_date",
        "salary",
        "bonus",
        "performance_rating",
        "engagement_score",
        "training_hours",
        "manager_flag",
        "attrition_flag",
        "promotion_flag",
    ]

    departments = ["Engineering", "Sales", "Marketing", "Operations", "Finance", "HR", "Support"]
    dept_attrition = {
        "Sales": 0.16,
        "Support": 0.14,
        "Marketing": 0.11,
        "Operations": 0.10,
        "Engineering": 0.08,
        "Finance": 0.07,
        "HR": 0.06,
    }
    locations = ["HQ - New York", "HQ - London", "Remote - US", "Remote - EMEA", "Bengaluru", "Singapore"]
    loc_weights = [0.22, 0.12, 0.24, 0.14, 0.20, 0.08]
    job_families = ["Engineering", "Sales", "Marketing", "Operations", "Finance", "People", "Customer Success"]
    job_levels = ["IC1", "IC2", "IC3", "M1", "M2", "Director", "VP"]
    level_salary_base = {
        "IC1": 52000,
        "IC2": 68000,
        "IC3": 88000,
        "M1": 105000,
        "M2": 128000,
        "Director": 155000,
        "VP": 195000,
    }

    rows: list[dict] = []
    for i in range(n_rows):
        emp_id = f"EMP-{i + 1:05d}"
        gender = random.choice(["Female", "Male", "Non-binary"])
        age = int(clamp(random.gauss(38, 9), 22, 62))
        if age < 28:
            band = "22-27"
        elif age < 35:
            band = "28-34"
        elif age < 45:
            band = "35-44"
        elif age < 55:
            band = "45-54"
        else:
            band = "55+"

        dept = random.choices(
            departments,
            weights=[0.24, 0.16, 0.10, 0.14, 0.10, 0.06, 0.20],
        )[0]
        location = random.choices(locations, weights=loc_weights)[0]
        jf_map = {
            "Engineering": "Engineering",
            "Sales": "Sales",
            "Marketing": "Marketing",
            "Operations": "Operations",
            "Finance": "Finance",
            "HR": "People",
            "Support": "Customer Success",
        }
        job_family = jf_map[dept]
        job_level = random.choices(
            job_levels,
            weights=[0.28, 0.26, 0.18, 0.12, 0.08, 0.05, 0.03],
        )[0]

        hire_year = random.randint(2015, 2024)
        hire_month = random.randint(1, 12)
        hire_day = random.randint(1, 28)
        hire_date = date(hire_year, hire_month, hire_day)

        perf = round(clamp(random.gauss(3.6, 0.65), 1.0, 5.0), 1)
        engagement = round(clamp(perf * 0.85 + random.gauss(0.6, 0.35), 1.0, 5.0), 1)

        base = level_salary_base[job_level]
        dept_adj = {"Engineering": 1.12, "Sales": 1.05, "Finance": 1.08, "Support": 0.92}.get(dept, 1.0)
        loc_adj = {"HQ - New York": 1.18, "HQ - London": 1.14, "Bengaluru": 0.72, "Singapore": 1.05}.get(
            location, 1.0
        )
        salary = round(base * dept_adj * loc_adj * random.uniform(0.92, 1.12), 2)
        if random.random() < 0.01:
            salary = round(salary * random.uniform(1.45, 1.85), 2)

        bonus = round(salary * random.uniform(0.02, 0.18) * (perf / 4.5), 2)
        training = round(clamp(random.gauss(28, 12), 4, 80), 1)
        manager_flag = 1 if job_level.startswith("M") or job_level in ("Director", "VP") else 0

        attr_prob = dept_attrition[dept]
        if perf < 2.5:
            attr_prob += 0.12
        if engagement < 2.8:
            attr_prob += 0.08
        attrition_flag = 1 if random.random() < attr_prob else 0

        promotion_flag = 0
        if perf >= 4.0 and random.random() < 0.22:
            promotion_flag = 1

        exit_date = ""
        if attrition_flag:
            tenure_days = random.randint(90, max(120, (date(2024, 12, 31) - hire_date).days))
            exit_d = hire_date + timedelta(days=tenure_days)
            if exit_d > date(2024, 12, 31):
                exit_d = date(2024, 12, 31) - timedelta(days=random.randint(1, 120))
            exit_date = exit_d.isoformat()

        rows.append(
            {
                "employee_id": emp_id,
                "gender": gender,
                "age": age,
                "age_band": band,
                "department": dept,
                "job_family": job_family,
                "job_level": job_level,
                "location": location,
                "hire_date": hire_date.isoformat(),
                "exit_date": exit_date,
                "salary": salary,
                "bonus": bonus,
                "performance_rating": perf,
                "engagement_score": engagement,
                "training_hours": training,
                "manager_flag": manager_flag,
                "attrition_flag": attrition_flag,
                "promotion_flag": promotion_flag,
            }
        )

    # Active employees: exit_date left blank so hire_date wins semantic date mapping.
    for r in rows:
        if r["attrition_flag"] == 0:
            r["exit_date"] = ""

    return fields, rows


def generate_banking_gold(n_rows: int = 10_000) -> tuple[list[str], list[dict]]:
    fields = [
        "customer_id",
        "customer_segment",
        "region",
        "city",
        "product_type",
        "loan_balance",
        "deposit_balance",
        "credit_score",
        "utilization_pct",
        "spend_amount",
        "transaction_count",
        "delinquency_flag",
        "account_age_months",
        "monthly_income",
        "month",
    ]

    segments = ["Retail", "SME", "Corporate", "Premium", "Mass Affluent"]
    seg_w = [0.42, 0.22, 0.10, 0.14, 0.12]
    regions = {
        "North": ["Delhi", "Chandigarh", "Lucknow"],
        "South": ["Bengaluru", "Chennai", "Hyderabad"],
        "East": ["Kolkata", "Patna"],
        "West": ["Mumbai", "Pune", "Ahmedabad"],
    }
    region_w = [0.30, 0.28, 0.18, 0.24]
    products = ["Mortgage", "Personal Loan", "Auto Loan", "Credit Card", "Term Deposit", "Business LOC"]

    months = []
    y, m = 2022, 1
    for _ in range(36):
        months.append(date(y, m, 1))
        m += 1
        if m > 12:
            m = 1
            y += 1

    n_customers = 2800
    customer_ids = [f"CUST-{i:05d}" for i in range(1, n_customers + 1)]
    customer_profile = {}
    for cid in customer_ids:
        seg = random.choices(segments, weights=seg_w)[0]
        region = random.choices(list(regions.keys()), weights=region_w)[0]
        city = random.choice(regions[region])
        product = random.choices(
            products,
            weights=[0.18, 0.22, 0.14, 0.20, 0.16, 0.10],
        )[0]
        income = random.uniform(2800, 18500)
        if seg == "Corporate":
            income *= random.uniform(8, 22)
        elif seg == "SME":
            income *= random.uniform(2.5, 5.5)
        elif seg == "Premium":
            income *= random.uniform(1.8, 3.2)
        credit = int(clamp(random.gauss(710, 55), 520, 820))
        if seg == "Retail":
            credit = int(clamp(credit - random.uniform(20, 60), 520, 780))
        age_m = random.randint(6, 180)
        customer_profile[cid] = {
            "segment": seg,
            "region": region,
            "city": city,
            "product_type": product,
            "monthly_income": round(income, 2),
            "credit_score": credit,
            "account_age_months": age_m,
        }

    rows: list[dict] = []
    mi = 0
    while len(rows) < n_rows:
        cid = random.choice(customer_ids)
        prof = customer_profile[cid]
        month_d = months[mi % len(months)]
        mi += 1

        seg = prof["segment"]
        loan_mult = {"Retail": 0.35, "SME": 1.8, "Corporate": 4.5, "Premium": 1.4, "Mass Affluent": 0.85}[seg]
        loan = prof["monthly_income"] * random.uniform(8, 45) * loan_mult
        deposit = prof["monthly_income"] * random.uniform(3, 28) * (1.2 if seg == "Premium" else 1.0)

        month_idx = mi % len(months)
        spend_trend = 1.0 + 0.04 * (month_idx / len(months)) + 0.06 * math.sin(
            2 * math.pi * month_d.month / 12
        )
        spend = prof["monthly_income"] * random.uniform(0.35, 1.6) * spend_trend
        if random.random() < 0.012:
            spend *= random.uniform(2.2, 3.8)

        util = clamp((loan / max(deposit + loan, 1)) * random.uniform(0.55, 1.15), 0.05, 0.98)
        txn = max(3, int(random.gauss(28, 12) * (1.1 if seg == "Premium" else 1.0)))

        delinq_prob = 0.02
        if prof["credit_score"] < 620:
            delinq_prob = 0.28
        elif prof["credit_score"] < 680:
            delinq_prob = 0.12
        elif util > 0.85:
            delinq_prob += 0.10
        delinq = 1 if random.random() < delinq_prob else 0

        rows.append(
            {
                "customer_id": cid,
                "customer_segment": seg,
                "region": prof["region"],
                "city": prof["city"],
                "product_type": prof["product_type"],
                "loan_balance": round(loan, 2),
                "deposit_balance": round(deposit, 2),
                "credit_score": prof["credit_score"],
                "utilization_pct": round(util, 4),
                "spend_amount": round(spend, 2),
                "transaction_count": txn,
                "delinquency_flag": delinq,
                "account_age_months": prof["account_age_months"] + month_idx,
                "monthly_income": prof["monthly_income"],
                "month": month_label(month_d),
            }
        )

    return fields, rows[:n_rows]


def main() -> None:
    datasets = [
        ("retail_gold_10000.csv", *generate_retail_gold(10_000)),
        ("hr_gold_5000.csv", *generate_hr_gold(5_000)),
        ("banking_gold_10000.csv", *generate_banking_gold(10_000)),
    ]
    for filename, fields, rows in datasets:
        path = OUT_DIR / filename
        n = write_csv(path, fields, rows)
        print(f"Wrote {filename}: {n} rows x {len(fields)} columns")


if __name__ == "__main__":
    main()
