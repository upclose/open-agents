import { describe, expect, test } from "bun:test";
import type {
  AskUserQuestionInput,
  AskUserQuestionOutput,
} from "./ask-user-question";
import { createAskUserQuestionTool } from "./ask-user-question";

const input: AskUserQuestionInput = {
  questions: [
    {
      question: "Which branch should I target?",
      header: "Branch",
      options: [
        {
          label: "main (Recommended)",
          description: "Use the primary branch for the update.",
        },
        {
          label: "release",
          description: "Target the current release branch instead.",
        },
      ],
      multiSelect: false,
    },
  ],
};

describe("createAskUserQuestionTool", () => {
  test("returns needs-attention output in unattended mode", async () => {
    const toolInstance = createAskUserQuestionTool({ unattended: true }) as {
      execute?: (value: AskUserQuestionInput) => Promise<AskUserQuestionOutput>;
    };

    expect(toolInstance.execute).toBeDefined();

    const result = await toolInstance.execute?.(input);

    expect(result).toEqual({
      automationNeedsAttention: true,
      questions: input.questions,
    });
  });

  test("renders a useful automation handoff message", () => {
    const toolInstance = createAskUserQuestionTool({ unattended: true }) as {
      toModelOutput?: (value: { output: AskUserQuestionOutput }) => {
        type: string;
        value: string;
      };
    };

    const output = toolInstance.toModelOutput?.({
      output: {
        automationNeedsAttention: true,
        questions: input.questions,
      },
    });

    expect(output?.type).toBe("text");
    expect(output?.value).toContain("cannot ask the user questions");
    expect(output?.value).toContain("Summarize exactly what needs attention");
  });
});
