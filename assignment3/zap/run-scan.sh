#!/usr/bin/env bash
# Assignment 3 §4 — authenticated headless OWASP ZAP scan.
#
#   ./assignment3/zap/run-scan.sh before   # scan before the remediations
#   ./assignment3/zap/run-scan.sh after    # re-scan to prove the fixes
#
# This drives ZAP through its Automation Framework rather than the
# `zap-full-scan.py` convenience wrapper. The wrapper was tried first and
# could not complete a run against this application; the Automation
# Framework is what allows the three adjustments below, each of which was
# needed to get a scan that finishes and that looks at the right things.
#
#   1. The scan is authenticated. ZAP with no session only ever sees
#      /sign-in, because proxy.ts redirects everything else — it would
#      report on the login page and pronounce the application clean. The
#      `replacer` job injects the captured session cookie into every
#      request, so the spider and the active scanner reach the real app.
#
#   2. Next.js's content-hashed JavaScript bundles are out of scope. They
#      are static files with no parameters to attack, so scanning them finds
#      nothing — but the "Suspicious Comments" passive rule reads each one
#      line by line, and on the 392 KB chart bundle that was taking up to
#      114 seconds per pass. Left in, the scan does not finish.
#
#   3. The DOM-based XSS active rule (40026) is disabled. It drives a
#      headless Firefox inside the ZAP container, and on this stack that
#      consistently killed the ZAP daemon mid-scan — the wrapper then lost
#      its proxy connection and exited without writing any report at all.
#      Reflected and persistent XSS are still actively tested by rules
#      40012, 40014, 40016 and 40017.
set -euo pipefail

LABEL="${1:?usage: run-scan.sh <before|after>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$REPO_ROOT/assignment3/zap/$LABEL"
SESSION="$REPO_ROOT/assignment3/jmeter/session.properties"

COOKIE="$(grep '^ledgr.cookie=' "$SESSION" | cut -d= -f2-)"
TARGET="http://host.docker.internal:3100"

mkdir -p "$OUT_DIR"

# The plan is generated rather than committed with a cookie baked into it:
# the session is a live credential and expires within the hour.
cat > "$OUT_DIR/automation-plan.yaml" <<YAML
env:
  contexts:
    - name: ledgr
      urls:
        - "$TARGET"
      includePaths:
        - "$TARGET.*"
      excludePaths:
        - "$TARGET/_next/static/.*"
        - "$TARGET/api/metrics.*"
  parameters:
    failOnError: false
    failOnWarning: false
    progressToStdout: true

jobs:
  - type: replacer
    parameters:
      deleteAllRules: true
    rules:
      - description: "Authenticated session captured by npm run capture:session"
        matchType: req_header
        matchString: Cookie
        matchRegex: false
        replacementString: "$COOKIE"
        tokenProcessing: false

  - type: passiveScan-config
    parameters:
      maxAlertsPerRule: 25
      scanOnlyInScope: true
    rules:
      # Reads every line of every response looking for TODO/FIXME comments.
      # Harmless on HTML, pathological on multi-hundred-kilobyte bundles.
      - id: 10027
        threshold: "off"

  - type: spider
    parameters:
      context: ledgr
      maxDuration: 3
      maxDepth: 10
      numberOfThreads: 5

  - type: passiveScan-wait
    parameters:
      maxDuration: 5

  - type: activeScan
    parameters:
      context: ledgr
      maxRuleDurationInMins: 2
      maxScanDurationInMins: 20
      threadPerHost: 4
    policyDefinition:
      defaultStrength: medium
      defaultThreshold: medium
      rules:
        - id: 40026
          name: "Cross Site Scripting (DOM Based)"
          strength: "off"
          threshold: "off"

  - type: report
    parameters:
      template: traditional-html
      reportDir: /zap/wrk
      reportFile: zap-full-report.html
      reportTitle: "Ledgr — OWASP ZAP full scan ($LABEL)"
  - type: report
    parameters:
      template: traditional-json
      reportDir: /zap/wrk
      reportFile: zap-full-report.json
  - type: report
    parameters:
      template: traditional-md
      reportDir: /zap/wrk
      reportFile: zap-full-report.md
  - type: report
    parameters:
      template: traditional-xml
      reportDir: /zap/wrk
      reportFile: zap-full-report.xml
YAML

echo "=== ZAP Automation Framework: $LABEL -> $OUT_DIR ==="
docker run --rm --memory=6g -v "$OUT_DIR:/zap/wrk/:rw" -t ghcr.io/zaproxy/zaproxy:stable \
  zap.sh -cmd -autorun /zap/wrk/automation-plan.yaml

echo
echo "Reports written to $OUT_DIR"
