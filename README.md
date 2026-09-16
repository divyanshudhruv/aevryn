
<img src="public/aevryn.png" alt="Dawnfall Banner" width="100%">

<p align="center">
An agentic AI workspace that doesn't just chat - it executes. Give Aevryn a goal and it clarifies the details with you, proposes a step-by-step plan, then runs it: searching the live web, scraping pages, automating websites via Wire actions, and reporting progress step-by-step in real time.
</p>

> [!WARNING]
> **Aevryn is under active development.** Flags, output and code may change. 

> Talk to it. Answer its question cards. Approve its plan. Watch the work happen.

## Highlights

- **Clarify → Plan → Execute loop** - the agent asks structured follow-up questions (interactive question cards, never plain text), presents a plan for approval, then executes the bound workflow step-by-step
- **Interactive tool cards** - `askUser`, `presentPlan`, `wireAction` approvals, and step-progress sliders render as first-class UI in the chat timeline, persisted and replay-safe
- **Live web capabilities** - search with citations, scraping, batch scraping, crawling, site mapping, multi-source research, and Wire (pre-built website actions like flight/hotel search) powered by [Anakin](ANAKIN.md)
- **Realtime everything** - thread status, plan-step progress, and messages broadcast over Supabase Realtime; open the same thread in two tabs and watch the run together
- **Hardened agent loop** - deterministic anti-loop guards (no repeated tool calls, no verbatim step replays), SSRF-guarded fetches, prompt-injection-resistant untrusted-content wrapping, per-user ownership checks on every read/write
- **Durable threads** - full UIMessage persistence (tool cards, answers, approvals survive refresh), failure digests so the model never "forgets" completed work, and idempotent message writes keyed by client draft ids

## Tech Stack

| Layer      | Tech                                         |
| ---------- | -------------------------------------------- |
| Framework  | Next.js (App Router) + React 19              |
| Monorepo   | Turborepo + Bun workspaces                   |
| Agent loop | AI SDK v7 (`ToolLoopAgent`)                  |
| Database   | PostgreSQL (Supabase) + Drizzle ORM          |
| Realtime   | Supabase Realtime (postgres_changes)         |
| Auth       | Supabase Auth (SSR + browser clients)        |
| Styling    | TailwindCSS v4 + shadcn/ui primitives        |
| Quality    | Biome, Vitest (113 tests), TypeScript strict |

## Project Structure

### Your first workflow

1. Sign up / sign in (Google OAuth)
2. Add a model provider key in **Settings → BYOK** (any OpenAI-compatible provider works - Groq, OpenAI, OpenRouter…)
3. Ask for something multi-step: _"Plan a 2-week trip to Japan - flights, hotels, rail pass, itinerary, budget"_
4. The agent asks clarifying questions → presents a plan card → hit **Approve** and watch it execute step-by-step
5. Bound plans can be re-run anytime with the sidebar Run button or "run this" in chat

## Architecture Notes

- **Chat vs Run mode** - chat is cheap and conversational; approving a plan binds a workflow to the thread and flips the turn to run mode, where the full tool set (including Wire site automation) unlocks
- **Single persistence point** - every turn lands in the DB exactly once (messages, parts, step snapshots, tool-call audit log, usage), deduped by client-message id
- **Failure recovery** - a failed turn persists an error tile naming the last completed step; re-running triggers the `retryAgent` repair path instead of restarting from scratch
- **Ownership everywhere** - every thread/workflow read and write is user-scoped; cross-user access yields 404, verified by dedicated ownership tests

## License

Private project - all rights reserved.
