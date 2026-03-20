Summary: Chat rendering currently scales with full history during active streams: the page fetches every message, rebuilds grouped message metadata for the whole chat, and re-renders the whole list every ~75ms stream tick. The recommended fix is a memoized, virtualized message list so only visible rows (plus the live streaming row) stay mounted and update.

Context: `apps/web/app/sessions/[sessionId]/chats/[chatId]/page.tsx` loads the full chat history up front and passes every message into the client. `apps/web/app/sessions/[sessionId]/chats/[chatId]/hooks/use-session-chat-runtime.ts` drives streaming updates through `useChat` with `experimental_throttle: 75`, so the chat view can re-render many times per second. `apps/web/app/sessions/[sessionId]/chats/[chatId]/session-chat-content.tsx` derives `groupedRenderMessages` by walking every message/part and then maps the entire list on each render. `apps/web/components/assistant-message-groups.tsx` defaults to collapsed, but still renders the summary bar and still invokes `children(isExpanded)`; in collapsed mode the hidden tool/reasoning groups return `null`, yet the whole group tree is still traversed. So the collapsed view is not rendering every hidden tool/reasoning DOM node, but it is still processing the full history and still mounting every user message plus the final assistant markdown block for every assistant message. There is no existing virtualization dependency in `apps/web/package.json`. `apps/web/hooks/use-scroll-to-bottom.ts` assumes a normal DOM list, so bottom-pinning will need to become virtualizer-aware. The repo already uses `contentVisibility` in `apps/web/components/inbox-sidebar.tsx`, which is a useful lightweight pattern to reuse on message rows.

Approach: Introduce a dedicated message-list layer with memoized row components and a bottom-anchored virtualizer that supports variable-height rows. Move the inline row rendering out of `session-chat-content.tsx`, precompute per-message view data once, and make collapsed assistant messages avoid executing the hidden-group render path. Use virtualization to mount only the viewport window plus overscan, while preserving the current auto-scroll-to-bottom behavior for live streams and the existing expand/collapse UX for assistant tool/reasoning content. Because chat rows have highly variable heights and can grow during streaming, prefer a measured virtualizer rather than bespoke windowing.

Changes:
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/session-chat-content.tsx` - replace the inline `groupedRenderMessages.map(...)` list with a dedicated virtualized message list, keep message grouping as pure view-model prep, and pass only the live streaming/timer props needed by visible rows.
- `apps/web/components/chat-message-row.tsx` - add a memoized per-message row component that renders user bubbles, assistant markdown, tool/task groups, reasoning blocks, and message actions; apply the existing `contentVisibility` pattern to reduce offscreen paint/layout work.
- `apps/web/components/assistant-message-groups.tsx` - stop forcing the collapsed path through the full hidden-children render function; accept precomputed summary/visible-content props so collapsed assistant rows do less work.
- `apps/web/components/virtualized-message-list.tsx` - add the bottom-anchored virtualized list wrapper with overscan, variable-height measurement, and “keep pinned to bottom while streaming” behavior.
- `apps/web/hooks/use-scroll-to-bottom.ts` - adapt bottom detection and `scrollToBottom()` to work against the virtualized list container.
- `apps/web/package.json` - add a small measured-row virtualizer dependency if approved; otherwise this plan should be revised to a lighter no-dependency optimization pass instead of full virtualization.

Verification:
- Manual checks in the chat UI:
  - Open a long chat, start a new response, and confirm only visible rows mount/update while scrolling remains smooth.
  - Verify the collapsed default view still shows the summary bar and final assistant prose, and expanding a message restores tools/reasoning correctly.
  - Verify streaming keeps the viewport pinned to the bottom when already at bottom, but does not yank the user down when they have scrolled up.
  - Verify the “scroll to bottom” button and retry/stop actions still work during active streams.
- Shared checks:
  - Confirm chats without collapsible content still render normally.
  - Confirm approval-required tool calls still force the relevant message open.
- Project validation after code changes:
  - `bun run ci`
