Summary: Add a "Change risk" indicator to the open-PR panel by extending the existing merge-readiness flow. The server will classify the current PR diff with GPT-5.4, cache the result per PR head SHA, and return a compact Low/Medium/High rating plus a short reason.

Context:
- The PR panel UI is rendered in `apps/web/app/sessions/[sessionId]/chats/[chatId]/git-panel.tsx` inside the inline merge panel.
- Open-PR data already comes from `apps/web/app/api/sessions/[sessionId]/merge-readiness/route.ts`, which fetches GitHub PR metadata including `headSha`.
- The app already uses structured LLM output for PR-related generation in `apps/web/lib/git/pr-content.ts`.
- Diff/cached-diff infrastructure already exists, but for an open PR the most coherent server-side source is the GitHub PR itself because merge-readiness already owns PR identity, auth, and `headSha`.
- User decisions so far:
  - show it first in the open PR panel
  - return level + short reason
  - cache per diff/PR head SHA
  - weight critical surface area most strongly

System Impact:
- The changing subsystem is the open-PR review flow, not the general chat flow.
- Source of truth before: PR metadata comes from GitHub via merge-readiness; no stored risk assessment exists.
- Source of truth after: the latest PR risk assessment is stored on the session record, keyed by the PR `headSha`. If the SHA matches, reuse it; if it changes, recompute.
- New states: `missing` -> `computing` -> `ready`, with `stale` implied when cached `headSha` no longer matches the live PR `headSha`. Failures should degrade to "unavailable" without breaking merge readiness.
- Dependent parts: session DB shape, merge-readiness response, PR panel UI.
- This avoids duplicated client logic by keeping PR risk owned by the existing server route that already knows the current PR revision.

Approach: Extend the merge-readiness API to lazily compute and cache a PR risk assessment. Use GitHub PR file metadata/patches plus an explicit rubric prompt for GPT-5.4. Return a compact structured result: `level`, `reason`, and optional `factors`. Render that in the PR panel as a small "Change risk" card/badge near the existing diff stats.

Changes:
- `apps/web/lib/db/schema.ts` - add a persisted session field for cached PR risk data keyed by `headSha`.
- `apps/web/lib/db/migrations/...` - add the migration for the new session column.
- `apps/web/lib/pr-risk.ts` - add the server helper that fetches PR file details, trims prompt input, applies the risk rubric, calls GPT-5.4 with structured output, and returns a typed result.
- `apps/web/lib/github/client.ts` - add or expose the minimal GitHub PR file-fetch helper needed by the risk analyzer.
- `apps/web/app/api/sessions/[sessionId]/merge-readiness/route.ts` - include `risk` in the response, reuse cached data when `headSha` matches, otherwise compute and persist it. Do not fail the whole route if risk analysis fails.
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/git-panel.tsx` - render the new "Change risk" UI with Low/Medium/High styling and the short reason.
- `apps/web/lib/pr-risk.test.ts` and/or `apps/web/app/api/sessions/[sessionId]/merge-readiness/route.test.ts` - cover rubric shaping, cache invalidation by SHA, and graceful failure behavior.

Verification:
- Open a session with an existing PR and confirm the panel shows a risk label + short reason.
- Push a new commit to the PR branch and confirm the risk recomputes because `headSha` changed.
- Verify merge-readiness still loads when the risk model call fails.
- Run: `bun run ci`
- Edge cases: PR with large diffs (prompt trimming), binary/generated files, missing GitHub token, closed/merged PRs, and unchanged cached SHA reuse.