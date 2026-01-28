import React, { createContext, useContext } from "react";
import { render } from "ink";
import { App } from "./app";
import { ChatProvider } from "./chat-context";
import {
  ReasoningProvider,
  ExpandedViewProvider,
  TodoViewProvider,
} from "@open-harness/shared";
import { defaultModelLabel } from "@open-harness/agent";
import { createDefaultAgentOptions } from "./config";
import type { TUIOptions } from "./types";
import type { TUIAgentUIMessage } from "./types";

export type { TUIOptions, AutoAcceptMode, Settings } from "./types";
export { useChatContext, ChatProvider } from "./chat-context";
export { tuiAgent, createDefaultAgentOptions } from "./config";
export { loadSettings, saveSettings } from "./lib/settings";
export { fetchAvailableModels } from "./lib/fetch-models";
export type { ModelInfo } from "./lib/models";

// Session persistence exports
export {
  createSession,
  saveSession,
  listSessions,
  loadSession,
  formatTimeAgo,
  encodeProjectPath,
} from "./lib/session-storage";
export type { SessionListItem, SessionData } from "./lib/session-types";

/**
 * Request parameters for remounting the TUI.
 * Used when loading a session or starting a new chat.
 */
export type RemountRequest = {
  messages?: TUIAgentUIMessage[];
  sessionId?: string | null;
};

type RemountContextValue = {
  requestRemount: (request: RemountRequest) => void;
};

const RemountContext = createContext<RemountContextValue | null>(null);

// Noop function for renderTUI which doesn't support remounting
function noopRemount() {
  console.warn("renderTUI does not support remounting. Use createTUI instead.");
}

/**
 * Hook to request a full TUI remount.
 * This is necessary because Ink's <Static> component accumulates output
 * in an internal buffer that can only be cleared by unmounting the entire app.
 */
export function useRemount() {
  const context = useContext(RemountContext);
  if (!context) {
    throw new Error("useRemount must be used within createTUI");
  }
  return context;
}

/**
 * Create a Claude Code-style TUI.
 *
 * The agent is configured in `config.ts` - this is the single source of truth.
 *
 * @example
 * ```ts
 * import { createTUI } from './tui';
 *
 * // Interactive mode
 * await createTUI({
 *   sandbox,
 *   workingDirectory: sandbox.workingDirectory,
 * });
 *
 * // One-shot mode with initial prompt
 * await createTUI({
 *   sandbox,
 *   initialPrompt: "Explain this codebase",
 *   workingDirectory: sandbox.workingDirectory,
 * });
 * ```
 */
export async function createTUI(options: TUIOptions): Promise<void> {
  if (!options.agentOptions && !options.sandbox) {
    throw new Error("createTUI requires agentOptions or a sandbox.");
  }

  const agentOptions =
    options.agentOptions ?? createDefaultAgentOptions(options.sandbox!);

  const workingDirectory =
    options.workingDirectory ?? options.sandbox?.workingDirectory;

  const projectPath = options.projectPath ?? workingDirectory;

  // State for remount requests - using object to avoid TypeScript narrowing issues
  const remountState = {
    pending: null as RemountRequest | null,
    instance: null as ReturnType<typeof render> | null,
  };

  const requestRemount = (request: RemountRequest) => {
    remountState.pending = request;
    // Unmount current instance to trigger re-render loop
    remountState.instance?.unmount();
  };

  // Render loop - re-renders when remount is requested
  while (true) {
    const pendingRemount = remountState.pending;
    const initialMessages = pendingRemount?.messages;
    const initialSessionId = pendingRemount?.sessionId ?? undefined;
    remountState.pending = null;

    // Clear terminal before rendering (especially important for remounts)
    if (initialMessages !== undefined || initialSessionId !== undefined) {
      process.stdout.write("\x1B[2J\x1B[H");
    }

    remountState.instance = render(
      <RemountContext.Provider value={{ requestRemount }}>
        <ChatProvider
          agentOptions={agentOptions}
          model={options.header?.model ?? defaultModelLabel}
          workingDirectory={workingDirectory}
          initialAutoAcceptMode={options.initialAutoAcceptMode}
          initialSettings={options.initialSettings}
          onSettingsChange={options.onSettingsChange}
          availableModels={options.availableModels}
          projectPath={projectPath}
          currentBranch={options.currentBranch}
          gateway={options.gateway}
          initialSessionId={initialSessionId}
          initialMessages={initialMessages}
        >
          <ReasoningProvider>
            <ExpandedViewProvider>
              <TodoViewProvider>
                <App options={options} />
              </TodoViewProvider>
            </ExpandedViewProvider>
          </ReasoningProvider>
        </ChatProvider>
      </RemountContext.Provider>,
    );

    await remountState.instance.waitUntilExit();

    // If no remount was requested, exit the loop
    if (remountState.pending === null) {
      break;
    }
  }
}

/**
 * Render the TUI without waiting for exit.
 * Useful for programmatic control.
 *
 * NOTE: This does not support remounting. Use createTUI for full functionality.
 */
export function renderTUI(options: TUIOptions) {
  if (!options.agentOptions && !options.sandbox) {
    throw new Error("renderTUI requires agentOptions or a sandbox.");
  }

  const agentOptions =
    options.agentOptions ?? createDefaultAgentOptions(options.sandbox!);

  const workingDirectory =
    options.workingDirectory ?? options.sandbox?.workingDirectory;

  const projectPath = options.projectPath ?? workingDirectory;

  return render(
    <RemountContext.Provider value={{ requestRemount: noopRemount }}>
      <ChatProvider
        agentOptions={agentOptions}
        model={options.header?.model ?? defaultModelLabel}
        workingDirectory={workingDirectory}
        initialAutoAcceptMode={options.initialAutoAcceptMode}
        initialSettings={options.initialSettings}
        onSettingsChange={options.onSettingsChange}
        availableModels={options.availableModels}
        projectPath={projectPath}
        currentBranch={options.currentBranch}
        gateway={options.gateway}
      >
        <ReasoningProvider>
          <ExpandedViewProvider>
            <TodoViewProvider>
              <App options={options} />
            </TodoViewProvider>
          </ExpandedViewProvider>
        </ReasoningProvider>
      </ChatProvider>
    </RemountContext.Provider>,
  );
}

// Re-export components for custom TUI composition
export * from "./components/index";

// Re-export render-tool types and utilities
export * from "./lib/render-tool";

// Re-export transport for custom usage
export { createAgentTransport } from "./transport";
