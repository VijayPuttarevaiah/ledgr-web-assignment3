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

**Baseline run** (26 Jul, 19:03–19:10) → save as `grafana-baseline-{1,2,3}-*.png`

```
http://localhost:3001/d/ledgr-overview/ledgr-application-health-assignment-3?from=1785103414000&to=1785103834000&kiosk
```

**Optimised run** (26 Jul, 19:43–19:50) → save as `grafana-optimized-{1,2,3}-*.png`

```
http://localhost:3001/d/ledgr-overview/ledgr-application-health-assignment-3?from=1785105827000&to=1785106247000&kiosk
```

`&kiosk` hides Grafana's nav chrome, which is what you want in a report. Drop
it if you would rather show the surrounding UI.

## 2. Prometheus

| What | URL |
|---|---|
| Targets — all three jobs UP | `http://localhost:9090/targets` |
| Alert rules loaded | `http://localhost:9090/alerts` |
| Config as Prometheus parsed it | `http://localhost:9090/config` |

The targets page is cheap, strong evidence that the scrape configuration
actually works rather than just existing in a file.

## 3. JMeter dashboards

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

## 4. OWASP ZAP reports

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

The report references these exact paths. Save with these names and the
rebuild picks them up with no edits to the source.

| Your capture | Save as |
|---|---|
| Grafana baseline — SLI tiles + Request latency | `assignment3/monitoring/screenshots/grafana-baseline-1-indicators-latency.png` |
| Grafana baseline — Throughput/errors + Resource utilisation | `assignment3/monitoring/screenshots/grafana-baseline-2-throughput-resources.png` |
| Grafana baseline — Concurrency + Event-loop + Host memory | `assignment3/monitoring/screenshots/grafana-baseline-3-concurrency.png` |
| Grafana optimised — SLI tiles + Request latency | `assignment3/monitoring/screenshots/grafana-optimized-1-indicators-latency.png` |
| Grafana optimised — Throughput/errors + Resource utilisation | `assignment3/monitoring/screenshots/grafana-optimized-2-throughput-resources.png` |
| Grafana optimised — Concurrency + Event-loop + Host memory | `assignment3/monitoring/screenshots/grafana-optimized-3-concurrency.png` |
| Prometheus targets | `assignment3/monitoring/screenshots/prometheus-targets.png` (overwrite) |
| Prometheus alert rules | `assignment3/monitoring/screenshots/prometheus-alerts.png` (overwrite) |

JMeter and ZAP figures are already captured and committed — nothing to do
for those.

Then verify and rebuild in one step:

```bash
./assignment3/scripts/check-figures.sh      # lists anything still missing
./assignment3/scripts/rebuild-report.sh     # refuses to run if any are
```


