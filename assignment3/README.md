# Assignment 3 — performance, resilience and security

Everything for Advanced Web Development Assignment 3 lives in this
directory. The report itself is
[`report/Ledgr-Assignment3-Report.pdf`](report/Ledgr-Assignment3-Report.pdf)
(also available as `.docx` and as the `REPORT.md` source it was generated
from).

## Headline results

| | Baseline | Optimised | Change |
|---|---:|---:|---|
| Error rate, moderate load (50 users) | 22.41% | **0.00%** | eliminated |
| Average latency, moderate load | 33.7 ms | 16.0 ms | **−52.5%** |
| 95th-percentile latency, moderate load | 174 ms | 72 ms | **−58.6%** |
| Throughput, moderate load | 146.8 req/s | 204.4 req/s | **+39.3%** |
| Average latency, light load | 23.2 ms | 7.2 ms | **−69.0%** |
| JavaScript per browsing session | 1,558 KB | 1,174 KB | **−24.6%** |
| ZAP Medium findings | 3 | 1 | 2 fixed and re-scanned |

## Layout

```
assignment3/
├── report/
│   ├── Ledgr-Assignment3-Report.pdf   ← the submission (37 pp)
│   ├── Ledgr-Assignment3-Report.docx
│   ├── REPORT.md                      ← source
│   ├── style.css                      ← print stylesheet for the PDF
│   ├── reference.docx                 ← pandoc template; gives Word tables borders
│   ├── data/                          ← summary + comparison CSVs, EXPLAIN output
│   └── figures/                       ← generated charts and report screenshots
├── jmeter/
│   ├── ledgr-test-plan.jmx            ← both load scenarios
│   └── results/{baseline,optimized}/  ← raw .jtl, per-scenario CSVs, statistics.json
├── zap/
│   ├── run-scan.sh                    ← authenticated headless scan
│   └── {before,after}/                ← HTML / JSON / Markdown / XML reports
├── monitoring/
│   ├── docker-compose.yml             ← Prometheus, Grafana, node-exporter
│   ├── prometheus/                    ← scrape config + alert rules
│   ├── grafana/                       ← provisioned datasource + dashboard JSON
│   └── screenshots/                   ← dashboard and panel captures
└── scripts/                           ← seeding, session capture, measurement, analysis
```

## Reproducing the whole thing

```bash
# 1. Backing services
supabase start
cd assignment3/monitoring && docker compose up -d && cd ../..
#    Prometheus  http://localhost:9090
#    Grafana     http://localhost:3001  (admin / admin)

# 2. Data and a production build
npm run seed:demo          # curated demo data
npm run seed:loadtest      # tops the demo account up to 4,091 transactions
npm run build
SUPABASE_SERVICE_ROLE_KEY=<local secret> PORT=3100 npm run start

# 3. Capture a session (JMeter and ZAP both need one)
npm run capture:session -- --base-url http://localhost:3100

# 4. Load test  →  assignment3/jmeter/results/<label>/
./assignment3/scripts/run-jmeter.sh baseline
./assignment3/scripts/run-jmeter.sh optimized
python3 assignment3/scripts/analyse-results.py

# 5. Client-side rendering metrics
npm run measure:client -- --label baseline
npm run measure:client -- --label optimized

# 6. Database evidence (EXPLAIN ANALYZE, REST payload sizes)
./assignment3/scripts/measure-db.sh

# 7. Security scan
./assignment3/zap/run-scan.sh before
./assignment3/zap/run-scan.sh after
npx tsx assignment3/scripts/verify-csp.ts     # app still works under the tightened CSP

# 8. Screenshots and report
npm run capture:grafana
npm run capture:evidence
cd assignment3/report && pandoc REPORT.md -o report-print.html --standalone --css=style.css --toc
npx tsx assignment3/scripts/html-to-pdf.ts assignment3/report/report-print.html \
        assignment3/report/Ledgr-Assignment3-Report.pdf
```

`session.properties` is deliberately not committed: it holds a live Supabase
access token that expires within the hour. Regenerate it with step 3 before
running JMeter or ZAP.

## The changes this drove in the application

| Path | Change |
|---|---|
| `src/lib/cache/ttl-cache.ts` | TTL + LRU cache with request coalescing |
| `src/lib/api/session.ts` | Cached session verification (removes an auth round-trip per request) |
| `src/lib/api/transaction-summary.ts` | Cached `transaction_totals()` aggregate |
| `src/lib/api/analytics-cache.ts` | Cached analytics summary |
| `src/lib/metrics.ts`, `src/lib/metrics-http-hook.ts` | Prometheus instrumentation |
| `src/instrumentation.ts`, `src/app/api/metrics/route.ts` | Registration and scrape endpoint |
| `src/lib/security/csp.ts` | Split document / non-document Content Security Policy |
| `src/components/charts/index.tsx` | One shared recharts chunk instead of one per route |
| `next.config.ts` | `optimizePackageImports`, `staleTimes`, scoped security headers |
| `supabase/migrations/20260726000001_perf_aggregates.sql` | Composite index + aggregate function |
| `supabase/migrations/20260726000002_rls_initplan.sql` | 28 RLS policies rewritten to evaluate `auth.uid()` once per statement |
