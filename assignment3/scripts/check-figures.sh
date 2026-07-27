#!/usr/bin/env bash
# Checks that every image REPORT.md references actually exists, and reports
# which are still missing. Run it after dropping in manually-captured
# screenshots, before rebuilding the PDF.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="$REPO_ROOT/assignment3/report"

cd "$REPORT_DIR" || exit 1

missing=0
present=0

echo "Checking images referenced by REPORT.md"
echo

while IFS= read -r path; do
  if [[ -f "$path" ]]; then
    size=$(du -k "$path" | cut -f1)
    printf "  ok      %6sK  %s\n" "$size" "$path"
    present=$((present + 1))
  else
    printf "  MISSING          %s\n" "$path"
    missing=$((missing + 1))
  fi
done < <(grep -o '!\[[^]]*\]([^)]*)' REPORT.md | sed 's/.*(\(.*\))/\1/')

echo
echo "  $present present, $missing missing"

if (( missing > 0 )); then
  echo
  echo "Rebuilding with images missing will produce a PDF with blank figures."
  exit 1
fi

echo "  All figures present — safe to rebuild."
