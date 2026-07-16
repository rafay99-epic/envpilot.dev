# AGENTS.md

**Single source of truth: [`CLAUDE.md`](./CLAUDE.md).** Read it fully and
follow every rule in it — branching/PR workflow, never starting the dev
server, CLI sandbox isolation, testing policy, the CircleCI pipeline, the
feature-registry/tier-gating patterns, versioning + release-manifest rules,
per-environment variable-key uniqueness, the ConvexError requirement, and
the no-AI-attribution rule.

This file intentionally contains no duplicated content: two instruction
files drift apart and end up contradicting each other, which misleads
whichever agent reads the stale copy. If you are an agent that only reads
`AGENTS.md`, treat the entirety of `CLAUDE.md` as if it were written here.
