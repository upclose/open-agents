Summary: Add a session-level VM terminal by running a small Ghostty Web PTY server inside the sandbox on a dedicated exposed port, then render it in the session UI via an embedded panel. This avoids a large `packages/sandbox` PTY refactor and avoids browser-bundling risks for `ghostty-web` in the Next.js app.

Context: The session UI already has a clear insertion point for a terminal action in `apps/web/app/sessions/[sessionId]/chats/[chatId]/session-chat-content.tsx`, and session-scoped API auth/ownership is standardized in `apps/web/app/api/sessions/_lib/session-context.ts`. Sandbox creation/restoration already exposes a fixed set of public VM ports from `apps/web/lib/sandbox/config.ts`, with room for one more port. The current sandbox abstraction in `packages/sandbox/interface.ts` only supports buffered `exec` / `execDetached` and port URLs, not interactive PTY streaming, so the lowest-risk path is to keep PTY/WebSocket handling inside the VM and use an exposed port. `ghostty-web` is a client-side terminal emulator, and its demo shows the simplest reliable pattern: serve a small page plus PTY-backed WebSocket endpoint from the same process.

Approach: Reserve a fourth sandbox port for terminal traffic, add a session-authenticated launch endpoint that ensures a hidden Ghostty Web PTY server is bootstrapped and running inside the VM, rotate a per-launch connection token, and return a terminal URL for the web app to embed in a sheet/iframe. While that panel is open, send lightweight activity heartbeats so normal sandbox hibernation does not interrupt an actively used terminal. If a pre-existing live sandbox was created before the new terminal port was exposed, return a `requiresRestart` response so the UI can explain that one restart is needed.

Changes:
- `apps/web/lib/sandbox/config.ts` - add `TERMINAL_SANDBOX_PORT` and include it in the default exposed ports so new and restored sandboxes get a routable terminal endpoint.
- `apps/web/lib/sandbox/terminal/bootstrap.ts` - add the server-side bootstrap flow that connects to the sandbox with routes enabled, prepares a hidden runtime directory outside the user repo, installs VM-side terminal deps on first use, writes the PTY server script, rotates the launch token, health-checks the server, and returns launch metadata.
- `apps/web/lib/sandbox/terminal/server-script.ts` - hold the embedded VM-side Ghostty Web PTY server source (HTTP server for the Ghostty page/assets + `ws` + `@lydell/node-pty`, token check, resize handling, health endpoint).
- `apps/web/app/api/sessions/[sessionId]/terminal/route.ts` - add the authenticated launch endpoint that reuses session ownership guards, handles `requiresRestart` / bootstrap errors, and returns the terminal panel URL.
- `apps/web/app/api/sessions/[sessionId]/terminal/activity/route.ts` - add a lightweight heartbeat endpoint that refreshes `lastActivityAt` / `hibernateAfter` while the terminal panel is open.
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/terminal-panel.tsx` - add the client terminal panel that launches the terminal, embeds it, shows loading/error states, and drives the heartbeat interval.
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/session-chat-content.tsx` - add the Terminal header/menu action and mount the new panel.
- `apps/web/app/api/sessions/[sessionId]/terminal/route.test.ts` - cover auth, ownership, missing-sandbox, missing-route / requires-restart, and successful launch responses.
- `apps/web/app/api/sessions/[sessionId]/terminal/activity/route.test.ts` - cover heartbeat auth/ownership and lifecycle timestamp refresh behavior.
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/terminal-panel.test.tsx` - cover terminal panel URL construction and key UI states.

Verification:
- Targeted tests:
  - `bun test "apps/web/app/api/sessions/[sessionId]/terminal/route.test.ts"`
  - `bun test "apps/web/app/api/sessions/[sessionId]/terminal/activity/route.test.ts"`
  - `bun test "apps/web/app/sessions/[sessionId]/chats/[chatId]/terminal-panel.test.tsx"`
- Full validation:
  - `bun run ci`
- End-to-end checks:
  - start the app, open a session with an active sandbox, launch Terminal, and verify basic shell interaction (`pwd`, `ls`), resize, and reconnect behavior
  - confirm an old live sandbox without the terminal route returns the restart prompt instead of a broken panel
  - confirm the heartbeat keeps `hibernateAfter` moving forward while the terminal panel is open and stops once the panel closes
  - confirm another user cannot launch or heartbeat a terminal for a session they do not own