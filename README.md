<img alt="banner" src="./apps/web/public/aevryn.png" />
<img width="3000"  alt="image" src="./apps/web/public/demo.png" />

<p align="center">A private agentic AI workspace that <code>executes</code> instead of just <code>chatting</code> - give it a <code>goal</code>, answer its questions, approve its plan, and watch it work step-by-step in real time.</p>

<br>

> [!IMPORTANT]\
> **This is a personal, private project.** It is not published, not meant for public or personal use by others, and not a development framework. Expect fast, opinionated iteration.

> [!NOTE]\
> Talk to it. Answer its question cards. Approve its plan. Watch the work happen.

> [!WARNING]\
> **Aevryn is under active development.** Behavior, output and code may change without notice.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [How It Works](#how-it-works)
- [License](#license)

## Features

- **`🎯 Goal-driven loop`** - `clarify` --> `plan` --> `approve` --> `execute` --> `report`, not open-ended chat
- **`📋 Question cards`** - the agent asks for missing details with structured interactive cards
- **`📑 Plan cards`** - a step-by-step plan is presented and only runs after you approve
- **`⚡ Chat vs Run mode`** - cheap `conversational` turns
- **`🔁 Re-runnable workflows`** - bound plans `re-run` anytime
- **`⌨️ BYOK providers`** - bring your own key for any `OpenAI-compatible` provider (Groq, OpenAI, OpenRouter…)
- **`🛡️ Tool safety`** - SSRF guard on `web` tooling, `prompt-injection` defense, `replay` protection, `tool-call` limits
- **`🔒 Ownership everywhere`** - every thread/workflow read-write is `user-scoped`; cross-user access yields `404`
- **`💾 Durable state`** - every turn lands in the DB exactly `once`;

## Tech Stack

| Layer        | Tech                                    |
| ------------ | --------------------------------------- |
| `Framework`  | Next.js (App Router) + React 19         |
| `Monorepo`   | Turborepo + Bun workspaces              |
| `Agent loop` | AI SDK v7 (`ToolLoopAgent`)             |
| `Database`   | PostgreSQL (`Supabase`) + `Drizzle ORM` |
| `Realtime`   | Supabase Realtime (postgres_changes)    |
| `Auth`       | Supabase Auth (`SSR` + browser clients) |
| `Styling `   | TailwindCSS v4 + shadcn/ui primitives   |
| `Quality`    | Biome, `Vitest`, TypeScript strict      |
| `Web Agent`  | Anakin                                  |

## How It Works

```mermaid
flowchart TD
    U(["User"]) -->|goal| C{Clear?}
    C -->|No| Q[Question Card]
    Q --> C
    C -->|Yes| P[Plan Card]
    P -->|approve| B[Bind & Execute]
    B --> T[Tool Call]
    T -->|fail| R[Recovery]
    R --> B
    T -->|ok| D{More steps?}
    D -->|Yes| B
    D -->|No| E([Complete])
```

```mermaid
flowchart LR
    A(["Agent"]) --> S[Chat Timeline]
    S --> ID{Dup?}
    ID -->|No| DB[("Thread State")]
    ID -->|Yes| SKIP[Deduplicate]
    DB --> M[Messages]
    DB --> AP[Approvals]
    DB --> ST[Step Snapshots]
    DB --> FD[Failure Digest]
```

_Security runs through every request: `authenticated` and `owns-the-thread` checks gate access, web tooling is `SSRF-guarded`, untrusted content is `screened` for `prompt injection`, and every turn is `deduplicated` so state lands exactly once._

## License

Private project - all rights reserved.
