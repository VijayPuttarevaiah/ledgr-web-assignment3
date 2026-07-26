#!/usr/bin/env python3
"""
Assignment 3 — generator for `assignment3/jmeter/ledgr-test-plan.jmx`.

The two load scenarios must exercise a byte-identical user journey, or the
light-vs-moderate comparison measures the difference between two test plans
rather than the difference between two load levels. Hand-maintaining the
same 20-element sampler tree twice inside a 700-line XML file is exactly
the kind of thing that silently drifts, so the tree is described once here
as data and emitted twice.

The generated .jmx is the committed deliverable; this script exists so the
plan can be regenerated and reviewed, and is not needed to run the test.

Usage: python3 assignment3/scripts/generate-test-plan.py
"""
from pathlib import Path
from xml.sax.saxutils import escape


def attr(value: str) -> str:
    """Escape a string for use inside an XML attribute (quotes included)."""
    return escape(value, {'"': "&quot;", "'": "&apos;"})

OUT = Path(__file__).resolve().parents[1] / "jmeter" / "ledgr-test-plan.jmx"

THINK_TIME_MS = 500

SCENARIOS = [
    {
        "name": "Scenario 1 - Light Load (10 users / 30 s ramp-up)",
        "threads": "${__P(ledgr.light.threads,10)}",
        "ramp": "${__P(ledgr.light.ramp,30)}",
        "duration": "${__P(ledgr.light.duration,120)}",
        "comment": (
            "10 virtual users started one every 3 s (30 s / 10), then held at "
            "full load for the remainder of the 120 s window so the reported "
            "percentiles describe steady state rather than the ramp."
        ),
    },
    {
        "name": "Scenario 2 - Moderate Load (50 users / 60 s ramp-up)",
        "threads": "${__P(ledgr.moderate.threads,50)}",
        "ramp": "${__P(ledgr.moderate.ramp,60)}",
        "duration": "${__P(ledgr.moderate.duration,180)}",
        "comment": (
            "50 virtual users started one every 1.2 s (60 s / 50), held for the "
            "remainder of the 180 s window. Five times the concurrency of "
            "Scenario 1 against the same journey."
        ),
    },
]

# One iteration of this list is one simulated user session. Each entry is a
# top-level sampler; `assert_text` turns a silently-wrong 200 (for example
# the sign-in page served because the session expired) into a counted error.
JOURNEY = [
    {
        "id": "01",
        "label": "01 GET /dashboard (HTML document)",
        "path": "/dashboard",
        "assert_text": "Net balance",
        "extract_bundles": True,
        "comment": "Server-rendered dashboard: the heaviest page render in the app.",
    },
    {
        "id": "03",
        "label": "03 GET /api/analytics/summary?range=1M",
        "path": "/api/analytics/summary?range=1M",
        "assert_text": "categoryBreakdown",
        "comment": "Aggregation endpoint - reads every transaction in the range.",
    },
    {
        "id": "04",
        "label": "04 GET /api/transactions (page 1)",
        "path": "/api/transactions?page=1&pageSize=20",
        "assert_text": "\"transactions\"",
        "comment": "Paginated ledger feed plus the all-time income/expense summary.",
    },
    {
        "id": "05",
        "label": "05 GET /ledger (HTML document)",
        "path": "/ledger?page=1",
        "assert_text": "Ledger",
        "comment": "Server-rendered ledger page.",
    },
    {
        "id": "06",
        "label": "06 GET /api/transactions (page 2)",
        "path": "/api/transactions?page=2&pageSize=20",
        "assert_text": "\"transactions\"",
        "comment": "Second page - models a user paging through history.",
    },
    {
        "id": "07",
        "label": "07 GET /analytics?range=3M (HTML document)",
        "path": "/analytics?range=3M",
        "assert_text": "Savings rate",
        "comment": "Analytics page over a 3-month window (wider scan than 1M).",
    },
    {
        "id": "08",
        "label": "08 GET /api/categories",
        "path": "/api/categories",
        "assert_text": "categories",
        "comment": "Small reference-data endpoint - the control in the mix.",
    },
    {
        "id": "09",
        "label": "09 GET /api/health",
        "path": "/api/health",
        "assert_text": "\"status\"",
        "comment": "Liveness probe - one trivial round-trip to the database.",
    },
]


def indent(text: str, level: int) -> str:
    pad = "  " * level
    return "\n".join(pad + line if line.strip() else line for line in text.split("\n"))


def http_sampler(label: str, path: str, comment: str = "") -> str:
    comment_prop = (
        f'\n  <stringProp name="TestPlan.comments">{escape(comment)}</stringProp>' if comment else ""
    )
    return f"""<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="{attr(label)}" enabled="true">{comment_prop}
  <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
    <collectionProp name="Arguments.arguments"/>
  </elementProp>
  <stringProp name="HTTPSampler.domain"></stringProp>
  <stringProp name="HTTPSampler.port"></stringProp>
  <stringProp name="HTTPSampler.protocol"></stringProp>
  <stringProp name="HTTPSampler.contentEncoding"></stringProp>
  <stringProp name="HTTPSampler.path">{escape(path)}</stringProp>
  <stringProp name="HTTPSampler.method">GET</stringProp>
  <boolProp name="HTTPSampler.follow_redirects">false</boolProp>
  <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
  <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
  <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
  <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
  <stringProp name="HTTPSampler.connect_timeout">10000</stringProp>
  <stringProp name="HTTPSampler.response_timeout">60000</stringProp>
</HTTPSamplerProxy>"""


def response_assertion(text: str) -> str:
    return f"""<ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Assert response body contains {attr(text)}" enabled="true">
  <collectionProp name="Asserion.test_strings">
    <stringProp name="assert">{escape(text)}</stringProp>
  </collectionProp>
  <stringProp name="Assertion.custom_message">Response did not contain {escape(text)} - the request did not reach the authenticated handler.</stringProp>
  <stringProp name="Assertion.test_field">Assertion.response_data</stringProp>
  <boolProp name="Assertion.assume_success">false</boolProp>
  <intProp name="Assertion.test_type">16</intProp>
</ResponseAssertion>"""


def status_assertion() -> str:
    return """<ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Assert HTTP 200" enabled="true">
  <collectionProp name="Asserion.test_strings">
    <stringProp name="200">200</stringProp>
  </collectionProp>
  <stringProp name="Assertion.custom_message">Expected HTTP 200 - a 3xx here means the session cookie expired and JMeter was redirected to /sign-in.</stringProp>
  <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
  <boolProp name="Assertion.assume_success">false</boolProp>
  <intProp name="Assertion.test_type">8</intProp>
</ResponseAssertion>"""


def constant_timer() -> str:
    return f"""<ConstantTimer guiclass="ConstantTimerGui" testclass="ConstantTimer" testname="Think time ({THINK_TIME_MS} ms)" enabled="true">
  <stringProp name="TestPlan.comments">Constant Timer - models a user reading the screen before the next action. Deliberately NOT applied inside the bundle loop, because a browser fetches a page's JavaScript in parallel with no pause between files.</stringProp>
  <stringProp name="ConstantTimer.delay">{THINK_TIME_MS}</stringProp>
</ConstantTimer>"""


def regex_extractor() -> str:
    return """<RegexExtractor guiclass="RegexExtractorGui" testclass="RegexExtractor" testname="Extract JS bundle URLs from the HTML" enabled="true">
  <stringProp name="TestPlan.comments">Next.js emits content-hashed chunk names that change on every production build, so hard-coding bundle URLs would make the plan stop working the moment the app is rebuilt - and the whole point of the exercise is to run the identical plan before and after the optimisations. Scraping the URLs out of the served HTML is what a browser does anyway, and it keeps one plan valid across both builds.</stringProp>
  <stringProp name="RegexExtractor.useHeaders">false</stringProp>
  <stringProp name="RegexExtractor.refname">JSCHUNK</stringProp>
  <stringProp name="RegexExtractor.regex">(/_next/static/chunks/[A-Za-z0-9_.\\-]+\\.js)</stringProp>
  <stringProp name="RegexExtractor.template">$1$</stringProp>
  <stringProp name="RegexExtractor.default">NOT_FOUND</stringProp>
  <stringProp name="RegexExtractor.match_number">-1</stringProp>
  <stringProp name="Sample.scope">parent</stringProp>
</RegexExtractor>"""


DEDUPE_SCRIPT = """// The dashboard document references each chunk several times - once as a
// <script> tag and again inside the React Server Component flight payload -
// so the raw extractor output contains ~73 entries for ~16 distinct files.
// A browser fetches each file once; without this the load test would inflate
// its own request count more than fourfold and drown the API samplers in
// static-asset noise. Rewrites JSCHUNK_1..N in place as a de-duplicated,
// order-preserving list and clears the leftovers, because the ForEach
// controller stops at the first missing index.
int matches = (vars.get('JSCHUNK_matchNr') ?: '0') as int;
def unique = new LinkedHashSet<String>();
for (int i = 1; i <= matches; i++) {
    String value = vars.get('JSCHUNK_' + i);
    if (value != null && value.length() > 0) { unique.add(value); }
}
for (int i = 1; i <= matches; i++) { vars.remove('JSCHUNK_' + i); }
int index = 0;
unique.each { url -> vars.put('JSCHUNK_' + (++index), url); }
vars.put('JSCHUNK_matchNr', String.valueOf(index));
"""


def dedupe_post_processor() -> str:
    return f"""<JSR223PostProcessor guiclass="TestBeanGUI" testclass="JSR223PostProcessor" testname="De-duplicate the extracted bundle URLs" enabled="true">
  <stringProp name="cacheKey">true</stringProp>
  <stringProp name="filename"></stringProp>
  <stringProp name="parameters"></stringProp>
  <stringProp name="scriptLanguage">groovy</stringProp>
  <stringProp name="script">{escape(DEDUPE_SCRIPT)}</stringProp>
</JSR223PostProcessor>"""


def bundle_loop() -> str:
    # Two non-obvious JMeter details are load-bearing here.
    #
    # `useSeparator` is NOT "is the input a separated list" - it is the GUI's
    # "Add '_' before number?" checkbox. With it false the controller looks for
    # JSCHUNK1/JSCHUNK2, the extractor writes JSCHUNK_1/JSCHUNK_2, nothing
    # matches and the loop runs zero times without logging anything.
    #
    # startIndex/endIndex are deliberately omitted rather than written
    # as empty strings. JMeter reads them with getPropertyAsInt(); an empty
    # StringProperty parses to 0 instead of falling back to the -1 default,
    # endIndex becomes 0, and the controller exits before the first
    # iteration - a silent zero-request loop with nothing in the log.
    sampler = http_sampler(
        "02 GET JS bundle (/_next/static/chunks/*.js)",
        "${CHUNK_URL}",
        "Every JavaScript bundle the dashboard document references, fetched the way a browser would.",
    )
    return f"""<ForeachController guiclass="ForeachControlPanel" testclass="ForeachController" testname="For each JS bundle referenced by /dashboard" enabled="true">
  <stringProp name="ForeachController.inputVal">JSCHUNK</stringProp>
  <stringProp name="ForeachController.returnVal">CHUNK_URL</stringProp>
  <boolProp name="ForeachController.useSeparator">true</boolProp>
</ForeachController>
<hashTree>
{indent(sampler, 1)}
  <hashTree/>
</hashTree>"""


def journey_tree() -> str:
    parts = []

    # Step 1 + the bundle fan-out are wrapped in a Transaction Controller so
    # the report has one comparable "full dashboard load" number even though
    # the number and size of chunks changes between builds.
    dashboard = JOURNEY[0]
    inner = [
        http_sampler(dashboard["label"], dashboard["path"], dashboard["comment"]),
        "<hashTree>",
        indent(status_assertion(), 1),
        "  <hashTree/>",
        indent(response_assertion(dashboard["assert_text"]), 1),
        "  <hashTree/>",
        indent(regex_extractor(), 1),
        "  <hashTree/>",
        indent(dedupe_post_processor(), 1),
        "  <hashTree/>",
        indent(constant_timer(), 1),
        "  <hashTree/>",
        "</hashTree>",
        bundle_loop(),
    ]
    inner_xml = "\n".join(inner)
    parts.append(
        f"""<TransactionController guiclass="TransactionControllerGui" testclass="TransactionController" testname="TX01 Dashboard page load (HTML + all JS bundles)" enabled="true">
  <stringProp name="TestPlan.comments">Emits one extra sample row totalling the document plus every bundle it pulls, which is the number a user actually waits for.</stringProp>
  <boolProp name="TransactionController.includeTimers">false</boolProp>
  <boolProp name="TransactionController.parent">false</boolProp>
</TransactionController>
<hashTree>
{indent(inner_xml, 1)}
</hashTree>"""
    )

    for step in JOURNEY[1:]:
        block = [
            http_sampler(step["label"], step["path"], step["comment"]),
            "<hashTree>",
            indent(status_assertion(), 1),
            "  <hashTree/>",
            indent(response_assertion(step["assert_text"]), 1),
            "  <hashTree/>",
            indent(constant_timer(), 1),
            "  <hashTree/>",
            "</hashTree>",
        ]
        parts.append("\n".join(block))

    return "\n".join(parts)


def thread_group(scenario: dict) -> str:
    body = journey_tree()
    return f"""<ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="{attr(scenario['name'])}" enabled="true">
  <stringProp name="TestPlan.comments">{escape(scenario['comment'])}</stringProp>
  <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
  <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
    <boolProp name="LoopController.continue_forever">false</boolProp>
    <stringProp name="LoopController.loops">-1</stringProp>
  </elementProp>
  <stringProp name="ThreadGroup.num_threads">{scenario['threads']}</stringProp>
  <stringProp name="ThreadGroup.ramp_time">{scenario['ramp']}</stringProp>
  <boolProp name="ThreadGroup.scheduler">true</boolProp>
  <stringProp name="ThreadGroup.duration">{scenario['duration']}</stringProp>
  <stringProp name="ThreadGroup.delay">0</stringProp>
  <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
</ThreadGroup>
<hashTree>
{indent(body, 1)}
</hashTree>"""


def user_defined_variables() -> str:
    variables = [
        ("BASE_PROTOCOL", "${__P(ledgr.protocol,http)}"),
        ("BASE_HOST", "${__P(ledgr.host,localhost)}"),
        ("BASE_PORT", "${__P(ledgr.port,3100)}"),
        ("LEDGR_COOKIE", "${__P(ledgr.cookie,NO_SESSION_CAPTURED)}"),
    ]
    rows = "\n".join(
        f"""      <elementProp name="{name}" elementType="Argument">
        <stringProp name="Argument.name">{name}</stringProp>
        <stringProp name="Argument.value">{escape(value)}</stringProp>
        <stringProp name="Argument.metadata">=</stringProp>
      </elementProp>"""
        for name, value in variables
    )
    return f"""    <elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
      <collectionProp name="Arguments.arguments">
{rows}
      </collectionProp>
    </elementProp>"""


def build() -> str:
    header_manager = """<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager (browser headers + captured session)" enabled="true">
  <stringProp name="TestPlan.comments">The Cookie value is injected from assignment3/jmeter/session.properties, produced by `npm run capture:session`. Without it every protected route answers with a redirect to /sign-in and the test measures the login page.</stringProp>
  <collectionProp name="HeaderManager.headers">
    <elementProp name="" elementType="Header">
      <stringProp name="Header.name">Cookie</stringProp>
      <stringProp name="Header.value">${LEDGR_COOKIE}</stringProp>
    </elementProp>
    <elementProp name="" elementType="Header">
      <stringProp name="Header.name">User-Agent</stringProp>
      <stringProp name="Header.value">Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36</stringProp>
    </elementProp>
    <elementProp name="" elementType="Header">
      <stringProp name="Header.name">Accept</stringProp>
      <stringProp name="Header.value">text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8</stringProp>
    </elementProp>
    <elementProp name="" elementType="Header">
      <stringProp name="Header.name">Accept-Encoding</stringProp>
      <stringProp name="Header.value">gzip, deflate</stringProp>
    </elementProp>
    <elementProp name="" elementType="Header">
      <stringProp name="Header.name">Accept-Language</stringProp>
      <stringProp name="Header.value">en-CA,en;q=0.9</stringProp>
    </elementProp>
  </collectionProp>
</HeaderManager>
<hashTree/>"""

    defaults = """<ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="HTTP Request Defaults" enabled="true">
  <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
    <collectionProp name="Arguments.arguments"/>
  </elementProp>
  <stringProp name="HTTPSampler.domain">${BASE_HOST}</stringProp>
  <stringProp name="HTTPSampler.port">${BASE_PORT}</stringProp>
  <stringProp name="HTTPSampler.protocol">${BASE_PROTOCOL}</stringProp>
  <stringProp name="HTTPSampler.contentEncoding"></stringProp>
  <stringProp name="HTTPSampler.path"></stringProp>
  <stringProp name="HTTPSampler.concurrentPool">6</stringProp>
  <stringProp name="HTTPSampler.connect_timeout">10000</stringProp>
  <stringProp name="HTTPSampler.response_timeout">60000</stringProp>
</ConfigTestElement>
<hashTree/>"""

    scenarios_xml = "\n".join(thread_group(s) for s in SCENARIOS)

    plan_comment = (
        "Ledgr - Advanced Web Development Assignment 3. Two load scenarios over one identical "
        "user journey: a server-rendered page plus every JavaScript bundle it references, the two "
        "aggregation-heavy API endpoints, a paginated feed, and two more page renders. "
        "Thread groups run consecutively so the moderate scenario does not contend with the light one; "
        "split the resulting .jtl by thread-group name to report them separately."
    )

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Ledgr - Assignment 3 Load Test" enabled="true">
      <stringProp name="TestPlan.comments">{escape(plan_comment)}</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">true</boolProp>
{user_defined_variables()}
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    <hashTree>
{indent(defaults, 3)}
{indent(header_manager, 3)}
{indent(scenarios_xml, 3)}
    </hashTree>
  </hashTree>
</jmeterTestPlan>
"""


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build(), encoding="utf-8")
    print(f"Wrote {OUT}")
