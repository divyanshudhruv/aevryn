# Aevryn - Project Instructions

## 0. INSTRUCTIONS

1. TypeScript uses camelCase.
2. PostgreSQL uses snake_case.
3. JSON/API responses use camelCase.
4. HTTP routes use /api/v1/<resource>.
5. All externally visible IDs use prefixed ULIDs.
6. All timestamps are UTC and use timestamptz in PostgreSQL.
7. All persisted schemas have a schemaVersion when evolution is expected.
8. Validate external input with Zod.
9. Never parse LLM free-form text to control runtime behavior.
10. Never let the LLM directly mutate the database.
11. All agent decisions must pass schema validation.
12. All external side effects must be durable/idempotent.
13. Never store secrets in state, memory, tool input/output, or logs.
14. Never log credentials, cookies, tokens, or full prompts by default.
15. Separate workflow, execution, step, state, observation, memory, and event concepts.
16. Do not put all history into one JSONB field.
17. Use composition rather than deep inheritance.
18. Keep provider-specific logic inside provider adapters.
19. Forge core must not depend directly on Anakin implementation details.
20. Do not introduce infrastructure unless there is a demonstrated requirement.
21. Every new database table requires indexes based on actual query patterns.
22. Every asynchronous external job must have an explicit lifecycle.
23. Every retry must have a bounded retry/recovery budget.
24. Consequential actions require an approval boundary when appropriate.
25. Do not expose chain-of-thought; store concise reasoning summaries only.

## 1. Project Identity

Aevryn is a durable, self-healing web-agent platform.

A user gives Aevryn a natural-language objective.

Aevryn should be able to:

1. Understand the objective.
2. Plan how to accomplish it.
3. Select appropriate capabilities.
4. Execute those capabilities against the web.
5. Observe external results.
6. Persist workflow state.
7. Decide what to do next.
8. Recover from failures.
9. Remember useful knowledge.
10. Sleep when waiting is appropriate.
11. Wake and resume later.
12. Continue until the objective is completed, cancelled, or safely failed.

Aevryn is NOT primarily a chatbot.

The core product is a persistent objective-execution engine.

---

# 2. Current Technology Stack

## Application

* TypeScript
* Bun
* Turborepo
* Next.js
* React
* Tailwind CSS
* shadcn/ui
* tRPC
* Better Auth

## Agent

* Vercel AI SDK

## Durable execution

* Inngest

## Database

* Supabase PostgreSQL
* Drizzle ORM
* pgvector

## Web capabilities

* Anakin

## Browser recovery

* Stagehand

## Validation

* Zod

## Testing

* Vitest

## Tooling

* Biome
* Lefthook
* Evlog

Do not introduce additional infrastructure without a concrete requirement.

Do not add a dependency merely because it is popular.

---

# 3. Architecture Principles

Aevryn must remain modular and provider-independent.

The fundamental architecture is:

USER OBJECTIVE
→ PLANNING
→ CAPABILITY SELECTION
→ WORKFLOW
→ DURABLE EXECUTION
→ WEB CAPABILITY
→ OBSERVATION
→ DECISION
→ STATE / MEMORY
→ CONTINUE / RECOVER / SLEEP / NOTIFY / FINISH

The most important architectural rule is:

> The LLM decides what should happen. Aevryn decides how it is safely and durably executed.

The model must not directly control infrastructure or persistence.

---

# 4. Responsibility Boundaries

## Vercel AI SDK

Responsible for:

* LLM interaction
* agent loops
* tool calling
* structured outputs
* model context
* tool definitions
* AI reasoning interface
* approval integration

It is NOT the durable workflow engine.

## Inngest

Responsible for:

* durable execution
* retries
* checkpoints
* sleeping
* waking
* scheduled execution
* event-triggered execution
* failure handling

Do not build a second workflow engine.

## Anakin

Responsible for external web capabilities.

Potential capabilities include:

* search
* URL scraping
* crawling/map
* agentic search
* Wire actions
* browser operations

Anakin-specific implementation details must remain behind an adapter.

Aevryn core must not be tightly coupled to Anakin response formats.

## Stagehand

Stagehand is a browser reasoning/recovery capability.

It is NOT the foundation of Aevryn.

Use it when browser reasoning or structural recovery is necessary.

## PostgreSQL

PostgreSQL is the source of truth for structured persistent data.

## pgvector

pgvector provides semantic memory retrieval.

Do not introduce a separate vector database.

## Drizzle

Drizzle is the typed database access/migration layer.

Do not place business logic inside database schema definitions.

---

# 5. Core Domain Concepts

These concepts must remain separate.

## Workflow

A long-lived user objective.

Example:

"Monitor this product and tell me when its price falls below ₹5,000."

## Execution

One run of a workflow.

A workflow may have many executions.

## Step

A durable unit of work inside an execution.

## State

The current internal state of a workflow.

## Observation

A representation of what Aevryn currently knows about the external world.

## Result

The direct output of an operation.

## Tool Execution

A record of a capability invocation.

## Recovery Attempt

A record of an attempt to recover from a failure.

## Memory

Knowledge worth preserving for future use.

## Event

An immutable record that something happened.

Never use one generic object to represent all of these.

---

# 6. State Rules

Dynamic workflow state may use JSON/JSONB.

However, frequently queried values should have normal database columns.

Examples:

* status
* workflow_id
* execution_id
* user_id
* timestamps
* version
* ownership

Do not store the entire history of a workflow in one JSONB field.

Current state is not historical event data.

Current state is not memory.

Current state is not observation history.

The LLM must never directly mutate database state.

The model may produce a state patch.

The runtime validates the patch and applies it.

---

# 7. LLM Control Rules

Never parse arbitrary natural-language model responses to determine runtime behavior.

Use structured schemas.

Every runtime decision must be validated.

Use Zod for:

* user input
* tool input
* tool output where necessary
* agent decisions
* state patches
* memory candidates
* external API boundaries

The model may propose:

* tool calls
* state patches
* memories
* next actions
* recovery
* sleep
* notification
* completion

The runtime remains authoritative.

Do not store chain-of-thought.

Only store concise reasoning summaries when useful for observability.

---

# 8. Capability Architecture

Capabilities must be provider-independent.

Prefer an interface similar to:

interface Capability {
name: string;
description: string;
inputSchema: ZodType;
execute(input: unknown): Promise<CapabilityResult>;
}

Capabilities should be registered through a capability registry.

The agent should discover capabilities through their descriptions and schemas.

Provider-specific implementations belong in adapters.

Example:

searchWeb
→ SearchCapability
→ AnakinSearchAdapter

The core agent should not need to know how Anakin implements search.

Prefer composition over inheritance.

Avoid deep class hierarchies.

---

# 9. Failure Classification

Every significant external failure should be classified.

At minimum:

### Transient

Examples:

* timeout
* temporary provider outage
* temporary rate limit

Usually handled through durable retries.

### Structural

Examples:

* page structure changed
* target element disappeared
* previous extraction strategy became invalid
* browser target changed

Handled by Aevryn recovery.

### Fatal

Examples:

* invalid configuration
* permanently unavailable authorization
* invalid objective

Safely fail.

Never blindly retry every error.

Never interpret a human-readable error message as the error's machine type.

Use stable error codes.

---

# 10. Recovery

Recovery is a first-class system.

Preferred flow:

failure
→ classify
→ inspect
→ retrieve relevant memory
→ choose recovery strategy
→ execute
→ validate
→ persist successful strategy
→ continue

Recovery must be bounded.

Use limits such as:

* maxAttemptsPerStep
* maxRecoveryAttempts
* maxLLMCallsPerExecution
* maxToolCallsPerExecution
* maxTotalCost

Never allow an infinite retry or recovery loop.

A successful recovery strategy may become procedural memory.

---

# 11. Durable Execution

Long-running workflows must not depend on an always-running process.

Use Inngest.

Expected lifecycle:

execute
→ checkpoint
→ sleep/wait
→ wake
→ restore state
→ continue

Durable steps should contain external side effects.

Be careful with operations whose previous result is unknown.

---

# 12. Idempotency

External side effects must be designed carefully.

Use idempotency keys when appropriate.

Pay particular attention to:

* form submissions
* resource creation
* messages
* bookings
* mutations
* purchases

Never blindly retry a side effect when the previous request may have succeeded.

---

# 13. Approval Boundary

Consequential actions should follow:

READ
→ REASON
→ ACTION PROPOSAL
→ APPROVAL
→ EXECUTE

Do not allow the model to silently perform consequential actions.

Read-only operations can generally execute without approval.

---

# 14. Memory Architecture

Aevryn owns its MemoryStore abstraction.

Initial implementation:

PostgreSQL + pgvector.

Do not make Mem0, Supermemory, or another hosted memory service the source of truth.

Memory categories:

1. Working memory
2. Episodic memory
3. Semantic memory
4. Procedural memory

Procedural memory is particularly important for self-healing.

Example:

A website changes.

The old extraction method fails.

Aevryn discovers a new successful method.

Aevryn stores that strategy.

A future execution can retrieve and reuse it.

Memory should use a deliberate policy.

Do not store everything automatically.

The LLM may propose memory candidates.

The runtime decides whether to persist them.

Memory must always respect user/workflow ownership.

Never leak memory across users.

---

# 15. Events

Events describe things that happened.

Examples:

workflow.created
workflow.started
workflow.completed
workflow.failed

execution.started
execution.completed
execution.failed

tool.called
tool.completed
tool.failed

observation.created

recovery.started
recovery.completed
recovery.failed

workflow.sleeping
workflow.resumed

Events should be immutable.

Do not use events as a replacement for current state.

---

# 16. Database Rules

Initial domain entities:

* users
* workflows
* workflow_executions
* workflow_steps
* agent_states
* observations
* tool_executions
* recovery_attempts
* memories
* events
* schedules
* notifications

Do not create unnecessary tables.

Indexes must correspond to actual query patterns.

Use foreign keys.

Use timestamptz for timestamps.

Use UTC.

Use optimistic concurrency where concurrent state updates are possible.

Persisted schemas that may evolve should include schemaVersion where appropriate.

---

# 17. IDs

Use prefixed ULIDs for externally visible domain entities.

Examples:

wf_01K...
exe_01K...
step_01K...
tool_01K...
mem_01K...
evt_01K...
rec_01K...

Do not use sequential public identifiers.

Do not put sensitive information into IDs.

---

# 18. Naming Conventions

## TypeScript

Variables/functions:

camelCase

Classes/interfaces/types:

PascalCase

React components:

PascalCase

## JSON

camelCase

## PostgreSQL

snake_case

## Environment variables

UPPER_SNAKE_CASE

## HTTP routes

/api/v1/<resource>

Use kebab-case where route naming requires a multi-word resource.

## Events

dot.separated

## Files

Prefer kebab-case unless a framework convention requires otherwise.

---

# 19. API Contract

Use versioned APIs:

/api/v1/...

Successful response:

{
"data": {},
"error": null,
"meta": {
"requestId": "req_..."
}
}

Error response:

{
"data": null,
"error": {
"code": "ERROR_CODE",
"message": "Human-readable message.",
"details": null
},
"meta": {
"requestId": "req_..."
}
}

Every request should have a requestId.

Propagate requestId into relevant workflow/execution/tool logs.

Use appropriate HTTP status codes.

Async workflow creation may return 202.

---

# 20. Security

Never store secrets in:

* workflow state
* memory
* observations
* tool inputs
* tool outputs
* events
* logs

Never log:

* API keys
* passwords
* cookies
* authorization headers
* access tokens
* secrets

Redact sensitive values.

Validate environment variables at startup.

External inputs must be validated.

---

# 21. Observability

Use structured logs.

Useful fields include:

* requestId
* workflowId
* executionId
* stepId
* toolCallId
* tool
* provider
* durationMs
* errorCode

Do not log entire prompts by default.

Do not log secrets.

Logs should allow a developer to reconstruct what happened during an execution without exposing sensitive data.

---

# 22. Testing

Use:

* Vitest for unit/integration tests

Prioritize testing:

* state transitions
* workflow lifecycle
* capability validation
* failure classification
* retry behavior
* recovery
* memory isolation
* idempotency
* sleep/resume

Prefer behavior-based tests.

Do not test implementation details unnecessarily.

Never delete or weaken a failing test just to make CI pass.

---

# 23. Dependency Rules

Before adding a dependency:

1. Check whether the project already provides the functionality.
2. Check whether an existing dependency can solve the problem.
3. Determine whether the dependency is genuinely required.
4. Prefer small, focused dependencies.
5. Avoid duplicate libraries solving the same problem.

Do not add:

* Redis
* Kafka
* Temporal
* another workflow engine
* another vector database
* LangChain
* CrewAI

unless a future requirement explicitly justifies it.

---

# 24. Implementation Rules

Do not implement the entire product in one pass.

Work in vertical slices.

Before making a major change:

1. Inspect the repository.
2. Read relevant architecture documentation.
3. Identify existing abstractions.
4. Plan the change.
5. Implement the smallest correct change.
6. Typecheck.
7. Lint.
8. Test.
9. Verify runtime behavior.
10. Review architecture.
11. Commit.

Never claim a feature works without actually verifying it.

Never silently ignore compiler, test, lint, or runtime errors.

Do not weaken types to bypass errors.

Do not disable validation to make an integration work.

Do not introduce infrastructure without a requirement.

---

# 25. Initial Implementation Order

Build in this order.

## Phase 1 - Foundation

* repository structure
* agent runtime
* capability abstraction
* Anakin adapter
* one working web capability
* first vertical slice

## Phase 2 - Persistence

* workflows
* executions
* steps
* state
* database

## Phase 3 - Durability

* Inngest
* durable steps
* retries
* checkpointing

## Phase 4 - Decision Runtime

* structured decisions
* state patches
* lifecycle transitions

## Phase 5 - Recovery

* failure classification
* recovery attempts
* bounded recovery
* validation

## Phase 6 - Memory

* MemoryStore
* PostgreSQL memory
* pgvector
* semantic retrieval
* procedural memory

## Phase 7 - Long-running Workflows

* sleep
* wake
* schedules
* webhooks
* asynchronous provider operations

## Phase 8 - Browser Recovery

* Anakin Browser API
* Stagehand
* structural recovery

## Phase 9 - Product UI

* objective creation
* workflow status
* execution timeline
* observations
* recovery visibility
* memory visibility where useful

## Phase 10 - Hardening

* testing
* security
* observability
* error handling
* demo reliability

Do not skip ahead because a later feature looks more interesting.

---

# 26. First Vertical Slice

The first working feature is intentionally small.

Example:

User:

"Find the latest information about React."

Flow:

Next.js UI
→ API
→ AgentTask/runtime
→ AI SDK agent
→ searchWeb capability
→ Anakin Search
→ structured result
→ response

Do not implement memory, recovery, browser automation, or long-running scheduling before this works.

---

# 27. Git Commit Convention

Every commit must use this format:

<type>(<major-area>): <detailed description>

The scope must contain ONE major word describing the primary area changed.

Examples:

feat(agent): implement structured capability execution and validated tool results

feat(workflow): add durable workflow execution with persisted lifecycle state

feat(memory): add PostgreSQL memory storage with semantic retrieval foundations

fix(recovery): prevent repeated structural recovery attempts after exhaustion

refactor(state): separate workflow state updates from execution history persistence

test(runtime): cover capability failures and bounded execution transitions

docs(architecture): document durable execution and provider boundary decisions

chore(tooling): configure repository validation and development scripts

The description should be detailed enough to explain WHAT changed and, when useful, WHY.

Avoid meaningless commits such as:

bad:
feat(agent): stuff

bad:
fix: things

bad:
update: changes

bad:
wip

bad:
misc

The scope must be one major word.

Examples of valid scopes:

agent
workflow
state
memory
recovery
database
api
ui
anakin
inngest
testing
tooling
docs
security

Do not use multiple scopes:

bad:
feat(agent/workflow): ...

bad:
feat(agent,workflow): ...

Use the dominant area instead.

Before committing, ensure the commit contains one coherent logical change.

Do not combine unrelated features into one commit.

---

# 28. Commit Verification

Before every commit:

1. Review changed files.
2. Check for accidental files.
3. Check for secrets.
4. Run relevant tests.
5. Run typecheck.
6. Run lint/format checks.
7. Confirm the change is logically coherent.
8. Write a detailed commit message following the required format.

Never commit secrets or .env files containing real credentials.

---

# 29. Architecture Integrity

If a requested feature conflicts with the architecture:

Do not silently redesign the system.

Explain:

1. What conflicts.
2. Why it conflicts.
3. What alternatives exist.
4. Which alternative you recommend.

Only then make a major architectural change.

The goal is not maximum abstraction.

The goal is a simple, durable, understandable architecture that can evolve.

---

# 30. OpenCode Behavior

When working on Aevryn:

* Read AGENTS.md first.
* Inspect before editing.
* Do not assume files exist.
* Do not invent APIs without checking installed packages.
* Do not invent provider behavior.
* Prefer official documentation when implementing integrations.
* Keep changes incremental.
* Verify changes.
* Report what was actually verified.
* Stop at the requested milestone.

Never implement future milestones simply because they are described in the roadmap.

The current milestone is authoritative.

---

# 31. Definition of Done

A feature is not complete merely because code exists.

A feature is complete when:

* implementation exists
* types are correct
* validation exists where required
* tests cover important behavior
* lint passes
* typecheck passes
* runtime behavior has been verified
* architecture boundaries remain intact
* secrets are not exposed
* documentation is updated when the architecture changed
* a coherent commit can describe the change
