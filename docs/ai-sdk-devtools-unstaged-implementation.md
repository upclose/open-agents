# AI SDK DevTools Unstaged Implementation

This document captures exactly how the unstaged AI SDK DevTools changes were implemented before rollback.

## What Was Added

### 1) Server-side feature flag helper

File: `apps/web/lib/ai-sdk-devtools.ts`

- Added `import "server-only"` so the module is server-only.
- Added a truthy parser set: `"1"`, `"true"`, `"yes"`, `"on"`.
- Exported `isAiSdkDevToolsEnabled` computed from `process.env.AI_SDK_DEVTOOLS` (trimmed + lowercased).

Implementation shape:

```ts
const truthyEnvValues = new Set(["1", "true", "yes", "on"]);

export const isAiSdkDevToolsEnabled = truthyEnvValues.has(
  (process.env.AI_SDK_DEVTOOLS ?? "").trim().toLowerCase(),
);
```

### 2) Environment variable documentation

File: `apps/web/.env.example`

- Added:

```env
# AI SDK DevTools (optional)
# Set to "1" or "true" to enable local AI SDK generation traces.
AI_SDK_DEVTOOLS=
```

### 3) Chat route model wiring

File: `apps/web/app/api/chat/route.ts`

- Imported `isAiSdkDevToolsEnabled`.
- Passed `devtools: isAiSdkDevToolsEnabled` into `gateway(...)` for:
  - main selected model
  - default fallback model
  - subagent model

### 4) Title generation route wiring

File: `apps/web/app/api/generate-title/route.ts`

- Switched `gateway` import source from `ai` to `@open-harness/agent`.
- Imported `isAiSdkDevToolsEnabled`.
- Passed `devtools: isAiSdkDevToolsEnabled` to `gateway("anthropic/claude-haiku-4.5", ...)`.

### 5) PR generation route wiring

File: `apps/web/app/api/generate-pr/route.ts`

- Switched `gateway` import source from `ai` to `@open-harness/agent`.
- Imported `isAiSdkDevToolsEnabled`.
- Passed `devtools: isAiSdkDevToolsEnabled` for both AI calls in this route:
  - commit message generation
  - PR title/body structured generation

### 6) Create repo route wiring

File: `apps/web/app/api/github/create-repo/route.ts`

- Switched `gateway` import source from `ai` to `@open-harness/agent`.
- Imported `isAiSdkDevToolsEnabled`.
- Passed `devtools: isAiSdkDevToolsEnabled` for commit message generation.

## Behavioral Summary

- DevTools enablement was controlled globally by env var (`AI_SDK_DEVTOOLS`) and evaluated on the server.
- When enabled, each affected `gateway(...)` model construction received `devtools: true`.
- No client-side toggle was introduced.
- No per-request or per-user toggle was introduced.

## Rollback Note

These unstaged AI SDK DevTools changes were intentionally removed from the working tree after this documentation was added.
