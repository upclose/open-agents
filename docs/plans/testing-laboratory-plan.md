# Plan: Testing Laboratory for Open Harness

**Status:** Proposed

## Problem

We need a repeatable feedback loop so agents can verify their own work without manual checks. Today there is no test harness for the CLI agent flow or the web UI tasks flow.

## Current State

- Existing tests: `packages/shared/lib/paste-blocks.test.ts`.
- No CLI tests in `apps/cli`.
- No TUI tests in `packages/tui`.
- No agent tool tests in `packages/agent`.
- No web UI tests in `apps/web`.

## Goals

- Provide a minimal but complete laboratory for the two critical paths:
  - CLI agent flow
  - Web UI tasks flow
- Build a layered test pyramid per package: unit, integration, end to end.
- Ensure the smallest verification command is clear for each change.

## Non Goals

- Full end to end coverage for all features in the first pass.
- UI pixel tests outside of the web UI tasks flow.

## Strategy

### 1. Unit Tests

Focus on deterministic logic with no network calls.

- `apps/cli`
  - Extract `parseArgs` into a dedicated module and add tests.
  - Test `parseSandboxType` error handling.
  - Test `loadAgentsMd` ordering and merging behavior.

- `packages/agent`
  - Test `extractTodosFromStep` behavior.
  - Test system prompt assembly for mode and custom instructions.
  - Test tool registration for required tools.

- `packages/tui`
  - Test `createAgentTransport` approval config shaping.
  - Test message pruning and usage metadata behavior.

- `packages/sandbox`
  - Test `expandRepoUrl` behavior.
  - Test sandbox factory selection for local, vercel, just-bash.

### 2. Integration Tests

Use fakes for file system and network, but cover multi module paths.

- CLI agent flow:
  - Authentication status and error flow wiring without hitting real network.
  - Sandbox creation with mocked environment vars.

- Agent tools:
  - Validate approval handling across a representative tool set.

- TUI transport:
  - Ensure session persistence writes are triggered with expected metadata.

### 3. End to End Tests

Keep these minimal and deterministic.

- CLI agent flow golden path:
  - Starts with valid credentials, builds sandbox, and calls `createTUI`.
  - Invalid credentials produce a clear exit path.

- Web UI tasks flow golden path:
  - Creates a task and opens task detail.
  - Loads messages, files, and diff endpoints.

These will use agent-browser for UI evidence, or direct API route tests when UI is blocked by auth.

## Initial Golden Path Test Candidates

### CLI Agent Flow

1. **parseArgs smoke test**
   - Inputs: help flag, repo flag, sandbox flag, prompt parts.
   - Expected: parsed structure with prompt joined and flags respected.

2. **sandbox factory paths**
   - Inputs: local, vercel, just-bash.
   - Expected: correct factory calls and repo expansion behavior.

3. **agents.md merge order**
   - Inputs: directory tree with nested AGENTS.md files.
   - Expected: closest file first, content separation preserved.

4. **auth command routing**
   - Inputs: login, logout, status, whoami, unknown.
   - Expected: proper handler called and exit codes returned.

5. **CLI main error flow**
   - Inputs: missing credentials, invalid token.
   - Expected: clear exit code with specific messages.

### Web UI Tasks Flow

1. **tasks index API**
   - `apps/web/app/api/tasks/route.ts` returns list shape.

2. **task detail API**
   - `apps/web/app/api/tasks/[id]/route.ts` returns detail shape.

3. **task messages API**
   - `apps/web/app/api/tasks/[id]/messages/route.ts` returns ordered messages.

4. **task files API**
   - `apps/web/app/api/tasks/[id]/files/route.ts` returns file list.

5. **diff API**
   - `apps/web/app/api/tasks/[id]/diff/route.ts` returns diff metadata.

If API routes require auth, create a test mode fixture that bypasses auth for local tests only.

## Proposed Test Locations

- `apps/cli/parse-args.test.ts`
- `apps/cli/sandbox-factory.test.ts`
- `apps/cli/agents-md.test.ts`
- `packages/agent/deep-agent.test.ts`
- `packages/tui/transport.test.ts`
- `packages/sandbox/factory.test.ts`
- `apps/web/app/api/tasks/tasks-api.test.ts`

## Verification Commands

- CLI agent flow: `turbo typecheck --filter=@open-harness/cli` and `bun test apps/cli/parse-args.test.ts`
- Web UI tasks flow: `turbo typecheck --filter=web` and `bun test apps/web/app/api/tasks/tasks-api.test.ts`

## Rollout Plan

1. Add unit tests for CLI parsing and sandbox selection.
2. Add agent transport and agent tool unit tests.
3. Add API route tests for tasks flow.
4. Add minimal end to end UI verification using agent-browser when auth is available.

## Risks and Mitigations

- Auth required for web UI tests. Mitigate with local test fixtures and a test mode guard.
- Tool tests might be flaky if they rely on actual file system. Use sandbox fakes.
