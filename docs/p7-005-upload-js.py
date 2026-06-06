#!/usr/bin/env python3
"""Print JS snippet for browser file inject + upload."""
import sys
from pathlib import Path

b64 = Path(sys.argv[1]).read_text(encoding="utf-8-sig").strip()
name = sys.argv[2]
print(
    f"(async () => {{ const b64 = '{b64}'; const fileName = '{name}'; "
    "const binary = atob(b64); const bytes = new Uint8Array(binary.length); "
    "for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); "
    "const file = new File([bytes], fileName, { type: 'text/csv' }); "
    "const input = document.querySelector('input[type=\"file\"]'); "
    "if (!input) return { ok: false, err: 'no input' }; "
    "const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; "
    "input.dispatchEvent(new Event('change', { bubbles: true })); "
    "await new Promise(r => setTimeout(r, 300)); "
    "let btn = Array.from(document.querySelectorAll('button')).find(b => /Upload Dataset/i.test(b.textContent || '')); "
    "if (!btn) btn = Array.from(document.querySelectorAll('button')).find(b => /Replace file/i.test(b.textContent || '')); "
    "if (btn && /Replace file/i.test(btn.textContent||'')) { btn.click(); await new Promise(r=>setTimeout(r,200)); "
    "const input2 = document.querySelector('input[type=\"file\"]'); const dt2 = new DataTransfer(); dt2.items.add(file); input2.files = dt2.files; input2.dispatchEvent(new Event('change', { bubbles: true })); "
    "btn = Array.from(document.querySelectorAll('button')).find(b => /Upload Dataset/i.test(b.textContent || '')); } "
    "if (!btn || btn.disabled) return { ok: false, err: 'upload btn missing', text: btn?.textContent }; "
    "btn.click(); "
    "for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 1000)); "
    "const body = document.body.innerText; if (body.includes(fileName.replace('.csv','')) || /Uploading|Replace file/.test(body) === false && body.includes('Total Revenue')) { "
    "if (!/Uploading/.test(body)) return { ok: true, wait: i+1, snippet: body.slice(0,200) }; } } "
    "return { ok: false, err: 'upload timeout' }; })()"
)
