# @aevryn/workflow

Server-side workflow orchestration for Aevryn: threads, messages, runs,
plan steps, approvals, and user-owned data (keys, settings, memory).

Used by the Next.js app (Next API routes) and the agent package. Reads and
writes Postgres via Drizzle; emits thread-level events for realtime sync.