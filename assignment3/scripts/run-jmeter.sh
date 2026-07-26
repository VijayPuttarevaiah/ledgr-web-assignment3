#!/usr/bin/env bash
#
# Assignment 3 — runs the JMeter plan and produces the deliverable CSVs.
#
#   ./assignment3/scripts/run-jmeter.sh baseline
#   ./assignment3/scripts/run-jmeter.sh optimized
#
# The two thread groups run consecutively inside one plan, so the single
# .jtl this produces contains both scenarios. It is split afterwards by
# thread-group name into light.csv / moderate.csv, and JMeter's own report
# generator is run over each half — that is where the per-endpoint average,
# 95th percentile, throughput and error-rate figures in the report come
# from, rather than from numbers computed by hand.
#
# Pass --smoke for a 20-second shakedown run that validates the plan
# without spending five minutes on it.

set -euo pipefail

LABEL="${1:?usage: run-jmeter.sh <baseline|optimized> [--smoke]}"
SMOKE="${2:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
JMETER_DIR="$REPO_ROOT/assignment3/jmeter"
PLAN="$JMETER_DIR/ledgr-test-plan.jmx"
SESSION="$JMETER_DIR/session.properties"
OUT_DIR="$JMETER_DIR/results/$LABEL"

if [[ ! -f "$SESSION" ]]; then
  echo "error: $SESSION not found. Run 'npm run capture:session' first." >&2
  exit 1
fi

BASE_URL="$(grep '^ledgr.baseurl=' "$SESSION" | cut -d= -f2-)"
if ! curl -sf -o /dev/null "$BASE_URL/api/health"; then
  echo "error: $BASE_URL/api/health is not answering. Start the production server first." >&2
  exit 1
fi

COOKIE="$(grep '^ledgr.cookie=' "$SESSION" | cut -d= -f2-)"

# Warm-up. `next start` compiles nothing at request time, but the JIT is
# cold, the Supabase client pool is empty and every route's module graph is
# unloaded, so the first hit on each endpoint is several times slower than
# the steady state. Without this the baseline and optimised runs would each
# carry a different amount of first-hit cost in their averages and the
# comparison would partly measure warm-up rather than the optimisations.
echo "--- Warming up (30 requests across the journey) ---"
for _ in 1 2 3; do
  for path in /dashboard /ledger "/analytics?range=3M" "/api/transactions?page=1&pageSize=20" \
              "/api/analytics/summary?range=1M" /api/categories /api/health; do
    curl -s -o /dev/null -H "Cookie: $COOKIE" "$BASE_URL$path"
  done
done
sleep 3

SCENARIO_OVERRIDES=()
if [[ "$SMOKE" == "--smoke" ]]; then
  echo "--- SMOKE RUN (short durations, results are not a deliverable) ---"
  SCENARIO_OVERRIDES=(
    -Jledgr.light.threads=3 -Jledgr.light.ramp=3 -Jledgr.light.duration=15
    -Jledgr.moderate.threads=5 -Jledgr.moderate.ramp=3 -Jledgr.moderate.duration=15
  )
  OUT_DIR="$JMETER_DIR/results/smoke"
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

RAW_JTL="$OUT_DIR/raw-results.jtl"

echo "=== JMeter run: $LABEL -> $OUT_DIR ==="
jmeter -n \
  -t "$PLAN" \
  -q "$SESSION" \
  -l "$RAW_JTL" \
  -j "$OUT_DIR/jmeter.log" \
  -Jjmeter.save.saveservice.output_format=csv \
  -Jjmeter.save.saveservice.print_field_names=true \
  -Jjmeter.save.saveservice.assertion_results_failure_message=true \
  -Jjmeter.save.saveservice.thread_counts=true \
  -Jjmeter.save.saveservice.idle_time=true \
  -Jjmeter.save.saveservice.connect_time=true \
  -Jsummariser.interval=15 \
  "${SCENARIO_OVERRIDES[@]+"${SCENARIO_OVERRIDES[@]}"}"

echo
echo "=== Splitting the combined .jtl into per-scenario CSVs ==="
python3 - "$RAW_JTL" "$OUT_DIR" <<'PY'
import csv, sys
from pathlib import Path

raw, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
with raw.open(newline="", encoding="utf-8") as fh:
    reader = csv.DictReader(fh)
    header = reader.fieldnames
    rows = list(reader)

# JMeter stamps each sample with "<thread group name> <group>-<thread>", so
# the scenario a row belongs to is recoverable from threadName alone.
buckets = {"light": [], "moderate": []}
for row in rows:
    name = row.get("threadName", "")
    if name.startswith("Scenario 1"):
        buckets["light"].append(row)
    elif name.startswith("Scenario 2"):
        buckets["moderate"].append(row)

for scenario, scenario_rows in buckets.items():
    path = out_dir / f"{scenario}-results.csv"
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=header)
        writer.writeheader()
        writer.writerows(scenario_rows)
    print(f"  {path.name}: {len(scenario_rows)} samples")
PY

echo
echo "=== Generating JMeter HTML dashboards ==="
for scenario in light moderate; do
  CSV="$OUT_DIR/$scenario-results.csv"
  REPORT="$OUT_DIR/${scenario}-report"
  if [[ -s "$CSV" ]]; then
    rm -rf "$REPORT"
    jmeter -g "$CSV" -o "$REPORT" -j "$OUT_DIR/jmeter-report-$scenario.log" \
      -Jjmeter.reportgenerator.overall_granularity=5000 >/dev/null 2>&1 || \
      echo "  (dashboard generation for $scenario reported warnings — see the log)"
    if [[ -f "$REPORT/statistics.json" ]]; then
      cp "$REPORT/statistics.json" "$OUT_DIR/$scenario-statistics.json"
      echo "  $scenario: $REPORT/index.html"
    fi
  fi
done

echo
echo "Done. Deliverable CSVs in $OUT_DIR"
