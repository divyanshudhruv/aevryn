---
name: anakin
description: |
  Anakin gives AI agents and apps fast, anti-bot-resistant web scraping
  with AI-powered structured data extraction, web search with citations,
  site crawling, link mapping, multi-source agentic research, pre-built
  website actions (Wire), scheduled website-change monitoring, and AI
  Visibility (compare what ChatGPT, Gemini, and Google AI Overview
  answer for any prompt). Choose your path based on whether you need
  live web data during this session, are building Anakin into an
  application, or need a key first.
---

# Anakin

Anakin is a production web scraping and search platform purpose-built
for sites that block conventional scrapers. It handles JavaScript-heavy
SPAs, anti-bot detection, CAPTCHAs, and rate limiting through a managed
stealth browser fleet with adaptive proxy routing. Use it to fetch
clean markdown, extract structured JSON with AI, search the web with
citations, crawl sites, map URLs, run multi-source research, trigger
pre-built actions on websites, watch pages for changes, or compare
what the major AI engines answer for any prompt.

## Choose Your Path

- **Need web data during this session, agent has shell access** → Path A (CLI tools)
- **Building Anakin into an app, agent, or workflow** → Path B (SDK)
- **Need an account or API key first** → Path C (auth)
- **No install allowed / sandboxed environment** → Path D (REST API directly)

---

## Path A: Live Web Tools via CLI

Use this when you have shell access and want to scrape, search, or
research the web from your current session without writing code.

### Install

```bash
pip install anakin-cli
anakin login --api-key "ak-YOUR-KEY"
anakin status
```

If you don't have an API key yet, do Path C first.

### Available commands

- `anakin search "<query>"` — AI web search with citations (synchronous, fast)
- `anakin scrape "<url>" -o page.md` — single URL → clean markdown
- `anakin scrape "<url>" --format json -o data.json` — AI-extracted structured JSON
- `anakin scrape-batch "<url1>" "<url2>" ...` — multiple URLs in one job
- `anakin research "<topic>"` — deep multi-source agentic research (1–5 min)

### Default flow for live web work

1. Start with `anakin search` when you need discovery.
2. Move to `anakin scrape` when you have a URL.
3. Use `anakin research` when one URL won't answer the question.
4. Use `anakin scrape --format json` when you need structured data instead of prose.

If the task becomes "wire Anakin into product code," switch to Path B.

---

## Path B: Integrate Anakin into an App

Use this when you're building an agent, app, or workflow that calls
Anakin's API from code. Both Node.js and Python have first-party SDKs.

### Save the API key

```dotenv
ANAKIN_API_KEY=ak-...
```

### Node.js / TypeScript

```bash
npm install @anakin-io/sdk
```

```javascript
import Anakin from "@anakin-io/sdk"
const client = new Anakin({ apiKey: process.env.ANAKIN_API_KEY })

const doc = await client.scrape("https://example.com")
console.log(doc.markdown)
```

### Python

```bash
pip install anakin-sdk
```

```python
import os
from anakin import Anakin

client = Anakin(api_key=os.environ["ANAKIN_API_KEY"])
doc = client.scrape("https://example.com")
print(doc.markdown)
```

### Other languages

For Go, Ruby, PHP, Java, Rust, Elixir, or .NET — use the REST API
directly (Path D). Native HTTP quickstarts exist for each:

- https://anakin.io/docs/documentation/getting-started

### Choose the right method

| Method | Purpose |
|---|---|
| `client.scrape(url, options)` | Single URL → markdown / cleaned HTML / structured JSON. Add `generateJson: true` for AI-extracted structured data, `useBrowser: true` for SPAs. |
| `client.search(prompt)` | AI search with citations. **Synchronous** — returns immediately. |
| `client.map(url)` | Discover all reachable URLs on a domain. |
| `client.crawl(url)` | Bulk fetch markdown across a site. |
| `client.agenticSearch(prompt)` (Node) / `client.agentic_search(prompt)` (Py) | Multi-source deep research. Async, 1–5 min. |
| `client.wire(action, args)` | Execute pre-built website actions (login flows, form submissions, etc.). |

### Smoke test

```javascript
const doc = await client.scrape("https://example.com")
if (!doc.markdown) throw new Error("scrape returned empty")
```

If you don't have a key yet, do Path C.

---

## Path C: Get an API Key

Use this when the human needs to sign up or grab a key.

Direct the human to:

- **https://anakin.io/dashboard** — sign in or sign up (Google OAuth or
  email + password), then navigate to **API Keys** and create one

Free signup grants **300 credits**. No credit card required.

Save the key:

```bash
echo "ANAKIN_API_KEY=ak-..." >> .env
```

API keys start with `ak-`. They're only shown once at creation, so save
them immediately.

---

## Path D: Use Anakin Without Installing Anything

The REST API works from any HTTP client — useful when you can't install
packages or the agent runs in a sandboxed environment.

**Base URL:** `https://api.anakin.io/v1`

**Auth header:** `X-API-Key: ak-YOUR_API_KEY`
(also accepted: `Authorization: Bearer ak-...`)

### Endpoints (most-used)

| Endpoint | Method | Purpose | Pattern |
|---|---|---|---|
| `/url-scraper` | POST | Scrape one URL → markdown / JSON / HTML | async (returns `jobId`) |
| `/url-scraper/{jobId}` | GET | Poll scrape result | poll until `status` is `completed` or `failed` |
| `/search` | POST | AI search with citations | **sync** (returns result immediately) |
| `/agentic-search` | POST | Multi-source deep research | async, 1–5 min |
| `/map` | POST | URL discovery on a domain | async |
| `/crawl` | POST | Bulk site fetch | async |
| `/wire/task` | POST | Wire — execute pre-built website action | async (poll `/wire/jobs/{jobId}`) |
| `/ai-visibility/search` | POST | Ask ChatGPT, Gemini & Google AI Overview the same prompt | async (poll `/ai-visibility/search/{search_id}`) |
| `/monitors` | POST / GET | Create / list scheduled website-change monitors | sync CRUD |

Most endpoints return a `jobId`. Poll the corresponding `GET /<endpoint>/{jobId}`
every 3 seconds until `status` is `completed` (use the result) or
`failed` (read `error`). Most jobs complete in 3–15 seconds.

### Quickstart: scrape one URL

```bash
# Submit
JOB=$(curl -sS -X POST https://api.anakin.io/v1/url-scraper \
  -H "X-API-Key: $ANAKIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}' | jq -r '.jobId')

# Poll (every 3s, up to 60 attempts = 3 minutes)
while :; do
  RES=$(curl -sS "https://api.anakin.io/v1/url-scraper/$JOB" -H "X-API-Key: $ANAKIN_API_KEY")
  STATUS=$(echo "$RES" | jq -r '.status')
  case "$STATUS" in
    completed) echo "$RES" | jq -r '.markdown'; break ;;
    failed)    echo "scrape failed: $(echo "$RES" | jq -r '.error')" >&2; exit 1 ;;
  esac
  sleep 3
done
```

### Quickstart: search (synchronous, no polling)

```bash
curl -sS -X POST https://api.anakin.io/v1/search \
  -H "X-API-Key: $ANAKIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "web scraping best practices 2025"}'
```

Response includes an `answer`, `citations` (with URLs and titles), and
optional structured fields.

### Extract structured JSON from any page

Add `"generateJson": true` to the scrape body. The completed response
includes a `generatedJson` field with AI-inferred structured data:

```bash
curl -sS -X POST https://api.anakin.io/v1/url-scraper \
  -H "X-API-Key: $ANAKIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://news.ycombinator.com", "generateJson": true}'
```

To control the exact shape of the extracted data, pass `outputSchema`
(a JSON Schema object) in the scrape body — it implies `generateJson: true`
and the response's `generatedJson` matches your schema.

### JavaScript-heavy sites

Add `"useBrowser": true` to render SPAs and dynamic pages with a
stealth headless browser. Slower and more expensive than standard
scrape — only use when needed.

```json
{ "url": "https://example.com/spa", "useBrowser": true }
```

### Login-protected pages

Save a browser session once (via the dashboard or `POST /v1/browser-sessions`),
then pass `sessionId` or `sessionName` on subsequent scrapes:

```json
{ "url": "https://example.com/dashboard", "useBrowser": true, "sessionId": "sess_..." }
```

### Watch a page for changes (Monitoring)

```bash
curl -sS -X POST https://api.anakin.io/v1/monitors \
  -H "X-API-Key: $ANAKIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/pricing", "intervalMinutes": 60, "alertWebhookUrl": "https://your-app.com/hooks/anakin"}'
```

Checks the page every `intervalMinutes` (minimum 15) and records a
change whenever it differs from the previous check. Alerts go to the
webhook and/or `alertEmails`. `"scope": "site"` crawls and diffs the
whole site each run; `"scope": "wire"` runs a Wire action and diffs its
JSON. Full options: https://anakin.io/docs/api-reference/monitoring

### Compare AI engine answers (AI Visibility)

```bash
curl -sS -X POST https://api.anakin.io/v1/ai-visibility/search \
  -H "X-API-Key: $ANAKIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "Best web scraping APIs in 2026", "sources": ["chatgpt", "gemini", "google-ai-overview"], "country": "us"}'
```

Returns a `search_id` immediately. Poll `GET /v1/ai-visibility/search/{search_id}`
as each engine's answer, latency, and verdict stream in. Omit `sources`
to query every enabled engine (list them at `GET /v1/ai-visibility/sources`).

### Error handling

All errors return a JSON body with an `error` field and a 4xx/5xx status:

```json
{ "error": "URL is required", "code": "validation_error" }
```

Common status codes:

- `400` — validation error (bad request body)
- `401` — invalid or missing API key
- `402` — out of credits (top up at the dashboard)
- `404` — job ID not found
- `429` — rate limit hit; back off (`Retry-After` header)
- `5xx` — transient server error; retry with exponential backoff

### Rate limits (per API key, per minute)

- **Scrape (`/url-scraper`):** 60 / minute
- **Search (`/search`):** 30 / minute
- **Agentic search (`/agentic-search`):** 10 / minute
- **AI Visibility (`/ai-visibility/search`):** 15 / minute

429 responses include a `Retry-After` header (seconds).

### Credits

Failed jobs are **not** charged. Credits are deducted only when a job
completes successfully. Free tier: 300 credits on signup. Pricing and
top-up plans: https://anakin.io/docs/documentation/pricing

---

## Documentation and references

- **Full API reference:** https://anakin.io/docs/api-reference
- **Webhooks** (push notifications for async jobs, monitors, and AI
  Visibility runs — instead of polling): https://anakin.io/docs/api-reference/webhooks
- **Language quickstarts** (cURL, Python, Node, Go, Ruby, PHP, Java, Rust, Elixir, .NET): https://anakin.io/docs/documentation/getting-started
- **SDKs:** Node.js (`@anakin-io/sdk` on npm), Python (`anakin-sdk` on PyPI)
- **CLI:** `pip install anakin-cli`
- **Use cases for agents:** https://anakin.io/docs/documentation/use-cases/ai-agent-data-ingestion