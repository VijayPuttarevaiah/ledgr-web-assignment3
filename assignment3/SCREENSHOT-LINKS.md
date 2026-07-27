# Screenshot links

Every URL below is live right now — Grafana, Prometheus and the app are all
running, and Prometheus still holds both load-test windows (15-day
retention, verified 29 data points in each).

Grafana has anonymous viewer access enabled in `docker-compose.yml`, so none
of these ask for a login.

**Take them at 125% browser zoom or higher.** The single biggest problem with
a Grafana screenshot in a report is that it is legible on your monitor and
unreadable once shrunk onto an A4 page.

---

## 1. Grafana — the two load-test windows

These two are the most valuable images in the report. They are the same
dashboard over the two runs, and side by side they show the whole result:
about 20% error ratio during the baseline, none at all after.

The time range is pinned in the URL, so you will see yesterday's load test
rather than an idle server. Do not change the range or the panels go flat.

**Baseline run** (26 Jul, 19:03–19:10) → replaces `dashboard-during-baseline-load-test.png`

```
http://localhost:3001/d/ledgr-overview/ledgr-application-health-assignment-3?from=1785103414000&to=1785103834000&kiosk
```

**Optimised run** (26 Jul, 19:43–19:50) → replaces `dashboard-during-optimized-load-test.png`

```
http://localhost:3001/d/ledgr-overview/ledgr-application-health-assignment-3?from=1785105827000&to=1785106247000&kiosk
```

`&kiosk` hides Grafana's nav chrome, which is what you want in a report. Drop
it if you would rather show the surrounding UI.

## 2. Grafana — the four panels the rubric names

The rubric asks specifically for panels covering CPU, memory, request latency
and error rate. These open one panel full-screen, over the baseline window so
there is something to see.

| Panel | URL |
|---|---|
| Request latency (p50/p95/p99) | `http://localhost:3001/d/ledgr-overview/ledgr-application-health-assignment-3?from=1785103414000&to=1785103834000&viewPanel=10&kiosk` |
| Error rate by status class | `http://localhost:3001/d/ledgr-overview/ledgr-application-health-assignment-3?from=1785103414000&to=1785103834000&viewPanel=21&kiosk` |
| CPU utilisation | `http://localhost:3001/d/ledgr-overview/ledgr-application-health-assignment-3?from=1785103414000&to=1785103834000&viewPanel=30&kiosk` |
| Memory usage | `http://localhost:3001/d/ledgr-overview/ledgr-application-health-assignment-3?from=1785103414000&to=1785103834000&viewPanel=31&kiosk` |

Swap `from`/`to` for the optimised window if you would rather show the
post-optimisation shape.

## 3. Prometheus

| What | URL |
|---|---|
| Targets — all three jobs UP | `http://localhost:9090/targets` |
| Alert rules loaded | `http://localhost:9090/alerts` |
| Config as Prometheus parsed it | `http://localhost:9090/config` |

The targets page is cheap, strong evidence that the scrape configuration
actually works rather than just existing in a file.

## 4. JMeter dashboards

These are local HTML files, not a server. Open them straight in a browser:

```bash
open assignment3/jmeter/results/baseline/moderate-report/index.html
open assignment3/jmeter/results/optimized/moderate-report/index.html
```

Screenshot the top of the page: the **APDEX table** and the **Requests
Summary** pie sit side by side, and just below them is the **Statistics**
table with average, min, max, median, 90th/95th/99th percentile, throughput
and error % per endpoint. That one screen is most of what the baseline
criterion asks for.

The baseline shows APDEX 0.757 with a 22.41% red slice; the optimised shows
APDEX 0.999 and a fully green pie.

Light-load equivalents, if you want them:

```bash
open assignment3/jmeter/results/baseline/light-report/index.html
open assignment3/jmeter/results/optimized/light-report/index.html
```

## 5. OWASP ZAP reports

Also local HTML:

```bash
open assignment3/zap/before/zap-full-report.html
open assignment3/zap/after/zap-full-report.html
```

Screenshot the **Summary of Alerts** table near the top of each. The before
report shows 3 Medium, 1 Low and 4 Informational; the after report shows 1
Medium, 0 Low and 3 Informational. Those two tables side by side are the
proof of remediation the rubric asks for.

---

## Optional: capture Grafana under live load instead

If you would rather screenshot a load test happening in front of you than a
historical window, run a short burst and watch the dashboard fill in:

```bash
# 1. open the dashboard on a live 15-minute window
open "http://localhost:3001/d/ledgr-overview/ledgr-application-health-assignment-3?from=now-15m&to=now&refresh=5s"

# 2. refresh the session, then run a 90-second load burst
npm run capture:session -- --base-url http://localhost:3100
./assignment3/scripts/run-jmeter.sh baseline --smoke
```

The `--smoke` flag runs a short shakedown rather than the full five minutes.
Its numbers are not a deliverable — the committed CSVs remain the measured
results — but the dashboard will show a real ramp, a latency curve and a CPU
climb while you watch.

## Where the files go

Save over the existing ones so the report picks them up without edits:

| Screenshot | Path |
|---|---|
| Grafana, baseline window | `assignment3/monitoring/screenshots/dashboard-during-baseline-load-test.png` |
| Grafana, optimised window | `assignment3/monitoring/screenshots/dashboard-during-optimized-load-test.png` |
| Latency panel | `assignment3/monitoring/screenshots/panel-request-latency-percentiles.png` |
| Error-rate panel | `assignment3/monitoring/screenshots/panel-error-rate-and-status-classes.png` |
| CPU panel | `assignment3/monitoring/screenshots/panel-cpu-utilisation.png` |
| Memory panel | `assignment3/monitoring/screenshots/panel-memory-usage.png` |
| Prometheus targets | `assignment3/monitoring/screenshots/prometheus-targets.png` |
| JMeter, baseline moderate | `assignment3/report/figures/jmeter-dashboard-baseline-moderate.png` |
| JMeter, optimised moderate | `assignment3/report/figures/jmeter-dashboard-optimized-moderate.png` |
| ZAP before | `assignment3/report/figures/zap-report-before.png` |
| ZAP after | `assignment3/report/figures/zap-report-after.png` |

Then rebuild the PDF and DOCX:

```bash
cd assignment3/report
pandoc REPORT.md -o report-print.html --standalone --css=style.css --toc --toc-depth=2 --resource-path=.
pandoc REPORT.md -o Ledgr-Assignment3-Report.docx --reference-doc=reference.docx --resource-path=. --toc --toc-depth=2
cd ../..
npx tsx assignment3/scripts/html-to-pdf.ts \
  assignment3/report/report-print.html \
  assignment3/report/Ledgr-Assignment3-Report.pdf
rm assignment3/report/report-print.html
```
