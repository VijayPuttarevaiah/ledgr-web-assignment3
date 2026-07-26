#!/usr/bin/env python3
"""
Assignment 3 — turns raw JMeter CSVs into the report's tables and charts.

Reads the per-scenario CSVs produced by run-jmeter.sh and emits, for each
scenario:

  * a per-sampler table (count, average, median, p90, p95, p99, min, max,
    throughput, error rate, KB/s) written as CSV, and
  * when both a baseline and an optimised run are present, a side-by-side
    comparison table with percentage deltas, plus PNG charts.

Percentiles are computed the way JMeter's own report generator does
(nearest-rank on the sorted elapsed-time list) so the numbers here agree
with the HTML dashboards rather than quietly disagreeing with them.

Usage:
  python3 assignment3/scripts/analyse-results.py            # both runs
  python3 assignment3/scripts/analyse-results.py --only baseline
"""
import argparse
import csv
import json
import math
from pathlib import Path

RESULTS = Path(__file__).resolve().parents[1] / "jmeter" / "results"
OUT = Path(__file__).resolve().parents[1] / "report" / "data"
SCENARIOS = ["light", "moderate"]


def percentile(sorted_values, pct):
    """Nearest-rank percentile, matching JMeter's report generator."""
    if not sorted_values:
        return 0.0
    rank = math.ceil(pct / 100 * len(sorted_values))
    return float(sorted_values[max(0, min(rank, len(sorted_values)) - 1)])


def load(path):
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def summarise(rows):
    """Per-label statistics plus a synthetic 'TOTAL' row."""
    by_label = {}
    for row in rows:
        by_label.setdefault(row["label"], []).append(row)

    def stats_for(label, label_rows):
        elapsed = sorted(int(r["elapsed"]) for r in label_rows)
        latency = sorted(int(r["Latency"]) for r in label_rows if r.get("Latency"))
        errors = sum(1 for r in label_rows if r["success"] != "true")
        stamps = [int(r["timeStamp"]) for r in label_rows]
        span_s = (max(stamps) + max(elapsed) - min(stamps)) / 1000 or 1
        total_bytes = sum(int(r["bytes"]) for r in label_rows if r.get("bytes", "").isdigit())
        return {
            "label": label,
            "samples": len(label_rows),
            "errors": errors,
            "error_pct": round(errors / len(label_rows) * 100, 2),
            "avg_ms": round(sum(elapsed) / len(elapsed), 1),
            "median_ms": round(percentile(elapsed, 50), 1),
            "p90_ms": round(percentile(elapsed, 90), 1),
            "p95_ms": round(percentile(elapsed, 95), 1),
            "p99_ms": round(percentile(elapsed, 99), 1),
            "min_ms": elapsed[0],
            "max_ms": elapsed[-1],
            "ttfb_avg_ms": round(sum(latency) / len(latency), 1) if latency else 0.0,
            "throughput_rps": round(len(label_rows) / span_s, 2),
            "kb_per_sec": round(total_bytes / 1024 / span_s, 2),
            "avg_bytes": round(total_bytes / len(label_rows), 1),
        }

    result = [stats_for(label, r) for label, r in sorted(by_label.items())]
    # The transaction-controller row is a roll-up of samplers already counted
    # individually; including it in TOTAL would double-count it.
    real = [r for r in rows if not r["label"].startswith("TX")]
    if real:
        result.append(stats_for("TOTAL (excluding transaction roll-ups)", real))
    return result


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def pct_change(before, after):
    """Negative = improvement for latency, positive = improvement for throughput."""
    if before == 0:
        return 0.0
    return round((after - before) / before * 100, 1)


def compare(baseline_rows, optimized_rows):
    before = {r["label"]: r for r in baseline_rows}
    after = {r["label"]: r for r in optimized_rows}
    out = []
    for label in sorted(set(before) | set(after)):
        b, a = before.get(label), after.get(label)
        if not b or not a:
            continue
        out.append(
            {
                "label": label,
                "avg_before_ms": b["avg_ms"],
                "avg_after_ms": a["avg_ms"],
                "avg_change_pct": pct_change(b["avg_ms"], a["avg_ms"]),
                "p95_before_ms": b["p95_ms"],
                "p95_after_ms": a["p95_ms"],
                "p95_change_pct": pct_change(b["p95_ms"], a["p95_ms"]),
                "tps_before": b["throughput_rps"],
                "tps_after": a["throughput_rps"],
                "tps_change_pct": pct_change(b["throughput_rps"], a["throughput_rps"]),
                "err_before_pct": b["error_pct"],
                "err_after_pct": a["error_pct"],
                "err_change_pp": round(a["error_pct"] - b["error_pct"], 2),
            }
        )
    return out


def make_charts(scenario, comparison):
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("  (matplotlib not installed — skipping charts)")
        return

    rows = [r for r in comparison if not r["label"].startswith("TOTAL")]
    rows.sort(key=lambda r: r["p95_before_ms"], reverse=True)
    labels = [r["label"][:38] for r in rows]
    y = range(len(rows))
    height = 0.38

    for metric, before_key, after_key, title, unit in [
        ("avg", "avg_before_ms", "avg_after_ms", "Average response time", "ms"),
        ("p95", "p95_before_ms", "p95_after_ms", "95th-percentile response time", "ms"),
    ]:
        fig, ax = plt.subplots(figsize=(10, 0.55 * len(rows) + 2))
        ax.barh([i + height / 2 for i in y], [r[before_key] for r in rows], height,
                label="Baseline", color="#c44e52")
        ax.barh([i - height / 2 for i in y], [r[after_key] for r in rows], height,
                label="Optimised", color="#4c72b0")
        ax.set_yticks(list(y))
        ax.set_yticklabels(labels, fontsize=8)
        ax.invert_yaxis()
        ax.set_xlabel(f"{title} ({unit}) — lower is better")
        ax.set_title(f"{title} — {scenario} load, baseline vs optimised")
        ax.legend()
        ax.grid(axis="x", alpha=0.3)
        fig.tight_layout()
        path = OUT.parent / "figures" / f"{scenario}-{metric}-comparison.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(path, dpi=150)
        plt.close(fig)
        print(f"  chart: {path.relative_to(OUT.parents[1])}")

    # Throughput and error rate for the run as a whole.
    total = next((r for r in comparison if r["label"].startswith("TOTAL")), None)
    if total:
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9, 4))
        ax1.bar(["Baseline", "Optimised"], [total["tps_before"], total["tps_after"]],
                color=["#c44e52", "#4c72b0"])
        ax1.set_ylabel("Requests per second — higher is better")
        ax1.set_title("Throughput")
        for i, v in enumerate([total["tps_before"], total["tps_after"]]):
            ax1.text(i, v, f"{v:.1f}", ha="center", va="bottom")
        ax2.bar(["Baseline", "Optimised"], [total["err_before_pct"], total["err_after_pct"]],
                color=["#c44e52", "#4c72b0"])
        ax2.set_ylabel("Error rate (%) — lower is better")
        ax2.set_title("Error rate")
        for i, v in enumerate([total["err_before_pct"], total["err_after_pct"]]):
            ax2.text(i, v, f"{v:.2f}%", ha="center", va="bottom")
        fig.suptitle(f"{scenario.capitalize()} load — throughput and error rate")
        fig.tight_layout()
        path = OUT.parent / "figures" / f"{scenario}-throughput-errors.png"
        fig.savefig(path, dpi=150)
        plt.close(fig)
        print(f"  chart: {path.relative_to(OUT.parents[1])}")


def print_table(rows, columns, widths):
    header = "  ".join(f"{c:{w}}" for c, w in zip(columns, widths))
    print("  " + header)
    print("  " + "-" * len(header))
    for row in rows:
        print("  " + "  ".join(f"{str(row[c])[:w]:{w}}" for c, w in zip(columns, widths)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=["baseline", "optimized"])
    args = parser.parse_args()

    runs = [args.only] if args.only else ["baseline", "optimized"]
    summaries = {}

    for run in runs:
        for scenario in SCENARIOS:
            path = RESULTS / run / f"{scenario}-results.csv"
            if not path.exists():
                continue
            rows = load(path)
            stats = summarise(rows)
            summaries[(run, scenario)] = stats
            out = OUT / f"{run}-{scenario}-summary.csv"
            write_csv(out, stats)
            print(f"\n=== {run} / {scenario} ({len(rows)} samples) -> {out.name}")
            print_table(
                stats,
                ["label", "samples", "avg_ms", "p95_ms", "p99_ms", "throughput_rps", "error_pct"],
                [46, 8, 9, 9, 9, 15, 9],
            )

    for scenario in SCENARIOS:
        b = summaries.get(("baseline", scenario))
        a = summaries.get(("optimized", scenario))
        if not (b and a):
            continue
        comparison = compare(b, a)
        out = OUT / f"comparison-{scenario}.csv"
        write_csv(out, comparison)
        print(f"\n=== BEFORE vs AFTER / {scenario} -> {out.name}")
        print_table(
            comparison,
            ["label", "avg_before_ms", "avg_after_ms", "avg_change_pct",
             "p95_before_ms", "p95_after_ms", "p95_change_pct", "err_change_pp"],
            [40, 14, 13, 15, 14, 13, 15, 13],
        )
        make_charts(scenario, comparison)
        (OUT / f"comparison-{scenario}.json").write_text(
            json.dumps(comparison, indent=2) + "\n", encoding="utf-8"
        )


if __name__ == "__main__":
    main()
