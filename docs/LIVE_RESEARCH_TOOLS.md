# Switchpath MVP — Live Public Research and Evidence Extraction

## Purpose

Step 6 replaces the simulated executor with a live backend research pipeline while preserving the Step 5 pause and revision boundaries.

```text
Research objective
  → hosted web discovery
  → candidate public URLs (not yet facts)
  → safe backend extraction
  → exact evidence excerpts
  → labelled claims linked to evidence
```

Discovery and evidence are deliberately separate. A search citation is a source candidate. It becomes usable evidence only after the backend independently validates and extracts that public page.

## Implemented Tools

### Public Web Discovery

`OpenAIWebDiscovery` uses the Responses API web-search tool. It preserves URL citations and the web-search call's source list, removes duplicates and classifies each candidate as a pending source.

The adapter follows the official OpenAI documentation for [using web search in a Response](https://platform.openai.com/docs/quickstart/make-your-first-api-request) and the API's [URL citation and web-search source objects](https://platform.openai.com/docs/api-reference/responses-streaming/response/refusal/delta).

Search output is not accepted as a verified fact because Switchpath does not yet possess an exact excerpt from the underlying page.

### Safe Public Page Extraction

`PublicPageExtractor` accepts only:

- HTTP or HTTPS URLs.
- Standard port 80 or 443.
- Hostnames whose complete DNS answer contains only public addresses.
- `text/html`, `application/xhtml+xml` or `text/plain` responses.
- Responses within configured time, redirect and size limits.

It rejects:

- Credentials embedded in URLs.
- Local and private hostnames.
- Loopback, link-local, private, carrier NAT, multicast, documentation and reserved network ranges.
- A hostname with even one private DNS answer.
- A redirect whose destination is not independently safe.
- Unsupported content such as PDFs in the current extractor.
- Redirect loops and oversized responses.

The approved DNS address is pinned into the HTTP connection while the original hostname remains available for the HTTP Host header and TLS validation. This prevents the fetch from silently resolving to a different address after validation.

### Readable Text and Metadata

For an accepted page, the extractor records:

- Original and same-origin canonical URL.
- Domain and title.
- Retrieval time and content type.
- Normalized readable text.
- SHA-256 content hash.
- Whether text was truncated.
- Prompt-injection signals.

Scripts, styles, templates and SVG content are removed before analysis. Prompt-injection detection is a warning layer; the evidence model is separately instructed to treat all page text as untrusted data.

### Exact Evidence Extraction

`OpenAIEvidenceAnalyzer` receives only safely extracted page text and returns strict structured output. Every proposed excerpt is checked against the normalized source text. If the excerpt is absent, the entire atomic action fails rather than storing a fabricated quotation.

Each accepted evidence item contains:

- Source URL and title.
- Exact excerpt.
- Optional page locator.
- Relevance score.
- Credibility score.

### Claim Synthesis

Claim synthesis may output:

- `sourced_fact`: requires persisted evidence.
- `agent_interpretation`: requires persisted evidence and concise rationale.
- `unsupported_hypothesis`: remains explicitly unverified.

The model returns evidence indexes, and application code maps those indexes back to the exact evidence records. An unknown index or absent record fails the action.

## Live Executor

`LiveResearchExecutor` connects the bounded action kinds:

| Action | Behaviour |
|---|---|
| `search_web` | Discover cited candidate URLs. |
| `open_public_page` | Select the strongest unopened candidate and extract it safely. |
| `extract_evidence` | Select exact relevant excerpts from extracted pages. |
| `compare_evidence` | Synthesize labelled conclusions from persisted evidence. |
| `create_or_update_claim` | Synthesize labelled conclusions from persisted evidence. |
| `complete_research` | Record a transparent source/evidence/claim checkpoint. |

Approval and route-change actions remain owned by the orchestrator. Report generation remains outside the live research executor.

## Source Selection

Candidate selection prefers, in order:

1. A source type explicitly allowed by the playbook action.
2. The target company's official domain.
3. Public filings.
4. Direct public reports.
5. Other cited search candidates.

One open action retrieves one page. This preserves the atomic pause boundary and produces a legible action history.

## Failure Behaviour

An inaccessible or rejected page creates no evidence and no claim. The action reports one of:

- `blocked`
- `inaccessible`
- `unsupported`
- `failed`

The reason is preserved as an uncertainty with a recommended next action. Research can then try another candidate instead of pretending the source was read.

## Persistence Contract

Before an action becomes completed, the repository persists:

1. Source records, updating a pending discovery record when its page becomes available.
2. Evidence records linked to an available extracted source.
3. Claim records linked to already-persisted evidence.

A claim cannot reference an excerpt that has not passed source extraction and evidence persistence.

The in-memory implementation proves this contract locally. The Supabase implementation will use the same interface and Step 4 tables.

## Runtime Construction

`createLiveResearchExecutor` connects the production adapters without exposing the API key to the browser:

```ts
const executor = createLiveResearchExecutor({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-5.6-terra",
});
```

No external call occurs merely by constructing the runtime.

## Current Boundary

Implemented now:

- Real Responses API web-search request and citation parser.
- Real guarded HTTP/HTTPS extractor.
- Real structured evidence and claim API requests.
- Normalized local artifact persistence contract.
- Full orchestration integration under deterministic tests.

Not implemented in Step 6:

- PDF text extraction.
- Paywalled or authenticated sources.
- JavaScript-rendered browser extraction.
- Supabase repository adapter and background worker process.
- Meeting-brief and PDF generation.

These limitations are surfaced instead of bypassed.

## Local Verification

```powershell
npm.cmd run typecheck:agent
npm.cmd test
```
