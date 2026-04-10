import { beforeEach, describe, expect, mock, test } from "bun:test";

type UpsertMode = "inserted" | "updated" | "conflict";

let upsertMode: UpsertMode = "inserted";

// Rows returned by the fakeDb select() chain (used by getUsedSessionTitles)
let fakeSelectRows: { title: string }[] = [];
let fakeRepoTimingRows: {
  chatId: string;
  id: string;
  role: "user" | "assistant";
  parts: unknown;
  createdAt: Date;
}[] = [];

const fakeInsertedMessage = {
  id: "message-1",
  chatId: "chat-1",
  role: "assistant" as const,
  parts: { id: "message-1", role: "assistant", parts: [] },
  createdAt: new Date(),
};

const fakeDb = {
  select: (_columns: unknown) => ({
    from: (_table: unknown) => ({
      where: async (_condition: unknown) => fakeSelectRows,
      innerJoin: (_joinedTable: unknown, _condition: unknown) => ({
        innerJoin: (_nextJoinedTable: unknown, _nextCondition: unknown) => ({
          where: (_joinedWhereCondition: unknown) => ({
            orderBy: async (..._orderBy: unknown[]) => fakeRepoTimingRows,
          }),
        }),
      }),
    }),
  }),

  transaction: async <T>(
    callback: (tx: {
      insert: (table: unknown) => {
        values: (input: unknown) => {
          onConflictDoNothing: (config: unknown) => {
            returning: () => Promise<(typeof fakeInsertedMessage)[]>;
          };
        };
      };
      update: (table: unknown) => {
        set: (input: unknown) => {
          where: (condition: unknown) => {
            returning: () => Promise<(typeof fakeInsertedMessage)[]>;
          };
        };
      };
    }) => Promise<T>,
  ) => {
    const tx = {
      insert: (_table: unknown) => ({
        values: (_input: unknown) => ({
          onConflictDoNothing: (_config: unknown) => ({
            returning: async () =>
              upsertMode === "inserted" ? [fakeInsertedMessage] : [],
          }),
        }),
      }),
      update: (_table: unknown) => ({
        set: (_input: unknown) => ({
          where: (_condition: unknown) => ({
            returning: async () =>
              upsertMode === "updated" ? [fakeInsertedMessage] : [],
          }),
        }),
      }),
    };

    return callback(tx);
  },
};

mock.module("./client", () => ({
  db: fakeDb,
}));

const sessionsModulePromise = import("./sessions");

describe("normalizeLegacySandboxState", () => {
  test("rewrites legacy vercel-compatible sandbox ids onto sandboxName", async () => {
    const { normalizeLegacySandboxState } = await sessionsModulePromise;

    const result = normalizeLegacySandboxState({
      type: "hybrid",
      sandboxId: "sbx-legacy-1",
      snapshotId: "snap-legacy-1",
      expiresAt: 123,
    });

    expect(result).toEqual({
      type: "vercel",
      sandboxName: "sbx-legacy-1",
      snapshotId: "snap-legacy-1",
      expiresAt: 123,
    });
  });

  test("moves persisted session_<id> identifiers onto sandboxName", async () => {
    const { normalizeLegacySandboxState } = await sessionsModulePromise;

    expect(
      normalizeLegacySandboxState({
        type: "vercel",
        sandboxId: "session_123",
        expiresAt: 456,
      }),
    ).toEqual({
      type: "vercel",
      sandboxName: "session_123",
      expiresAt: 456,
    });
  });

  test("leaves supported sandbox states unchanged", async () => {
    const { normalizeLegacySandboxState } = await sessionsModulePromise;

    const state = {
      type: "vercel",
      sandboxName: "session_current-1",
      expiresAt: 456,
    } as const;

    expect(normalizeLegacySandboxState(state)).toEqual(state);
  });
});

describe("getUsedSessionTitles", () => {
  beforeEach(() => {
    fakeSelectRows = [];
  });

  test("returns an empty Set when the user has no sessions", async () => {
    const { getUsedSessionTitles } = await sessionsModulePromise;
    fakeSelectRows = [];

    const result = await getUsedSessionTitles("user-1");
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  test("returns a Set containing all existing session titles", async () => {
    const { getUsedSessionTitles } = await sessionsModulePromise;
    fakeSelectRows = [
      { title: "Tokyo" },
      { title: "Paris" },
      { title: "Lagos" },
    ];

    const result = await getUsedSessionTitles("user-1");
    expect(result.size).toBe(3);
    expect(result.has("Tokyo")).toBe(true);
    expect(result.has("Paris")).toBe(true);
    expect(result.has("Lagos")).toBe(true);
  });

  test("deduplicates titles if the DB returns duplicates", async () => {
    const { getUsedSessionTitles } = await sessionsModulePromise;
    fakeSelectRows = [{ title: "Rome" }, { title: "Rome" }];

    const result = await getUsedSessionTitles("user-1");
    expect(result.size).toBe(1);
    expect(result.has("Rome")).toBe(true);
  });
});

describe("getLongestRepoAssistantTurnDurationMs", () => {
  beforeEach(() => {
    fakeRepoTimingRows = [];
  });

  test("returns the longest assistant turn and ignores ask_user_question turns", async () => {
    const { getLongestRepoAssistantTurnDurationMs } =
      await sessionsModulePromise;

    fakeRepoTimingRows = [
      {
        chatId: "chat-1",
        id: "user-1",
        role: "user",
        parts: { id: "user-1", role: "user", parts: [] },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        chatId: "chat-1",
        id: "assistant-1",
        role: "assistant",
        parts: {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "Done." }],
        },
        createdAt: new Date("2026-01-01T00:00:05.000Z"),
      },
      {
        chatId: "chat-1",
        id: "user-2",
        role: "user",
        parts: { id: "user-2", role: "user", parts: [] },
        createdAt: new Date("2026-01-01T00:01:00.000Z"),
      },
      {
        chatId: "chat-1",
        id: "assistant-2",
        role: "assistant",
        parts: {
          id: "assistant-2",
          role: "assistant",
          parts: [
            { type: "text", text: "Question" },
            {
              type: "tool-ask_user_question",
              toolName: "ask_user_question",
            },
          ],
        },
        createdAt: new Date("2026-01-01T00:02:00.000Z"),
      },
      {
        chatId: "chat-2",
        id: "user-3",
        role: "user",
        parts: { id: "user-3", role: "user", parts: [] },
        createdAt: new Date("2026-01-01T00:03:00.000Z"),
      },
      {
        chatId: "chat-2",
        id: "assistant-3",
        role: "assistant",
        parts: {
          id: "assistant-3",
          role: "assistant",
          parts: [{ type: "text", text: "Longer reply." }],
        },
        createdAt: new Date("2026-01-01T00:03:20.000Z"),
      },
    ];

    expect(
      await getLongestRepoAssistantTurnDurationMs({
        userId: "user-1",
        repoOwner: "vercel",
        repoName: "open-harness",
      }),
    ).toBe(20_000);
  });

  test("returns null when no eligible assistant turn exists", async () => {
    const { getLongestRepoAssistantTurnDurationMs } =
      await sessionsModulePromise;

    fakeRepoTimingRows = [
      {
        chatId: "chat-1",
        id: "assistant-1",
        role: "assistant",
        parts: {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "tool-ask_user_question" }],
        },
        createdAt: new Date("2026-01-01T00:00:10.000Z"),
      },
    ];

    expect(
      await getLongestRepoAssistantTurnDurationMs({
        userId: "user-1",
        repoOwner: "vercel",
        repoName: "open-harness",
      }),
    ).toBeNull();
  });
});

describe("upsertChatMessageScoped", () => {
  beforeEach(() => {
    upsertMode = "inserted";
  });

  test("returns inserted when no existing row conflicts", async () => {
    const { upsertChatMessageScoped } = await sessionsModulePromise;
    upsertMode = "inserted";

    const result = await upsertChatMessageScoped({
      id: "message-1",
      chatId: "chat-1",
      role: "assistant",
      parts: { id: "message-1", role: "assistant", parts: [] },
    });

    expect(result.status).toBe("inserted");
  });

  test("returns updated when id exists in same chat and role", async () => {
    const { upsertChatMessageScoped } = await sessionsModulePromise;
    upsertMode = "updated";

    const result = await upsertChatMessageScoped({
      id: "message-1",
      chatId: "chat-1",
      role: "assistant",
      parts: { id: "message-1", role: "assistant", parts: [{ type: "text" }] },
    });

    expect(result.status).toBe("updated");
  });

  test("returns conflict when id exists for different chat/role scope", async () => {
    const { upsertChatMessageScoped } = await sessionsModulePromise;
    upsertMode = "conflict";

    const result = await upsertChatMessageScoped({
      id: "message-1",
      chatId: "chat-1",
      role: "assistant",
      parts: { id: "message-1", role: "assistant", parts: [{ type: "text" }] },
    });

    expect(result.status).toBe("conflict");
  });
});
