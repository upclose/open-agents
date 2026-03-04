# Automated Vercel Env Pull for New Sessions

## Problem

We want new sessions to automatically pull Vercel environment variables when:

1. The user is authenticated with Vercel
2. The session is connected to a repository
3. That repository maps to a Vercel project

Today, env pull is mostly manual (`vc env pull`) in local setup scripts and is not a first-class part of session provisioning.

## Goal

On sandbox creation, automatically populate `.env.local` using Vercel CLI in non-interactive mode when project context can be resolved.

Primary target command:

```bash
vercel env pull .env.local --yes --environment=development
```

Environment is always `development`. We don't want to risk leaking production secrets into sandbox sessions.

## Non-goals

- Replacing Vercel CLI with a custom env file format
- Blocking session creation if env sync fails
- Solving all org/project ambiguity in one release
- Refreshing `.env.local` on reconnect (initial creation only)

---

## Existing Building Blocks

### Vercel auth and token lifecycle

- OAuth exchange and token storage:
  - `apps/web/app/api/auth/vercel/callback/route.ts`
  - `apps/web/lib/vercel/oauth.ts`
- Token refresh and retrieval:
  - `apps/web/lib/vercel/token.ts`

### Session and repo context

- Session stores repo metadata:
  - `repoOwner`, `repoName`, `cloneUrl` in `apps/web/lib/db/schema.ts`
- Session creation:
  - `apps/web/app/api/sessions/route.ts`

### Sandbox provisioning hook

- Env injection and sandbox creation already happen in:
  - `apps/web/app/api/sandbox/route.ts`
- `GITHUB_TOKEN` is already injected into sandbox env via the same `env` dict pattern

### Existing manual env sync patterns

- `scripts/setup.sh`
- `.worktree-setup`
- `conductor-setup.sh`

---

## Proposed Architecture

## 1) Resolve Vercel project from repository

Create a resolver that maps `(userId, repoOwner, repoName)` to Vercel project context.

### New module

- `apps/web/lib/vercel/project-resolution.ts`

### Resolution flow

1. Get user Vercel token with `getUserVercelToken(userId)`
2. Call Vercel API:
   - `GET /v10/projects?repo={owner}/{repo}`
3. Resolve to one project when unambiguous
4. Return:
   - `projectId`
   - `projectName`
   - `orgId`
   - optional `orgSlug`

If ambiguous or unresolved, return a typed reason and skip auto pull.

## 2) Wire resolution into sandbox provisioning

Update sandbox creation flow in `apps/web/app/api/sandbox/route.ts`.

### New flow during sandbox creation

1. Validate repo context exists
2. Fetch Vercel token
3. Resolve Vercel project from repo
4. If resolved, extend sandbox env with:
   - `VERCEL_TOKEN`
   - `VERCEL_PROJECT_ID`
   - `VERCEL_ORG_ID` (if available)
5. Trigger env pull command in the sandbox
6. Record sync result/status on session

This must be best-effort and non-blocking. Env pull only runs on initial sandbox creation, not on reconnect.

## 3) Execute CLI non-interactively

The Vercel CLI will be pre-installed in the base sandbox snapshot.

```bash
vercel env pull .env.local --yes --environment=development --project "$VERCEL_PROJECT_ID"
```

Add scope/team argument only when needed:

- `--scope "$VERCEL_ORG_SLUG"` or `--team "$VERCEL_ORG_ID"`

## 4) Sandbox-type specific behavior

- `vercel` sandbox:
  - run pull immediately after sandbox is available
- `hybrid` sandbox:
  - run pull in `onCloudSandboxReady` hook (cloud side only)
- `just-bash`:
  - skip auto pull

---

## Status + Observability

Add a lightweight sync status on session metadata.

Suggested status enum:

- `not_attempted`
- `success`
- `failed`
- `no_vercel_auth`
- `project_unresolved`
- `project_ambiguous`

Store optional short error message for diagnostics.

This enables UI affordances like:

- "Connected and synced"
- "Select Vercel project to enable auto env sync"

---

## Security Considerations

## Risk

Injecting `VERCEL_TOKEN` into sandbox env makes the token available to runtime commands and potentially model-driven operations. This is consistent with how `GITHUB_TOKEN` is already injected via the same `env` dict in `apps/web/app/api/sandbox/route.ts`.

## Mitigations

1. Prefer short-lived token retrieval per provisioning event
2. Never log token values
3. Redact token-bearing env keys in command/telemetry logs
4. Keep auto-sync best-effort and scoped to project-only commands
5. Always pull `--environment=development` only — never production

## Safer future option

Server-side env retrieval via Vercel REST API + write `.env.local` directly, avoiding token exposure in sandbox runtime.

---

## Rollout Plan

## Phase 0: Manual validation

- Inject `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `VERCEL_ORG_ID` into sandbox env during provisioning
- Pre-install Vercel CLI in base snapshot
- Manually ask the agent to run `vercel env pull` to verify the token + CLI flow works end-to-end
- No automation yet — just confirm the building blocks work

## Phase 1: Foundation

- Add project resolution service
- Add sync status fields/metadata
- No automatic pull yet

## Phase 2: Auto pull for `vercel` sandbox

- Inject env and execute CLI pull for cloud-first sessions
- Record status and errors

## Phase 3: Auto pull for `hybrid`

- Trigger pull in `onCloudSandboxReady`
- No pull on reconnect — initial creation only

## Phase 4: Ambiguity handling UX

- Add API/UI to select project when multiple matches are found
- Persist user choice in a `vercel_repo_mappings` table

---

## Acceptance Criteria

1. Vercel-authenticated user + resolvable repo/project:
   - `.env.local` is created automatically in new session
2. Missing Vercel auth:
   - session still starts, status = `no_vercel_auth`
3. Ambiguous project mapping:
   - no pull, status = `project_ambiguous`
4. Token expiry:
   - refresh path is used and pull succeeds when possible
5. Pull failure:
   - session remains usable, failure is observable

---

## Open Questions

1. Is current Vercel OAuth token scope sufficient for project/env reads in all org contexts?
2. Should org selection be implicit (from mapping) or explicit in user settings?
