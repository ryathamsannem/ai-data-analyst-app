#!/usr/bin/env python3
import sys
from pathlib import Path

b64_path = Path(sys.argv[1])
name = sys.argv[2]
out = Path(sys.argv[3])
b64 = b64_path.read_bytes()
# strip UTF-16 BOM if present
if b64.startswith(b"\xff\xfe"):
    b64 = b64[2:].decode("utf-16-le").strip()
elif b64.startswith(b"\xef\xbb\xbf"):
    b64 = b64[3:].decode("utf-8").strip()
else:
    b64 = b64.decode("utf-8", errors="ignore").strip()

js = (
    f"(async () => {{ const b64 = '{b64}'; const fileName = '{name}'; "
    "const binary = atob(b64); const bytes = new Uint8Array(binary.length); "
    "for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); "
    "const file = new File([bytes], fileName, { type: 'text/csv' }); "
    "const input = document.querySelector('input[type=\"file\"]'); "
    "if (!input) return { ok: false, err: 'no input' }; "
    "const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; "
    "input.dispatchEvent(new Event('change', { bubbles: true })); "
    "await new Promise(r => setTimeout(r, 400)); "
    "let btn = Array.from(document.querySelectorAll('button')).find(b => /Upload Dataset/i.test(b.textContent || '')); "
    "if (!btn || btn.disabled) return { ok: false, err: 'upload disabled', btn: btn?.textContent }; "
    "btn.click(); "
    "for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 1000)); "
    "const body = document.body.innerText; if (!/Uploading|Upload Dataset/.test(body) && (body.includes('department') || body.includes('Maharashtra') || body.includes('Total Revenue'))) "
    "return { ok: true, wait: i+1, hasDept: body.includes('department'), rows: body.match(/\\d+ rows/)?.[0] }; } "
    "return { ok: false, err: 'timeout' }; })()"
)
out.write_text(js, encoding="utf-8")
