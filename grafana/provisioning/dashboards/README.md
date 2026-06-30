# NestJS AI Playground — Observability Dashboard

Dashboard file: `provisioning/dashboards/ai-playground-dashboard.json`
Access: `http://localhost:3000` → Dashboards → **NestJS AI Playground Observability**
Credentials: `admin / admin` (default)

---

## Template variables (top-of-page filters)

These filters narrow every panel simultaneously. Use them to scope your investigation before reading any numbers.

| Variable | Type | How to use |
|---|---|---|
| **Agent Name** | Multi-select | Filter to one agent when you have multiple agents running |
| **Model** | Multi-select | Isolate a specific model (useful after a model version bump) |
| **Status** | Single-select | Set to `failed` / `loop_terminated` / `max_turns_exceeded` to investigate a failure mode — affects the Run Status Distribution chart |
| **Run ID** | Text box | Paste a specific run ID to activate the **Run Drilldown** row (collapsed at the bottom) |
| **Tool Name Filter** | Text box | Scopes the Tool Execution Logs panel to one tool, e.g. `weather` |
| **HTTP Status Filter** | Text box | Scopes the API Retry Logs to one HTTP status, e.g. `429` |
| **Tool Error Filter** | Text box | Scopes Tool Execution Logs to a specific error class: `timeout \| validation \| network \| execution` |
| **Stop Reason Filter** | Text box | Scopes latency panels to runs that ended for a specific reason: `end_turn \| max_tokens` |

> **Drill-down pattern**: click a coloured cell or bar in any panel — it sets the relevant variable and re-filters the page. Clicking "Agent Name" in the performance table filters the whole dashboard to that agent.

---

## Section 1 — 🔴 SLO Health

Five stat cards at the top. These are your first stop: one glance tells you whether the system is healthy right now.

### Agent Success Rate
**What it shows**: percentage of `run_complete` events where `status=success` over the selected time range.

| Colour | Value | Meaning |
|---|---|---|
| 🟢 Green | ≥ 95 % | Healthy — within SLO |
| 🟠 Orange | 80–95 % | Degraded — investigate errors |
| 🔴 Red | < 80 % | SLO breach — act immediately |

**Action**: if red or orange, open the **Error Count** card, click its Explore link, and read the `level=ERROR` log lines. Then check **Tool Failure Types** (section 5) to see if a specific tool is the culprit.

### Total Runs
**What it shows**: count of `run_start` events — how many agent runs fired in the window.

**Action**: if zero (and you expect traffic), the agent is down or not receiving requests. Check the application logs in **Live Application Logs** (section 8). An alert is configured: *"No Runs Detected"* fires if no `run_start` in 10 minutes.

### Error Count
**What it shows**: count of `level=ERROR` log lines from any agent in the window.

**Action**: any value > 0 during low traffic warrants investigation. Click the card to filter the Log Console Stream to error lines. Cross-reference with **API Retry Logs** (section 7) — errors often follow retry exhaustion.

### Loop Warnings
**What it shows**: count of `loop_warning` events — the sliding-window loop detector flagged the agent was repeating the same tool call with similar arguments.

**Reading**: occasional loop warnings during exploratory tasks are normal. A sustained rate (> 2 in 5 minutes) means the agent is stuck. An alert fires at this threshold.

**Action**: open **Run Drilldown** for the affected run — the event timeline shows exactly which tool was repeated and at which turn. Likely cause: tool returns ambiguous results, system prompt doesn't tell the agent what to do if a tool fails, or the task is genuinely unsolvable with the current tool set.

### Max Turns Exceeded
**What it shows**: count of runs that hit the turn limit and terminated with `status=max_turns_exceeded`.

**Action**: a non-zero value means some tasks are too complex for the configured turn limit, OR the agent is inefficient. Compare against **Avg Turns / Run** (section 9) — if average is close to the limit, consider raising `maxTurns`. If average is low but some runs hit the limit, you have a bimodal distribution: inspect outliers via Run Drilldown.

---

## Section 2 — 📊 Agent Performance Summary

A single wide table showing aggregated metrics per `agentName × model` pair over the selected window. This is your baseline reference — you return here after adjusting prompts or swapping models.

| Column | What it means |
|---|---|
| Total Runs | How active this agent/model pair has been |
| Avg Latency (ms) | Mean wall-clock time from `run_start` to `run_complete` including all LLM turns and tool calls |
| p50 (ms) | Median run duration — half of runs finish faster than this |
| p95 (ms) | 95th-percentile run duration — 1 in 20 runs is slower than this |
| Avg Input Tokens | Average tokens sent to the LLM per run (system prompt + conversation history) |
| Avg Output Tokens | Average tokens generated per run |
| Avg Turns | Average number of ReAct iterations per run |
| Error Count | Runs that ended in a non-success status |
| Summarizations | How often the context window hit the summarization threshold |

**Reading the table**:
- High **Avg Input Tokens** relative to output = context bloat (long history, big system prompt). Consider context pruning.
- High **Avg Turns** with high **Avg Latency** = the agent is doing genuine multi-step work (expected) OR it's inefficient (check Loop Warnings).
- High **Summarizations** = runs regularly exhaust the context window. Consider raising the summarization threshold or shortening conversation history.
- **Agent Name** and **Model** cells are clickable: clicking sets the dashboard filter to that agent or model.

---

## Section 3 — 📈 Reliability Over Time

Three time-series charts showing how reliability metrics trend across the selected window. These reveal whether problems are isolated incidents or sustained degradation.

### Error Rate Over Time
**Reading**: a spike = isolated incident (API blip, bad input). A rising baseline = progressive regression (model change, prompt change, traffic pattern shift). Flat near zero = healthy.

**Action on spike**: correlate with **API Retry Rate** (section 7) — if both spike together, the LLM vendor had an outage. If errors spike but retries don't, the errors are application-level (tool failures, guardrail rejections).

### Run Status Distribution Over Time
**Reading**: stacked bars. A healthy system shows a tall `success` bar with thin or absent bars for `failed / loop_terminated / max_turns_exceeded`. Any growth in the non-success colours indicates a regression. The **Status** variable filters this chart — set it to `loop_terminated` to isolate loop failures.

**Action**: if `max_turns_exceeded` grows over time, the tasks are getting more complex (expected after adding features) or the agent is becoming less efficient (unexpected — check token/turn trends in section 9).

### Loop Warning Rate
**Reading**: this should be flat near zero. Any sustained non-zero rate means the loop detector is regularly triggering. Orange-coloured line signals the 2-per-5-minute alert threshold is being approached.

---

## Section 4 — ⚡ Latency & Throughput

Latency metrics from multiple angles. Use this section to answer: *"Is the agent getting slower?"*

### p50 / p95 / p99 Latency (stat cards)
Instant aggregates for the selected window. Thresholds:

| Metric | OK | Warning | Critical |
|---|---|---|---|
| p50 | < 2 s | 2–5 s | > 5 s |
| p95 | < 4 s | 4–10 s | > 10 s |
| p99 | < 8 s | 8–15 s | > 15 s |

An alert fires when p95 exceeds 15 s sustained for 2 minutes.

### Avg Turns / Run (stat card)
**Reading**: 1–3 turns is typical for simple queries. 4–7 turns for multi-step tasks. Consistently > 8 turns suggests the agent isn't converging efficiently.

### LLM Calls / Interval (time series)
**Reading**: shows how many LLM turns are firing per time bucket. High volume = busy system. A flat line during expected traffic = the agent isn't running (check Total Runs). Spikes correlate with bursty usage.

### Agent Run Latency History (Avg)
**Reading**: the longitudinal latency chart. A gradual upward slope = efficiency regression over time (more tokens, more turns, or slower LLM responses). Use the time range picker to zoom out to 7 days for trend visibility.

### LLM Turn Latency (Per-Turn Avg)
**Reading**: latency of each individual LLM API call, not the full run. If this rises without total run latency rising, you're making fewer but slower API calls. If both rise together, the LLM vendor is slower.

### Turn Activity (Turn Start Rate)
**Reading**: how many agent turns start per interval. Useful for capacity planning. Spikes indicate bursty workloads that could hit rate limits.

---

## Section 5 — 🔧 Tool Observability

Four panels covering tool call patterns. Tools are the most common failure point in agent systems — a single flaky tool cascades into agent errors, loop warnings, and task failures.

### Tool Call Volume (by tool) — bar gauge
**Reading**: horizontal bars ranked by call count. The most-called tool is probably the most critical path.

**Action**: click a bar to filter the **Tool Execution Logs** below to that tool only.

### Tool Success Rate (by tool) — table
Shows raw counts of successes and failures per tool. A tool with a non-zero failure count needs investigation.

**Reading signals**:
- All failures for one tool = that tool's external dependency (API, DB) is down or misconfigured.
- Failures spread across tools = the error is upstream (token limit, guardrail rejection, serialization bug).

**Action**: click the tool name (if linked) or set `Tool Name Filter` to the tool in question. Then read **Tool Execution Logs** to see the specific error messages.

### Tool Failure Types — bar gauge
Classifies failures into four categories:

| Error Type | Meaning | Likely cause |
|---|---|---|
| `validation` | Tool input failed schema validation | LLM passed wrong argument type or missing required field |
| `timeout` | Tool execution exceeded time limit | Slow external API or network issue |
| `network` | HTTP/network error during tool call | External service unreachable |
| `execution` | Tool threw during execution | Bug in tool implementation |

**Action**: `validation` errors point to a prompt/schema mismatch — review the tool's `description` and `schema` to ensure the LLM understands what arguments to pass. `timeout` errors trigger the tool-timeout alert at 3 occurrences in 5 minutes.

Click a bar to filter Tool Execution Logs to that error type.

### Tool Avg Latency (ms) — bar gauge
Ranks tools by average execution time. A tool significantly slower than others is a latency bottleneck. If its p95 (visible in the logs) is much higher than its average, it has intermittent slowness.

### Tool Execution Logs — log panel
Streams `tool_call` and `tool_result` events interleaved in time order. Each pair shows:
- `tool_call` — which tool was called, with which arguments, on which turn
- `tool_result` — whether it succeeded, how long it took, the error type if it failed

**How to use**: set `Tool Name Filter` and `Tool Error Filter` to narrow to the exact failure you're investigating. Enable **Log Details** (click any log line) to see the full JSON including `runId` — copy it into the **Run ID** variable to activate the drilldown.

---

## Section 6 — 🪙 Token & Context Observability

Token consumption tells you about cost and context pressure. Unexpected token growth is the first signal of a prompt regression or context leak.

### Total Token Consumption (Input + Output) per Agent × Model — bar gauge
Total tokens burned in the selected window. Use this for cost estimation and capacity comparison between agents or models.

**Reading**: if one agent × model bar grows significantly between sessions without a corresponding growth in run count, that agent is consuming more tokens per run. Investigate in the **Avg Tokens / Run** trend (section 9).

### Input vs Output Token Ratio Over Time — time series
Stacked bars per agent. **Input tokens dominate** in multi-turn conversations with long history (expected). **Output tokens growing faster than input** suggests the model is generating longer responses — check if that's intentional (richer answers) or a regression (verbose, repetitive output).

### Context Summarizations — time series
Counts `conversation_summarized` events. Summarization is the agent compressing its own history when it approaches the context limit.

**Reading**: occasional summarizations are fine. A high rate (> 1 per run on average) means conversations are regularly pushing context limits. Options: shorten system prompt, prune tool result verbosity, reduce `max_tokens` for tool responses, or raise the summarization threshold.

### Stop Reason Distribution — bar gauge
Shows what caused each LLM turn to end (from `llm_response` events):

| Stop Reason | Meaning |
|---|---|
| `end_turn` | Model decided it was done — normal |
| `tool_use` | Model called a tool — normal in multi-step runs |
| `max_tokens` | Hit the token limit mid-response — truncation risk |
| `stop_sequence` | Custom stop sequence triggered |

**Action on `max_tokens`**: the model was cut off. Raise `max_tokens` in the agent config, or reduce input context to leave more room for output.

### Avg Thought Turns / Run — stat card
Average number of turns where the model produced reasoning/thought blocks (extended thinking). Higher = more complex reasoning. A sudden jump may indicate the model is struggling with the task complexity.

---

## Section 7 — 🔄 Retry & Reliability

Covers vendor API retries. The agent retries failed LLM API calls with exponential backoff + jitter.

### API Retry Rate Over Time — time series
Lines per HTTP status code. The most common retry triggers:

| HTTP Status | Meaning | Expected? |
|---|---|---|
| `429` | Rate limited by LLM vendor | Yes, under burst traffic — but should be rare |
| `500` / `503` | Vendor server error | Occasional — vendor outages |
| `408` / `504` | Timeout | Possible under high load |

**Reading**: an isolated spike = a brief vendor hiccup (self-resolving). A sustained high rate = rate limit misconfiguration or vendor degradation. Check the vendor's status page.

### Retries by HTTP Status — bar gauge
Total retry counts per status code in the window. Use this for SLA reporting: `429` count tells you how many times you hit vendor rate limits.

**Action**: click a bar to filter the **API Retry Logs** below to that status code.

### Retry Exhaustions — stat card
Count of `api_retry_exhausted` events — all retry attempts failed, the run errored.

**Reading**: any value > 0 is a production incident. The agent could not complete the task because the vendor API was persistently unavailable. An alert fires immediately on any exhaustion event.

**Action**: check the vendor's status page. If the vendor is healthy, check your API key and rate limit tier.

### API Retry Logs — log panel
Streams `api_retry` and `api_retry_exhausted` events. Each line shows attempt number, HTTP status, delay before retry, and the `runId`. Use `HTTP Status Filter` to isolate a specific status code.

---

## Section 8 — 📋 Live Application Logs

A full real-time log stream with formatted output.

### Log Console Stream
**Format**: `[traceId] [agentName] [context] event=... run=... model=... status=... latency=... in=... out=... tool=...`

Fields shown inline:
- `run=<uuid>` — copy this into the **Run ID** variable to drill into a specific run
- `event=run_complete status=success latency=4321ms` — completed run summary
- `event=tool_call tool=weather` / `event=tool_result` — tool execution pair
- `event=loop_warning` — agent loop detected
- `in=123 out=456` — token usage for that turn

**How to use**: this is the raw firehose. Use the `Agent Name` variable to filter to one agent. For deep investigation, copy a `run=<uuid>` value from a suspicious log line and paste it into the **Run ID** text box, then scroll to the **Run Drilldown** row.

---

## Section 9 — 📉 Regression Detection

These panels answer the question: *"Is the agent getting worse over time?"* They show trends of per-run efficiency metrics, not just current snapshots. Check these after any model upgrade, prompt change, or tool modification.

### Avg Turns / Run (Trend) — time series
**What to look for**: a flat or slowly rising line = expected as tasks grow more complex. A sudden step-up after a deployment = efficiency regression — the new prompt or model requires more reasoning iterations.

**Action**: if turns rise after a model change, A/B test by setting the **Model** variable to compare the old and new model's turn counts in the **Agent Performance Summary** table.

### Avg Tokens / Run (Trend) — time series (input + output lines)
**What to look for**: both lines should be stable between deployments.
- Input rising = context bloat (history growing, prompt getting longer, tool results getting more verbose)
- Output rising = model over-generating (check Stop Reason Distribution for `end_turn` vs `max_tokens`)
- Both rising together = the agent is handling more complex tasks (benign) OR regressing (check turn count)

### Goal Abandonment Rate (Trend) — bar chart
Stacked bars of `loop_terminated` and `max_turns_exceeded` runs over time. **Any bars here represent tasks the agent failed to complete.**

**What to look for**: zero bars = healthy. Bars appearing after a deployment = the new prompt or model can no longer finish tasks that it could before. This is the clearest regression signal in the dashboard.

### p95 Latency — This Period vs Last Week — time series
Two lines: solid (current) and dashed (7 days ago). Same time-of-day pattern — useful for removing traffic-volume effects.

**Reading**: current line above dashed = latency regression. Current below = improvement. Lines tracking closely = stable. Large gaps at specific times of day = time-of-day traffic pattern shift.

**Note**: requires at least 7 days of Loki data to show the previous-period line. Retention is set to 30 days in `loki-config.yaml`.

### Successful Runs — This Period vs Last Week — time series
Same pattern: current (solid) vs last week (dashed). A drop in the current line signals a reliability regression.

**Reading**: if successful runs drop while total runs stay flat (check **Total Runs** stat card) → more runs are failing. If both drop → traffic decreased (not a regression).

---

## Section 10 — 🔍 Run Drilldown (collapsed by default)

Activate by expanding the row header. **Requires a Run ID** — paste one from the Log Console Stream into the **Run ID** variable at the top.

### Run Event Timeline
Ordered log stream of every event for the selected run, from `run_start` to `run_complete`. Events:

```
[run_start]    turn=0  — agent initialised
[turn_start]   turn=1  — turn began
[llm_response] turn=1  stopReason=tool_use — LLM called a tool
[tool_call]    tool=weather
[tool_result]  tool=weather latency=312ms — tool returned
[turn_start]   turn=2  — second iteration
[llm_response] turn=2  stopReason=end_turn — LLM finished
[run_complete] status=success totalLatency=4821ms
```

**Use this to**: trace exactly why a run failed, which tool was called in which order, where time was spent, and whether a loop warning was justified.

### Single Run Stats
Five stat cards showing the final metrics for the selected run: total latency, total turns, input tokens, output tokens, thought turns. Units: latency in ms, tokens and turns as counts.

**Compare to**: the **Agent Performance Summary** averages (section 2) to see if this specific run was an outlier.

---

## Alert rules

Configured in `provisioning/alerting/alert-rules.yaml`. All alerts fire into Grafana Alerting.

| Alert | Threshold | Severity | What it means |
|---|---|---|---|
| Agent High Error Rate | > 5 ERROR logs in 5 min | Critical | Sustained error storm — likely a tool failure or model outage |
| Agent High p95 Latency | p95 > 15 s for 2 min | Warning | Latency SLO breach — check LLM vendor status and tool latency |
| Agent No Runs Detected | 0 `run_start` in 10 min | Warning | Agent is down or not receiving requests |
| Agent Loop Warning Spike | > 2 loop warnings in 5 min | Warning | Agent stuck in a cycle — review system prompt and tool descriptions |
| Agent Tool Timeout Spike | > 3 tool timeouts in 5 min | Warning | External dependency (API, DB) is slow or unreachable |
| Agent Max Turns Exceeded Rate | > 2 max_turns in 10 min | Warning | Tasks too complex for configured turn limit, or agent regressing |
| Agent API Retry Exhausted | Any `api_retry_exhausted` event | Critical | LLM vendor API completely unavailable — all retries failed |

---

## LogQL quick reference (Explore tab)

```logql
# All logs for this service
{service_name="nestjs-ai-playground"}

# All events for one run
{service_name="nestjs-ai-playground"} | json | runId="<paste-run-id>"

# Failed runs only
{service_name="nestjs-ai-playground"} | json | event="run_complete" | status!="success"

# Tool failures for a specific tool
{service_name="nestjs-ai-playground"} | json | event="tool_result" | success="false" | toolName="weather"

# Rate-limited API calls
{service_name="nestjs-ai-playground"} | json | event="api_retry" | httpStatus="429"

# Runs that exceeded turn limit
{service_name="nestjs-ai-playground"} | json | event="run_complete" | status="max_turns_exceeded"

# Context summarizations (context window pressure)
{service_name="nestjs-ai-playground"} | json | event="conversation_summarized"

# p95 latency for the last hour
quantile_over_time(0.95, {service_name="nestjs-ai-playground"} | json | event="run_complete" | unwrap totalLatencyMs [1h])
```

---

## Event reference

All structured log events emitted by the agent. Every event includes `runId`, `agentName`, and `traceId`.

| Event | When | Key fields |
|---|---|---|
| `run_start` | Agent run begins | `model`, `toolCount`, `messageCount` |
| `turn_start` | Each ReAct iteration starts | `turn` |
| `llm_response` | LLM API call completes | `stopReason`, `latencyMs`, `inputTokens`, `outputTokens` |
| `tool_call` | Before a tool executes | `toolName`, `toolVersion`, `turn` |
| `tool_result` | After a tool executes | `toolName`, `toolVersion`, `latencyMs`, `success`, `errorType` |
| `tool_deprecated_called` | A deprecated tool was called | `toolName`, `toolVersion`, `deprecationMessage` |
| `loop_warning` | Loop detector triggered | `turn`, `offendingTool` |
| `conversation_summarized` | Context window compressed | — |
| `run_complete` | Run finished (any outcome) | `status`, `totalTurns`, `totalLatencyMs`, `totalInputTokens`, `totalOutputTokens`, `totalThoughtTurns` |
| `api_retry` | LLM API call retried | `httpStatus`, attempt metadata |
| `api_retry_exhausted` | All retries failed | `httpStatus` |

`run_complete` status values: `success` · `failed` · `timeout` · `max_turns_exceeded` · `loop_terminated`
