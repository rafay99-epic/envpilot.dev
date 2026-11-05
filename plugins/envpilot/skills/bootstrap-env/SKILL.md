---
name: bootstrap-env
description: Get a checkout running when .env is missing, by pulling the project's environment variables from Envpilot. Use when a dev server, test run or build fails on an undefined environment variable, after cloning a repo or creating a git worktree, or when the user asks to set up, restore or refresh a local .env file.
argument-hint: "[environment]"
allowed-tools: Bash, Read, Write
---

# Bootstrap an environment from Envpilot

A fresh clone, a new git worktree and a new container all have the same
problem: `.env` and `.env.local` are gitignored, so the code is there and the
configuration is not. This skill fills that gap from Envpilot.

## The rule that matters

**Prefer the path where you never see the values.** A secret you read becomes
part of the transcript, and transcripts get summarized, logged and pasted into
issues. The CLI injects variables into a child process or writes the file
itself, so the values never pass through you. Use it when it is available.

Only read values through the MCP tools when there is no CLI, and even then do
not echo them, summarize them, put them in a commit message, or repeat them
back to the user. Report key names and counts instead.

## Step 1: find out what you can reach

Call `envpilot_whoami`. It returns the signed-in account, every organization
available to it, the plan, and every project with its **protected**
environments. Read it before anything else, because it answers three questions
at once: which organization slug to pass, which project this repo is, and
whether a write would apply or become a change request.

Match the repo to a project by comparing the repository directory name, the
`name` field in `package.json`, or the git remote against the project slugs. If
two or more look plausible, ask the user rather than guessing. Pulling the
wrong project's production values into a local file is worse than asking.

If `envpilot_whoami` is not available, the MCP server is not connected. Tell
the user to run:

```bash
claude mcp add --transport http envpilot https://www.envpilot.dev/api/mcp
```

then `/mcp` and **Authenticate**. The sign-in happens in a browser, so it
cannot be automated.

## Step 2: pick the environment

Default to `development`. Use `staging` or `production` only when the user
says so. If the target environment appears in that project's
`protectedEnvironments`, say so before writing anything: reads are fine, but
any change you propose there becomes a change request a second person
approves.

## Step 3a: the CLI path, preferred

Check for it:

```bash
command -v envpilot
```

If present, the best outcome is not writing a file at all. Running the command
with the environment injected leaves nothing on disk:

```bash
envpilot run -- <the project's dev command>
```

When a file is genuinely needed, for a tool that reads `.env` directly:

```bash
envpilot pull
```

If the CLI reports that the directory is not linked, link it once:

```bash
envpilot init
```

That writes `.envpilot`, which records the project and organization and holds
no secrets.

## Step 3b: the MCP path, fallback

Without the CLI, call `envpilot_get_variables` with the project slug and
environment, then write the file with the Write tool.

Two things to get right:

- **Quote every value.** Write `KEY='value'`, escaping an embedded single
  quote as `'\''`. An unquoted value containing a space, `#`, `$` or a
  backtick breaks or, worse, gets executed by whatever sources the file.
- **Check the count.** If the response reports keys it could not read, the
  file is incomplete. Say which keys are missing and that a project member
  has to grant access. Do not write a partial file and report success.

Write to `.env.local` when the framework prefers it (Next.js, Vite), otherwise
`.env`. Confirm the path is gitignored before writing. If it is not, add it.

## Step 4: confirm, without leaking

Verify by running the thing that was failing, not by printing the file. Report
how many variables were written and to which path. If a variable the code
needs is still missing, name the key and offer to file it with
`envpilot_create_variable`, which becomes a change request on a protected
environment.

## What not to do

Do not commit the file you just wrote. Do not paste values into a PR
description, a commit message or an issue. Do not copy them into another file
"as a backup". Do not read a production environment because development was
missing a key; ask first.
