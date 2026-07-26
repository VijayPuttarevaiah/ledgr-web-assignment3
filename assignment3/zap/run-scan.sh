#!/usr/bin/env bash
# Assignment 3 §4 — authenticated headless OWASP ZAP scan.
#
#   ./assignment3/zap/run-scan.sh before   # scan before the remediations
#   ./assignment3/zap/run-scan.sh after    # re-scan to prove the fixes
#
# Two things make this scan worth more than a default one:
#
#   1. It is authenticated. `zap-baseline.py` against Ledgr with no session
#      only ever sees /sign-in, because proxy.ts redirects everything else —
#      it reports on the login page and calls the app clean. The captured
#      session cookie is injected into every request through ZAP's replacer
#      so the spider and the active scanner reach the real application.
#   2. It is a full scan, not a passive one: ZAP spiders the app and then
#      actively attacks what it finds (injection, traversal, XSS, and so on)
#      rather than only reading response headers.
set -euo pipefail

LABEL="${1:?usage: run-scan.sh <before|after>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$REPO_ROOT/assignment3/zap/$LABEL"
SESSION="$REPO_ROOT/assignment3/jmeter/session.properties"

COOKIE="$(grep '^ledgr.cookie=' "$SESSION" | cut -d= -f2-)"
TARGET="http://host.docker.internal:3100"

mkdir -p "$OUT_DIR"

docker run --rm -v "$OUT_DIR:/zap/wrk/:rw" -t ghcr.io/zaproxy/zaproxy:stable \
  zap-full-scan.py \
  -t "$TARGET" \
  -r "zap-full-report.html" \
  -J "zap-full-report.json" \
  -w "zap-full-report.md" \
  -x "zap-full-report.xml" \
  -I -j -m 4 \
  -z "-config replacer.full_list(0).description=session \
      -config replacer.full_list(0).enabled=true \
      -config replacer.full_list(0).matchtype=REQ_HEADER \
      -config replacer.full_list(0).matchstr=Cookie \
      -config replacer.full_list(0).regex=false \
      -config replacer.full_list(0).replacement=$COOKIE"
