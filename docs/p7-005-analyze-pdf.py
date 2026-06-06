#!/usr/bin/env python3
"""Analyze P7-005 manual browser export PDF."""
import json
import sys
from pathlib import Path

import fitz

CONVERSATION = [
    "Which city generates the highest revenue?",
    "Why is Mumbai highest?",
    "What evidence supports this conclusion?",
    "Which columns were used",
    "Show the calculations behind this answer.",
]

REGION_CONVERSATION = [
    "Which region generates the highest revenue?",
    "Why is North highest?",
    "What evidence supports this conclusion?",
    "Which columns were used",
    "Show the calculations behind this answer.",
]


def analyze(path: Path, conversation: list[str]) -> dict:
    doc = fitz.open(path)
    text = "\n".join(doc[i].get_text("text") for i in range(len(doc)))
    pages = len(doc)
    blank = [
        i + 1
        for i in range(pages)
        if len(doc[i].get_text("text").strip()) < 20
    ]
    doc.close()
    return {
        "file": path.name,
        "pages": pages,
        "sections": {
            "kpi": "KPI dashboard" in text,
            "aiInsight": "AI insight" in text,
            "chart": "Visualization" in text,
            "preview": "Data preview" in text,
            "dataQuality": "Data quality" in text,
            "conversation": "AI conversation thread" in text,
            "appendix": "Technical appendix" in text,
        },
        "conversationPresent": {q: q in text for q in conversation},
        "hasRawJson": ('{"' in text) or ("column_types" in text),
        "blankPages": blank,
        "pageFooter": "Page 1 of" in text,
        "pass": all(
            [
                "KPI dashboard" in text,
                "AI insight" in text,
                "Visualization" in text,
                "Data preview" in text,
                "Data quality" in text,
                "AI conversation thread" in text,
                "Technical appendix" in text,
                not (('{"' in text) or ("column_types" in text)),
                not blank,
                all(q in text for q in conversation),
            ]
        ),
    }


if __name__ == "__main__":
    pdf = Path(sys.argv[1])
    conv = REGION_CONVERSATION if "generic" in pdf.name else CONVERSATION
    print(json.dumps(analyze(pdf, conv), indent=2))
