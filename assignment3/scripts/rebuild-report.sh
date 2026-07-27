#!/usr/bin/env bash
# Rebuilds the PDF and DOCX from REPORT.md. Refuses to run if any figure the
# report references is missing, because pandoc renders those as blank boxes
# without complaining.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

"$REPO_ROOT/assignment3/scripts/check-figures.sh"

cd "$REPO_ROOT/assignment3/report"
pandoc REPORT.md -o report-print.html --standalone --css=style.css \
  --metadata title="Ledgr — Assignment 3" --toc --toc-depth=2 --resource-path=.
pandoc REPORT.md -o "Ledgr-Assignment3-Report.docx" \
  --reference-doc=reference.docx --resource-path=. --toc --toc-depth=2

cd "$REPO_ROOT"
npx tsx assignment3/scripts/html-to-pdf.ts \
  assignment3/report/report-print.html \
  assignment3/report/Ledgr-Assignment3-Report.pdf
rm -f assignment3/report/report-print.html

cp assignment3/report/Ledgr-Assignment3-Report.pdf  ..
cp assignment3/report/Ledgr-Assignment3-Report.docx ..

echo
echo "Rebuilt. PDF and DOCX are in assignment3/report/ and in the parent folder."
