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
# No --toc for the Word build. Pandoc emits a TOC *field*, which only
# populates when the reader refreshes it. Word does so on open because
# reference.docx sets updateFields, but LibreOffice and Google Docs do not,
# and an unpopulated field renders as a "Table of Contents" heading with
# nothing beneath it. A missing contents page is tidy; a broken one is not.
# The PDF keeps its contents page, rendered statically at build time.
pandoc REPORT.md -o "Ledgr-Assignment3-Report.docx" \
  --reference-doc=reference.docx --resource-path=.

cd "$REPO_ROOT"
npx tsx assignment3/scripts/html-to-pdf.ts \
  assignment3/report/report-print.html \
  assignment3/report/Ledgr-Assignment3-Report.pdf
rm -f assignment3/report/report-print.html

cp assignment3/report/Ledgr-Assignment3-Report.pdf  ..
cp assignment3/report/Ledgr-Assignment3-Report.docx ..

echo
echo "Rebuilt. PDF and DOCX are in assignment3/report/ and in the parent folder."
