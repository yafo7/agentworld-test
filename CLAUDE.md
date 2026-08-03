# Historical Claude Guidance

Status: retired and non-authoritative.

This path is retained only as a compatibility marker for tools and people that
still look for `CLAUDE.md`. Do not recover product, architecture, API, Ghost
Home, or development instructions from earlier revisions of this file.

Use the following sources instead:

1. `AGENTS.md` for binding repository rules and the implemented product
   baseline.
2. `docs/architecture.md` for the current system map, dependency rules, and
   lifecycle contracts.
3. The smallest relevant `.agents/skills/chii-*` skill for domain workflows.
4. `api-reference.md` only for the backend API snapshot identified by that
   document's provenance.

## Security Notice

An older revision of this file contained a plaintext credential. The credential
must be treated as compromised and revoked or rotated outside this repository.
The current working tree intentionally contains no credential value.

Removing a value from the working tree does not remove it from Git history.
History rewriting and any required force push are separate, coordinated
operations and must not be performed as part of ordinary repository cleanup.
