# @aevryn/agent

Capability registry + runtime for live chat tools and durable runs.

- `prompts.ts` — **single prompt library** (final-docs/PROMPTS.md): all
  LLM-facing prose lives here, split by role (system / agent / planning /
  durable / subagents) with the `buildSystem` composer. Import prompts from
  here — never inline them.
- `runtime.ts` — `runAgent` durable loop (`generateText`, approval gate,
  replay, activity callbacks). System prompt = `DURABLE_RUNNER_SYSTEM` from
  the library.
- `chat/` — live chat tools + system prompt composition over the library.
- `decisions.ts` — `emitDecision` runtime-control tool + shared schema.
- `capabilities/` + `adapters/` — Anakin-backed capability layer.
