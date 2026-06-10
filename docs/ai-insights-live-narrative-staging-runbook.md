# AI Insights — Live Narrative QA Staging Runbook

Run Wave 1 **full `/ask` narrative QA** on staging (Render shell) or any Linux host where Anthropic TLS works.

**Harness:** `backend/scripts/wave1_live_narrative_qa.py`  
**Fixtures:** `test-fixtures/domains/`  
**Prior routing QA:** [`ai-insights-wave1-execution-report.md`](ai-insights-wave1-execution-report.md)

This runbook does **not** change routing, prompts, or UI — evaluation only.

---

## 1. Required environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | **Yes** | Must be set in Render dashboard or shell. Harness fails preflight if missing. |
| `APP_ENV` | Recommended | `production` on Render; `development` locally. Logged at preflight. |
| `AI_NARRATIVE_ENABLED` | Optional | Default `true`. Set `false` only if narrative is intentionally disabled. |

On Render, set secrets in the **Web Service → Environment** panel. Do not commit keys to git.

Optional local convenience: copy `.env.example` → `.env` at repo root with `ANTHROPIC_API_KEY=sk-...`.

---

## 2. Where to run

| Environment | Recommended | Why |
|-------------|-------------|-----|
| **Render shell** (staging/prod backend) | ✅ Yes | Linux TLS to `api.anthropic.com` works; same runtime as production |
| **Linux CI / dev container** | ✅ Yes | Same as above |
| **Windows + Anaconda (local)** | ⚠️ Often fails | Known `SSL: CERTIFICATE_VERIFY_FAILED` — preflight fails fast |

---

## 3. Preflight (always runs first)

Before any domain matrix, the harness:

1. Confirms `ANTHROPIC_API_KEY` is non-empty  
2. Calls `_generate_insight_narrative` (same path as `/ask`) with a one-line probe  
3. Verifies the response is **not** a connection/auth fallback message  

**If preflight fails:** exit code `1` (no key) or `2` (TLS/API). **No domain tests run.**

### Preflight-only smoke (recommended first step on staging)

```bash
cd backend
python scripts/wave1_live_narrative_qa.py --preflight-only
```

Expected success:

```text
Preflight: APP_ENV=production
Preflight: ANTHROPIC_API_KEY present (value not printed)
Preflight OK: Claude responded (N chars)
Preflight-only mode: exiting without QA matrix.
```

---

## 4. Full run commands

### Full Wave 1 narrative matrix (~63 `/ask` calls, ~15–25 min)

```bash
cd backend
python scripts/wave1_live_narrative_qa.py
```

### Single domain smoke

```bash
python scripts/wave1_live_narrative_qa.py --domain retail
```

Domain aliases: `retail`, `marketing`, `sales`, `geography`, `banking`

### Limited questions (fast check)

```bash
python scripts/wave1_live_narrative_qa.py --domain sales --limit 5
```

### Custom output location

```bash
python scripts/wave1_live_narrative_qa.py --output docs/staging-run-2026-06-10
# writes docs/staging-run-2026-06-10-results.json
#       docs/staging-run-2026-06-10-report.md
```

Or output directory:

```bash
python scripts/wave1_live_narrative_qa.py --output docs/staging-runs/june10/
# writes docs/staging-runs/june10/results.json
#       docs/staging-runs/june10/report.md
```

### Fail fast on first bad answer

```bash
python scripts/wave1_live_narrative_qa.py --domain retail --limit 3 --fail-fast
```

Exits with code `3` on first `/ask` error or fallback narrative.

### Skip follow-up chains (standalone questions only)

```bash
python scripts/wave1_live_narrative_qa.py --domain geography --skip-chain
```

---

## 5. CLI reference

```
python scripts/wave1_live_narrative_qa.py [--domain NAME] [--limit N]
    [--output PATH] [--fail-fast] [--preflight-only] [--skip-chain]
```

| Flag | Effect |
|------|--------|
| `--domain` | One domain only (`retail`, `marketing`, `sales`, `geography`, `banking`) |
| `--limit N` | First N standalone questions per domain (chain unchanged unless `--skip-chain`) |
| `--output PATH` | Custom results/report path (see §4) |
| `--fail-fast` | Stop on first `/ask` error or fallback narrative |
| `--preflight-only` | API/TLS smoke only |
| `--skip-chain` | Omit follow-up chain per domain |

---

## 6. Expected output files

| File | Default path |
|------|----------------|
| JSON results | `docs/ai-insights-wave1-live-narrative-results.json` |
| Markdown report | `docs/ai-insights-wave1-live-narrative-report.md` |

JSON includes:

- `preflight` — preflight metadata  
- `claude_narrative_success` / `claude_narrative_fallback` — live vs fallback counts  
- Per-question `narrative_source`: `live` | `fallback` | `error`  
- Six narrative dimension scores per question  

---

## 7. Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success; all answers were live Claude narratives |
| `1` | `ANTHROPIC_API_KEY` missing |
| `2` | Preflight failed (TLS, auth, empty response) |
| `3` | `--fail-fast` triggered on error/fallback |
| `4` | Run completed but one or more fallback answers (invalid for narrative sign-off) |

---

## 8. Pass / fail interpretation

### Preflight

| Result | Verdict |
|--------|---------|
| `Preflight OK` | Proceed to full matrix |
| `CERTIFICATE_VERIFY_FAILED` | Fix host/TLS or use Render shell — **do not trust narrative scores** |
| Auth error | Fix `ANTHROPIC_API_KEY` on staging |

### Narrative matrix (after live Claude responses)

Per domain in the generated report:

| Verdict | Criteria |
|---------|----------|
| **Pass** | Domain narrative avg ≥ 7.5 and ≥ 85% of questions ≥ 7.0 |
| **Conditional** | Domain narrative avg ≥ 6.5 |
| **Fail** | Below conditional thresholds |

**Hard gates (any = narrative not ready):**

- `claude_narrative_fallback` > 0  
- Any `hallucination_resistance` ≤ 3 (invented KPI on negative tests)  
- Negative questions (`*-NEG`) with `limitation_first` < 7  

**Dimensions scored (0–10 each):**

1. Data grounding  
2. Executive summary quality  
3. Recommendation quality  
4. Confidence explanation  
5. Follow-up continuity  
6. Hallucination resistance  

Plus routing/chart scores from the shared Wave 1 rubric (unchanged).

---

## 9. Suggested staging workflow

```bash
# 1. SSH / Render shell into backend service
cd /opt/render/project/src/backend   # adjust to your deploy path

# 2. Preflight
python scripts/wave1_live_narrative_qa.py --preflight-only

# 3. Single-domain smoke
python scripts/wave1_live_narrative_qa.py --domain retail --limit 3 --fail-fast

# 4. Full matrix
python scripts/wave1_live_narrative_qa.py --output docs/staging-wave1-live

# 5. Review
cat ../docs/staging-wave1-live-report.md
```

Commit or attach `*-results.json` and `*-report.md` to your release ticket.

---

## 10. What this does NOT change

- No AI routing / resolver logic  
- No prompt rewrites  
- No frontend UI  
- No narrative quality fixes (evaluation only)

Safe to merge harness + runbook without redeploying narrative behavior.

---

## 11. Troubleshooting

| Symptom | Action |
|---------|--------|
| All answers: "Could not reach the AI service…" | Preflight should catch this; run on Render/Linux |
| Preflight OK but fallbacks in matrix | Intermittent outage; re-run with `--fail-fast` |
| `fixture not found` | Run from repo root with `test-fixtures/domains/` present |
| Very slow run | Use `--domain` + `--limit` for smoke; full matrix ~63 API calls |

---

*Related: [`ai-insights-wave1-live-narrative-report.md`](ai-insights-wave1-live-narrative-report.md) (latest results)*
