# Feature 19 — Tracing (Langfuse)

**One-sentence version:** every agent run emits a span tree to Langfuse Cloud —
graph run → tool calls → LLM generations — with counterparty names
pseudonymised before anything leaves the process.

> Phase 5, sub-step 5-6. Decision **D-2 resolved: Langfuse Cloud**, not self-host.
> See [../plan/phase-5-eval-traces.md](../plan/phase-5-eval-traces.md).

---

## 1. Why Cloud, and why that reversed Phase 0

Phase 0 chose **self-host**, with the reasoning "self-host = no data leaves the
laptop." That premise stopped being true before this got built:

- merchant names already go to **OpenAI** for embeddings
- questions and tool results already go to **Groq** to compose answers

Transaction data egresses to two processors regardless. A trace store isn't a new
boundary — it's a third processor with a *different retention profile* (LLM APIs
hold transiently and don't train; a trace store persists, indexed and
searchable). That's a difference of degree, and degree is manageable with masking.

Against that, self-hosting Langfuse v3 means **Postgres + ClickHouse + Redis +
S3-compatible storage** — four stateful services, whose backups and upgrades we'd
own, for an app serving a handful of allowlisted friends. The ops burden would
dominate the value.

So: Cloud, free tier, with masking doing the work the hosting choice was
supposed to do.

**Volume, for the record.** LangSmith counts *traces* (~5k/month free); Langfuse
counts *observations*, ~8–12 per question (~50k/month free). Both land near 5,000
questions/month. With a 50/day per-user cap across a few friends, real usage is
100–500/month — a few percent of either.

---

## 2. Where the data lives

| Store | Location | Holds |
|---|---|---|
| Supabase | Tokyo | transactions + `agent_runs` — **source of truth**, unmasked |
| Langfuse Cloud | EU **or** US (chosen at project creation) | a **copy** of traced span inputs/outputs, masked |

Langfuse never reads the database. It receives what we send it, which is why
masking at the boundary is sufficient.

---

## 3. Masking — the part that must not be wrong

`transactions.main_detail` is the counterparty on a UPI transfer, which is very
often **a person's name**. From the live dashboard: `Chintada Sateesh`,
`Srinivasarao Silla`.

> The user agreed to use Paisa. **The people they paid did not.**

That asymmetry is the whole argument. Their names must not reach a third-party
store, and a mask that silently stops working is worse than none — you'd believe
you were covered.

### Pseudonymisation, not redaction

```
"SWIGGY"  →  "[redacted:3f8a1c]"
```

A salted SHA-256, truncated. The *same* merchant yields the *same* token
throughout a trace, so **"this counterparty appears six times"** survives while
the identity does not. A blanket `[redacted]` would destroy that structure for no
extra privacy.

Salt comes from `PAISA_TRACE_SALT`, falling back to `LANGFUSE_SECRET_KEY`
(already a secret in the environment). **With no salt at all we emit plain
`[redacted]` rather than an unsalted hash** — the merchant vocabulary is small
enough that unsalted hashes of "Swiggy" or a friend's name are reversible by
anyone who can guess the candidates, and a hash that *looks* protective while
being reversible is the worst of the three options.

### What's masked, and what deliberately isn't

| Sent | Masked |
|---|---|
| dates, amounts, categories, platforms | `main_detail`, `narration`, `merchant`, `counterparty` |
| row counts, `meta`, truncation flags | `upi_ref` (correlatable to a bank statement) |
| tool arguments — the resolved date window | `email`, `pattern` (a `custom_tags` pattern IS a merchant name) |
| per-node timings, intent, tool plan | |
| **the user's own question** — see below | |

The question is sent unmasked, deliberately: it's the person's own text, and
stripping it makes traces nearly useless for debugging. If a question contains a
third party's name, that's a conscious trade, not an oversight.

### Free text — the second mechanism ✅ (closed 2026-09-20)

The key-based mask above cannot cover a **string** that happens to contain a name.
That limit is permanent: a key either is or isn't sensitive, but prose has no keys.

This used to be an open bug with a workaround (the compose prompt was omitted from
traces entirely). It's now closed — with **two** fixes, because on closer reading it
was two different problems that had been filed as one.

#### Problem 1: the prompt — fixed structurally, and cheaply

`compose_answer_llm` renders tool results into a flat string for the model, so
sending that string would have leaked names through the one channel the mask can't
inspect.

The plan called for "pass tool results as structured JSON". On reading the code, the
results were **already structured** right up to the `json.dumps` inside
`_build_compose_user_msg`. So nothing about the prompt needed rewriting:

```python
# The dict, not the rendered string. Masked on export, for free.
input={"query": user_query, "tool_results": trimmed}
```

**The model still receives exactly the same string it always did** — what changed is
what the *trace* is told. The compose span now shows the rows the model saw, which
was the main reason to trace an LLM call at all.

#### Problem 2: the answer — no structural fix exists

The original bug report missed this half. The **model writes** counterparty names
into prose: *"you spent ₹2,340 with Chintada Sateesh this month."* There is no key to
match on and there never will be, because the model generated the string.

So `redact_known_values` does three things, and the third is the important one:

| Step | What | Catches |
|---|---|---|
| **Substitute** | replace exact known strings with their pseudonym tokens | the name as it was given |
| **Verify** | check no distinctive fragment of those names survives | the model shortening it to "Chintada", or "CHINTADA S." |
| **Omit** | if anything survived, send **nothing** | everything else |

Failing closed is what makes this defensible. It converts *"probably clean"* into
**"clean, or absent"** — a guarantee that can be written in a doc and be literally
true. A scrubber that *mostly* works is exactly the false confidence to avoid.

**This is not free-text scrubbing, and the distinction matters.** Regex/NER over
prose was rejected and stays rejected: it over-matches (mangling "Bills", "Travel")
and under-matches (missing an unusual name). What ships is exact-string substitution
over a **closed set we supplied ourselves** — `collect_sensitive_values(tool_results)`
returns precisely the counterparty strings our own tools put into the prompt, so
there is no guessing anywhere in it.

#### Three details that are easy to get wrong

**Substitute full strings, verify on tokens.** Substituting token-by-token would
over-mask: a merchant called `S S R Stores` would turn every occurrence of "stores"
in an answer into a hash. Verifying token-by-token is the safe direction, because a
false alarm costs one omitted trace output and nothing else.

**The residue is never reported.** Saying *which* fragment tripped verification would
put the name we just refused to send into the trace metadata — helpful-looking
diagnostics that undo the whole feature. Only the **count** escapes
(`redaction_metadata`). To find out which name it was, reproduce locally, where the
real data is already in front of you.

**Verification strips our own markers first.** A digest is `[0-9a-f]`, so a genuine
name fragment like `beefed` or `facade` can occur *inside* a pseudonym token. Without
stripping, that collision looks like a surviving name and the output is silently
omitted — a bug that only appears for unlucky salts. Pinned by
`test_a_hex_digest_is_not_mistaken_for_residue`, which forces the collision
deterministically.

**Amounts are deliberately kept.** A name is a person; ₹120 identifies nobody once
the name beside it is gone. And amounts are precisely what you'd open a trace to
check — the production bug that motivated all of this was a wrong *number*.

**Both channels are covered.** The same answer text reaches the trace twice: as the
compose generation's output, and as `paisa.run`'s `output.response`. Redacting one and
forgetting the other would have made the exercise pointless — `runner.run_and_log`
does the second.

> ⚠️ Still read the key-based mask as a limit: **only structured data is masked by
> key.** Pinned by `TestFreeTextIsNotMaskedByKey`. Anything sent as a bare string
> needs `redact_known_values` explicitly — it is not automatic.

### ⚠️ A masking function only protects the exporter it was passed to

Found while doing the above, and it's the more transferable lesson. `paisa/tracing.py`'s
mask is a callback handed to the **Langfuse SDK**. It has no bearing on any other
exporter — and there was another one.

`langsmith` arrives as a transitive dependency (`langgraph` → `langchain-core`), and
LangChain auto-instruments whenever `LANGSMITH_TRACING` or `LANGCHAIN_TRACING_V2` is
truthy. With those set shell-wide from an unrelated project, every run was posting
~124 KB of graph state — including `tool_results` with real counterparty names —
completely unmasked. No Paisa code enabled it, and none could have disabled it.

`paisa/config.py` now forces both off at import unless `PAISA_LANGSMITH=on`, and
`tests/conftest.py` repeats it before any import. Full write-up: §5c in
[../plan/phase-5-eval-traces.md](../plan/phase-5-eval-traces.md) and
[../issues-faced.md](../issues-faced.md).

**The audit question is "what egress exists?", enumerated — not "is our masking
correct?"**

---

## 4. The span tree

```
paisa.run                          ← agent_run_id, user_id, latency, intent
├── llm.classify_intent            ← generation: prompt + raw output
├── llm.plan                       ← generation: the tool plan it chose
├── tool.query_transactions        ← input = resolved ARGS, output = row COUNT
├── tool.detect_anomalies
└── llm.compose_answer             ← generation (prompt omitted, see §3)
```

Instrumented at three central points, not sprinkled:

| Where | What it buys |
|---|---|
| `runner.run_and_log` | the run span + correlation to `agent_runs.id` |
| `nodes.tool_call` — the **single** dispatch site | one span per tool; a tool added later is traced for free |
| `llm._call_json` + `compose_answer_llm` | generations, which is what Langfuse prices |

**The payoff on your actual bug.** `tool.query_transactions` records its resolved
arguments, so the "No transactions found between 2026-08-18 and 2026-09-17" answer
would show, at a glance: the window it chose, `row_count: 0`, and that the data
spans June–September. That's the diagnosis, visible without a debugger.

---

## 5. It cannot break a request

Observability that can break the thing it observes is a liability. So:

- **Off unless both keys are present.** A fresh clone and the test suite are
  unaffected by default.
- **Every wrapper is a no-op when disabled**, and returns `None` rather than a
  mock, so nothing downstream depends on a span existing.
- **Every wrapper swallows its own exceptions.** A dead Langfuse, an expired key,
  a network blip — the question is still answered. Tested with a client that
  raises on every call.
- **Application exceptions still propagate.** Tracing must not swallow the
  errors the agent's own handling depends on.
- **A missing SDK degrades to disabled**, warns once, and is cached — so we don't
  retry the import per question.

`tests/conftest.py` forces `PAISA_TRACING=off` with a plain assignment, not
`setdefault`: once real keys live in `.env`, an unguarded suite would ship
fixture transaction data to a third party on every run.

---

## 6. Nothing imports the SDK except one file

`paisa/tracing.py` is the only module that touches `langfuse`. We're on v3 and v4
already exists with a different surface; had node code called
`start_as_current_span` in a dozen places, an upgrade would be a dozen-file
migration. It's one file — and the pure masking logic is testable with the SDK
absent entirely.

Pinned `langfuse>=3.15,<4` for that reason.

---

## 7. Setup

1. Create a project at **cloud.langfuse.com** (EU) or **us.cloud.langfuse.com** (US)
2. Copy the keys into `.env` (and Render's environment for production):

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com
PAISA_ENV=dev            # tags traces so local noise is separable
```

3. Ask Paisa a question. A trace appears within a few seconds.

```bash
# Verify the wiring end to end — the eval flushes on exit
.venv/bin/python -m paisa.eval --case anomalies_are_found
```

`PAISA_TRACING=off` silences it without removing the keys.

**Flushing matters.** The SDK batches in a background thread, so a short-lived
process — the CLI, the eval runner — exits before anything is sent unless it
flushes. `run_and_log` flushes on the way out.

---

## 8. Cost accounting (sub-step 5-4)

Tracing without token counts shows you latency but not spend — and spend is the
number that matters, because the admin Settings page lets you change *"50
questions per person per day"* with no idea whether 50 questions costs ₹1 or ₹100.
A dial with no gauge.

### Where the numbers come from

Every provider returns token counts on the same response as the text:

```python
resp.choices[0].message.content   # the answer
resp.usage                        # prompt_tokens, completion_tokens, total_tokens
```

We used to drop `resp.usage` on the floor. Now the four non-streaming provider
methods record it as they return.

### The design decision, and the one I got wrong first

One question makes **several** LLM calls — classify intent, plan, maybe generate
SQL, then compose. The counts appear deep in `llm.py`; the place that needs the
*total* is `runner.py` at the end of the run. So the number has to travel.

My first instinct was to widen the provider methods to return `(text, usage)`.
Checking the callers killed it: **two of the five LLM entry points are called from
inside tools** (`text_to_sql`, `classify_transaction`), and a tool must return a
`ToolResult` — `{ok, data, error, meta}`. Carrying token counts out would mean
smuggling accounting data through `meta` and having `nodes.tool_call` fish it back
out. That's ~15 touch points and a bent contract, for a side observation.

So instead: a **request-scoped accumulator** in `paisa/usage.py`. Which turns out
to be a pattern already in this codebase one layer down —

```sql
SET LOCAL paisa.user_id = 42        -- Postgres: scoped to one transaction
```
```python
usage.reset()                      -- Python: scoped to one request
```

`get_authed_connection` doesn't thread `user_id` into every statement; it sets it
once and the RLS policies read it from ambient context. A `ContextVar` is that
idea for a request, with the same isolation property: two concurrent questions get
their own totals automatically, exactly as two transactions get their own
`paisa.user_id`.

The lifecycle is kept deliberately narrow so the number's origin stays obvious:

| | |
|---|---|
| **writes** to the counter | `paisa/agent/llm.py` only |
| **resets and reads** it | `paisa/runner.py` only |

### Per-span vs per-run

A Langfuse *generation* should report only its own call's tokens, but the
accumulator holds the run total. `usage.delta(before)` subtracts a snapshot taken
before the call. A test pins the invariant that makes both figures trustworthy:
**the per-span deltas must sum back to the run total** written to `agent_runs`. If
they ever disagree, the cost numbers are lying.

Usage is reported even when a response **fails validation** — it was still
generated and still cost money. Dropping it there would make the total understate
the bill precisely when something is going wrong.

### Two destinations

**Langfuse**, via `usage_details` on each generation. Langfuse holds provider
price tables and converts counts to currency, so no prices are hardcoded here.

**`agent_runs`**, via [migration 014](../../paisa/db/migrations/014_agent_run_tokens.sql) —
`prompt_tokens`, `completion_tokens`, `total_tokens`, `llm_calls`. Same reasoning
as the rest of the tracing work: the vendor stays optional, so cost must be
answerable in SQL against our own data.

```sql
select date_trunc('day', ts) as day,
       count(*) as questions, sum(total_tokens) as tokens
from agent_runs where ts > now() - interval '30 days'
group by 1 order by 1 desc;
```

That's also the groundwork for turning the per-user cap from a **count** of
questions into a **budget** of tokens — which is what actually tracks the bill.

**Columns are NULLABLE with no default and no backfill**, all three deliberate.
`NULL` means "not measured": historical rows predating the migration, and runs with
`PAISA_LLM=off` where no call happened. `DEFAULT 0` would invent a zero-cost past
and make any average over the column silently wrong — "didn't call the model" and
"called it for free" are different facts.

`llm_calls` is stored separately from the token total because the two move for
different reasons: a jump in calls means the agent started looping or re-planning
(a behaviour regression), while a jump in tokens alone usually just means bigger
results reached compose.

---

## 9. The streaming path — a bug worth reading about

When 5-4 shipped it wired `run_and_log` and **missed `stream_query_and_log`**.
Since `usage.record()` is a deliberate no-op until the counter is started, the
result was:

| Path | Used by | Tokens recorded |
|---|---|---|
| `run_and_log` | CLI, `python -m paisa.eval` | ✅ correctly |
| `stream_query_and_log` | **the UI** (SSE) | ❌ none at all |

So the metric worked perfectly everywhere it was tested and reported nothing
where it was actually used. That's a worse failure than no metric: you'd read
`NULL` cost for real traffic and conclude the feature wasn't shipped, or read the
eval's numbers and conclude real usage was cheap.

Two things had to change: `usage.reset()` / `snapshot()` in the streaming entry
point, and `_finalise_run` — which UPDATEs a row inserted up front, rather than
INSERTing — needed the token columns too. Wiring only the INSERT is what left the
UPDATE path silently NULL.

**The fix that matters is the third one.** Nothing in the code forced the two
entry points to agree, so
[`tests/test_paisa_usage_entrypoints.py`](../../tests/test_paisa_usage_entrypoints.py)
now does: an AST check that every public function in `runner.py` which runs the
graph calls `usage.reset()` and `usage.snapshot()`, and that both row-writers
persist all four columns. It's an AST test rather than a behavioural one because
the thing it guards is an *absence* — no exception to catch, no wrong value to
assert on, just a missing call. It also asserts its own entry-point list is
complete, so a third path can't be added without either being covered or failing
the test.

> A note on `compose_answer_llm_stream`: it turned out to be **dead code**. Only
> its own tests and a stale docstring reference it — the graph calls the
> non-streaming `compose_answer_llm`, because SSE streams one event per graph
> *node*, not per LLM token. The token-level streaming sub-step it was written for
> never landed. So no `stream_options={"include_usage": True}` was needed after
> all; the earlier note claiming otherwise was wrong.

---

## 10. What's still missing
- **Free-text masking** — the open bug in
  [../plan/phase-5-eval-traces.md](../plan/phase-5-eval-traces.md) §5b.
- **Scores.** Langfuse can attach quality scores to traces; feeding golden-set
  results in would join this to [18-eval.md](18-eval.md).

---

## 11. Tests

**66 tracing + 29 usage = 95 tests, no SDK, no network, no DB.**

| File | Covers |
|---|---|
| `test_paisa_tracing.py` | masking at depth, pseudonymisation, enablement, fail-safety, instrumented dispatch, the key-matching limit, **free-text redaction** (substitute / verify / omit, digest collisions, residue never reported, fail-closed) |
| `test_paisa_usage.py` | summing across calls, per-request isolation, provider field-name variants, defensive parsing, delta ↔ total invariant |

Three of the redaction tests earn their place specifically because they pin
*failures that look like successes*:

- `test_generic_words_do_not_cause_false_omission` — without the stoplist, nearly
  every merchant name contributes a common word, so essentially every answer would
  be silently omitted and the traces would just look empty.
- `test_a_hex_digest_is_not_mistaken_for_residue` — forces the collision
  deterministically by making the substitution token contain the fragment being
  searched for. Verified to fail when the marker-stripping is removed.
- `test_fails_closed_when_something_goes_wrong` — a redactor that errors *open* is
  worse than no redactor, because the docs would still promise it works.

The summing tests earn their place for the same reason: getting accumulation wrong
doesn't crash anything, it produces a smaller, entirely believable number — the worst
kind of wrong for a figure you're about to set spending limits from.
