from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
slice_path = ROOT / "app/components/home/_slice.txt"
header_path = Path(__file__).resolve().parent / "_chart_renderer_header.txt"
out_path = ROOT / "app/components/home/chart-renderer.tsx"

lines = slice_path.read_text(encoding="utf-8").splitlines()
assert lines[0].strip().startswith("const renderDatasetChart")
# Inner body: after `) => {` (line index 5) through before closing `  };`
body_lines = lines[6:-1]

# Drop legacy closure bindings (replaced by props in header)
drop_prefixes = (
    "const rData = insightMode",
    "const rViz = insightMode",
    "const rKind = insightMode",
    "const rAxes = insightMode",
)
filtered = []
for ln in body_lines:
    stripped = ln.strip()
    if any(stripped.startswith(p) for p in drop_prefixes):
        continue
    filtered.append(ln)
body_lines = filtered

dedented = []
for ln in body_lines:
    if ln.startswith("    "):
        dedented.append(ln[2:])
    else:
        dedented.append(ln)

body = "\n".join(dedented)
body = body.replace("insightChartDrill", "onInsightDrill")

header = header_path.read_text(encoding="utf-8")

footer = """
}

export const ChartRenderer = memo(ChartRendererInner);
ChartRenderer.displayName = "ChartRenderer";
"""

out_path.write_text(header + body + footer, encoding="utf-8")
print("Wrote", out_path, "chars", len(header + body + footer))
