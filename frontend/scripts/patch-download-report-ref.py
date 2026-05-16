from pathlib import Path

p = Path("frontend/app/page.tsx")
t = p.read_text(encoding="utf-8")
start = t.index("  const downloadReport = async (options?: Partial<ExportOptions>) => {")
end = t.index("  const renderDatasetChart = (", start)
block = t[start:end]
# Remove outer `const downloadReport = async (...) => {` and final `};`
lines = block.splitlines()
if not lines[0].strip().startswith("const downloadReport"):
    raise SystemExit("bad start")
# body lines inside async (exclude first and last which is `  };`)
body_lines = lines[1:-1]
inner = "\n".join(body_lines) + "\n  };"

prefix = """  const downloadReportImplRef = useRef<
    (options?: Partial<ExportOptions>) => Promise<void>
  >(async () => {});

  downloadReportImplRef.current = async (options?: Partial<ExportOptions>) => {
"""

suffix = """
  const downloadReport = useCallback(
    (options?: Partial<ExportOptions>) => downloadReportImplRef.current(options),
    []
  );

"""

new_t = t[:start] + prefix + inner + suffix + t[end:]
p.write_text(new_t, encoding="utf-8")
print("patched downloadReport", len(inner))
