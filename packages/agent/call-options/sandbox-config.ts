import {
  connectSandbox,
  createLocalSandbox,
  type ConnectOptions,
  type HybridConnectOptions,
  type HybridState,
  type JustBashState,
  type Sandbox,
  type VercelState,
} from "@open-harness/sandbox";

type SerializableConnectOptions = Omit<ConnectOptions, "hooks">;
type SerializableHybridConnectOptions = Omit<
  HybridConnectOptions,
  "hooks" | "scheduleBackgroundWork"
>;

export type SerializableSandboxConnectConfig =
  | {
      state: { type: "just-bash" } & JustBashState;
      options?: SerializableConnectOptions;
    }
  | {
      state: { type: "vercel" } & VercelState;
      options?: SerializableConnectOptions;
    }
  | {
      state: { type: "hybrid" } & HybridState;
      options?: SerializableHybridConnectOptions;
    };

export type OpenHarnessSandboxConfig =
  | {
      type: "local";
      workingDirectory: string;
      env?: Record<string, string>;
    }
  | {
      type: "connect";
      config: SerializableSandboxConnectConfig;
    };

function isSerializableSandboxState(
  value: unknown,
): value is SerializableSandboxConnectConfig["state"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (!("type" in value)) {
    return false;
  }

  const sandboxType = (value as { type?: unknown }).type;
  return (
    sandboxType === "just-bash" ||
    sandboxType === "vercel" ||
    sandboxType === "hybrid"
  );
}

export function createSandboxConfigFromInstance(
  sandbox: Sandbox,
): OpenHarnessSandboxConfig {
  if (sandbox.type === "local") {
    return {
      type: "local",
      workingDirectory: sandbox.workingDirectory,
      ...(sandbox.env && { env: sandbox.env }),
    };
  }

  if (!sandbox.getState) {
    throw new Error(
      `Sandbox type "${sandbox.type}" cannot be serialized for agent call options because getState() is unavailable.`,
    );
  }

  const state = sandbox.getState();
  if (!isSerializableSandboxState(state)) {
    throw new Error(
      "Sandbox state is missing a supported type discriminator (expected just-bash, vercel, or hybrid).",
    );
  }

  const options = sandbox.env ? { env: sandbox.env } : undefined;

  switch (state.type) {
    case "just-bash":
      return {
        type: "connect",
        config: {
          state,
          ...(options && { options }),
        },
      };
    case "vercel":
      return {
        type: "connect",
        config: {
          state,
          ...(options && { options }),
        },
      };
    case "hybrid":
      return {
        type: "connect",
        config: {
          state,
          ...(options && { options }),
        },
      };
  }
}

export async function createSandboxFromConfig(
  sandboxConfig: OpenHarnessSandboxConfig,
): Promise<Sandbox> {
  if (sandboxConfig.type === "local") {
    return createLocalSandbox(
      sandboxConfig.workingDirectory,
      sandboxConfig.env,
    );
  }

  return connectSandbox(sandboxConfig.config);
}
