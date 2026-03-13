/** Tool descriptions for system prompt */
const toolDescriptions: Record<string, string> = {
  read: "Read file contents",
  bash: "Execute bash commands (ls, grep, find, etc.)",
  edit: "Make surgical edits to files (find exact text and replace)",
  write: "Create or overwrite files",
  grep: "Search file contents for patterns (respects .gitignore)",
  find: "Find files by glob pattern (respects .gitignore)",
  ls: "List directory contents",
};

export interface Skill {
  name: string;
  description: string;
  location?: string;
  userInvocable?: boolean;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }

  const hasLocations = skills.some(
    (skill) =>
      typeof skill.location === "string" && skill.location.trim().length > 0,
  );

  const formatted = skills
    .map((skill) => {
      const lines = [
        "  <skill>",
        `    <name>${escapeXml(skill.name)}</name>`,
        `    <description>${escapeXml(skill.description)}</description>`,
      ];

      if (
        typeof skill.location === "string" &&
        skill.location.trim().length > 0
      ) {
        lines.push(`    <location>${escapeXml(skill.location)}</location>`);
      }

      if (skill.userInvocable === false) {
        lines.push("    <user_invocable>false</user_invocable>");
      }

      lines.push("  </skill>");

      return lines.join("\n");
    })
    .join("\n");

  const guidance = hasLocations
    ? [
        "The following skills provide specialized instructions for specific tasks.",
        "When a skill includes <location>, use the read tool to inspect that file when the task matches its description.",
        "When a skill file references a relative path, resolve it against the skill directory (the parent directory of <location>).",
      ].join("\n")
    : "The following skills provide specialized instructions for specific tasks.";

  return `\n\n## Skills\n\n${guidance}\n\n<available_skills>\n${formatted}\n</available_skills>\n`;
}

export interface BuildSystemPromptOptions {
  /** Custom system prompt (replaces default). */
  customPrompt?: string;
  /** Tools to include in prompt. Default: [read, bash, edit, write] */
  selectedTools?: string[];
  /** Optional one-line tool snippets keyed by tool name. */
  toolSnippets?: Record<string, string>;
  /** Additional guideline bullets appended to the default system prompt guidelines. */
  promptGuidelines?: string[];
  /** Text to append to system prompt. */
  appendSystemPrompt?: string;
  /** Working directory. Default: process.cwd() */
  cwd?: string;
  /** Pre-loaded context files. */
  contextFiles?: Array<{ path: string; content: string }>;
  /** Pre-loaded skills. Include location to let the agent inspect skill files. */
  skills?: Skill[];
}

/** Build the system prompt with tools, guidelines, and context */
export function buildSystemPrompt(
  options: BuildSystemPromptOptions = {},
): string {
  const {
    customPrompt,
    selectedTools,
    toolSnippets,
    promptGuidelines,
    appendSystemPrompt,
    cwd,
    contextFiles: providedContextFiles,
    skills: providedSkills,
  } = options;
  const resolvedCwd = cwd ?? process.cwd();

  const now = new Date();
  const dateTime = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });

  const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";

  const contextFiles = providedContextFiles ?? [];
  const skills = providedSkills ?? [];

  if (customPrompt) {
    let prompt = customPrompt;

    if (appendSection) {
      prompt += appendSection;
    }

    if (contextFiles.length > 0) {
      prompt += "\n\n# Project Context\n\n";
      prompt += "Project-specific instructions and guidelines:\n\n";
      for (const { path: filePath, content } of contextFiles) {
        prompt += `## ${filePath}\n\n${content}\n\n`;
      }
    }

    const customPromptHasRead =
      !selectedTools || selectedTools.includes("read");
    if (customPromptHasRead && skills.length > 0) {
      prompt += formatSkillsForPrompt(skills);
    }

    prompt += `\nCurrent date and time: ${dateTime}`;
    prompt += `\nCurrent working directory: ${resolvedCwd}`;

    return prompt;
  }

  const tools = selectedTools || ["read", "bash", "edit", "write"];
  const toolsList =
    tools.length > 0
      ? tools
          .map((name) => {
            const snippet =
              toolSnippets?.[name] ?? toolDescriptions[name] ?? name;
            return `- ${name}: ${snippet}`;
          })
          .join("\n")
      : "(none)";

  const guidelinesList: string[] = [];
  const guidelinesSet = new Set<string>();
  const addGuideline = (guideline: string): void => {
    if (guidelinesSet.has(guideline)) {
      return;
    }
    guidelinesSet.add(guideline);
    guidelinesList.push(guideline);
  };

  const hasBash = tools.includes("bash");
  const hasEdit = tools.includes("edit");
  const hasWrite = tools.includes("write");
  const hasGrep = tools.includes("grep");
  const hasFind = tools.includes("find");
  const hasLs = tools.includes("ls");
  const hasRead = tools.includes("read");

  if (hasBash && !hasGrep && !hasFind && !hasLs) {
    addGuideline("Use bash for file operations like ls, rg, find");
  } else if (hasBash && (hasGrep || hasFind || hasLs)) {
    addGuideline(
      "Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)",
    );
  }

  if (hasRead && hasEdit) {
    addGuideline(
      "Use read to examine files before editing. You must use this tool instead of cat or sed.",
    );
  }

  if (hasEdit) {
    addGuideline("Use edit for precise changes (old text must match exactly)");
  }

  if (hasWrite) {
    addGuideline("Use write only for new files or complete rewrites");
  }

  if (hasEdit || hasWrite) {
    addGuideline(
      "When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did",
    );
  }

  for (const guideline of promptGuidelines ?? []) {
    const normalized = guideline.trim();
    if (normalized.length > 0) {
      addGuideline(normalized);
    }
  }

  addGuideline("Be concise in your responses");
  addGuideline("Show file paths clearly when working with files");

  const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

  let prompt = `You are a durable coding agent focused on long-running, autonomous execution. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
${toolsList}

Guidelines:
${guidelines}`;

  if (appendSection) {
    prompt += appendSection;
  }

  if (contextFiles.length > 0) {
    prompt += "\n\n# Project Context\n\n";
    prompt += "Project-specific instructions and guidelines:\n\n";
    for (const { path: filePath, content } of contextFiles) {
      prompt += `## ${filePath}\n\n${content}\n\n`;
    }
  }

  if (hasRead && skills.length > 0) {
    prompt += formatSkillsForPrompt(skills);
  }

  prompt += `\nCurrent date and time: ${dateTime}`;
  prompt += `\nCurrent working directory: ${resolvedCwd}`;

  return prompt;
}
