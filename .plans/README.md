# .plans — Designed-but-deferred feature plans

Execution-ready designs for features intentionally deferred so the core stays
lean and stable. Each folder is a self-contained plan: the current-state model,
the design with every node, the edge-case matrix, and a phased execution plan a
future engineer (or agent) can pick up cold.

These are **committed** (unlike `.frugal-fable/`, which is gitignored scratch).

## Index

- [access-revocation/](access-revocation/) — Granular access revocation
  (account / project / environment) with RBAC opt-in cascade and real-time
  propagation to CLI + VS Code extension. **Status: designed, not started.**
  Decisions locked with the product owner. Build AFTER Stage 3 (Vault → Convex).
