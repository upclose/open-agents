# [Template Name]

**Published:** [Date] | **Authors:** [Authors] | **Category:** Templates

*An open-source template for running coding agents in the cloud.*

---

Background coding agents — agents that clone a repo, spin up an environment, write code, run tests, and open a pull request — are becoming core infrastructure for engineering teams. Ramp [built their own from scratch](https://builders.ramp.com/post/why-we-built-our-background-agent). So have several other companies we work with. Each one spent months building the same foundational pieces: sandboxed execution, a tool layer for file operations and shell access, git automation, context management for long-running sessions.

[Template Name] is an open-source Next.js template that gives you all of those pieces. Deploy it on Vercel, connect a GitHub repo, and you have a working background agent that your team can use immediately and customize for your own workflows.

It's built on the [AI SDK](https://ai-sdk.dev), runs on [Vercel's sandbox infrastructure](https://vercel.com/docs/sandboxes), and the entire codebase is MIT-licensed.

## Agent runtime

The agent is a structured tool-calling loop, not a single prompt-and-pray interaction. It has access to a set of tools that mirror what an engineer actually uses: reading and writing files, executing shell commands, searching code with regex, finding files by pattern, fetching web content, and managing a todo list to track multi-step work.

The system prompt encodes specific engineering practices. The agent is instructed to always read a file before editing it, prefer targeted searches over serial file reading, run the project's own test and build scripts rather than generic commands, detect the package manager from lockfiles, and re-run verification after every change until checks pass. These aren't suggestions — they're hard constraints in the prompt that shape how the agent approaches every task.

There's a verification loop baked into the workflow: after each code change, the agent runs typecheck, lint, tests, and build in order. If something fails, it fixes the issue and re-runs. It doesn't move on with failing checks, and it doesn't claim code is working without running a verification command.

## Sandboxed execution

Each agent session runs in its own isolated sandbox with a full runtime environment — Node.js, Bun, git, and package managers. The sandbox provides filesystem operations, process execution with timeout controls, and network endpoint mapping so agents can start dev servers and interact with them.

The sandbox abstraction is provider-based. The current implementation runs on Vercel's sandbox infrastructure, but the interface is defined separately from the implementation, so you can swap in your own provider. What matters is the contract: file I/O, shell execution, snapshotting, and lifecycle management.

Lifecycle management handles the operational complexity that makes background agents hard to run reliably. Sandboxes move through defined states — provisioning, active, hibernating, hibernated, restoring, archived, failed. Inactivity timeouts trigger hibernation automatically, and the system takes a snapshot before hibernating so the sandbox can be restored exactly where it left off. Snapshot operations are idempotent — if a snapshot is already in progress, the system detects it and avoids conflicts rather than failing.

## Multi-agent delegation

A single agent trying to do everything — analyze a codebase, implement changes, design UI — tends to lose focus on long tasks. The template uses a delegation model with specialized subagents.

The primary agent can spawn three types of subagents: an **explorer** for read-only codebase analysis and architecture tracing, an **executor** for scoped implementation work like edits and refactors, and a **designer** for building frontend interfaces. Each subagent runs autonomously for up to 100 tool steps, then returns a summary to the primary agent.

This maps to how engineering work actually gets done. You don't context-switch between reading code, writing code, and designing UI in the same mental mode. The subagent model lets the primary agent stay focused on orchestration while specialists handle execution.

## Git automation

The agent can commit and push its work automatically. The auto-commit flow detects dirty files, generates a conventional commit message using Claude Haiku (constrained to one line, 72 characters max, with the diff truncated to 8,000 characters as input), sets the git author from the linked GitHub account, and pushes to the branch.

Auto-PR creation has more guardrails. It rejects detached HEAD states and validates branch names against a safety pattern. It checks that the local branch is fully pushed to the remote before creating the PR. If a PR already exists for the branch, it reuses it instead of creating a duplicate. It handles race conditions — if two processes try to create the same PR simultaneously, it catches the conflict and falls back to the existing one.

PR titles and descriptions are generated from the diff, giving reviewers context on what changed and why without manual write-ups.

## Context management

Background agents run longer than interactive chat sessions, which means they hit context window limits. The template includes a context management layer with cache control policies and aggressive compaction — trimming and summarizing earlier parts of the conversation to keep the working context within the model's token budget.

The system prompt itself is designed for context efficiency. It instructs the agent to stop exploring once it has enough information to act, prefer targeted searches over broad exploration, and early-exit from investigation as soon as exact files and symbols are identified.

## Skills

The agent supports a skills system for adding capabilities without modifying the core runtime. Skills are discoverable modules with metadata — each declares whether it can be invoked by the model, the user, or both. The system prompt dynamically lists available skills, and the agent invokes them when relevant.

This is the extension point for teams that want to add domain-specific behavior: internal API integrations, custom deployment workflows, compliance checks, or anything else that doesn't belong in the core tool layer.

## Getting started

Clone the repo, run `bun install`, link your Vercel project, and start the dev server. The setup script pulls environment variables and configures OAuth for Vercel and GitHub. Once running, you have a full background agent interface — create a session, point it at a repo, give it a task, and review the output as commits and pull requests.

The template is designed to be forked and customized. Swap out the model provider, add tools for your internal systems, change the system prompt to match your team's engineering practices, or replace the sandbox provider entirely.

[Deploy on Vercel →](#) | [View on GitHub →](#)
