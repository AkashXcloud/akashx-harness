# Agent Note: AkashX Web dressing, Database settings, and Session deletion

Status: implemented

English | [中文](2026-09-14-akashx-web-dressing-database-and-session-deletion.zh.md)

## Problem

The AkashX Web client needs a single branded presentation, a visible entry point for Cognate's semantic-model capability, and a complete way to remove Sessions. The browser must not invent database connectivity, and deleting a Session must remove durable history rather than merely hiding a row.

## Decision

The Web theme applies AkashX purple-and-white aliases in light mode and deep navy aliases in dark mode through the existing `ui-theme` token sheet. The official brand plugin renders an AkashX mark and name without adding a second client composition mechanism.

`ui-settings-general` registers a `settings.section` entry with id `database`. The page is a read-only status view: Host-owned Cognate configuration remains authoritative, credentials never enter browser state, and an unavailable backend is shown with the `AKASHXDB_URL` correction. The page does not execute SQL or claim that semantic assets are available.

Session deletion is one Host Remote command. The command disposes a live Agent through the `AgentHandle` its controller retained, removes the Session through `SessionPersistence.remove()`, detaches it from every Workspace, and returns a durable success result. Agent teardown must be the handle's own `dispose()`, which awaits the loop's reverse teardown and closes the Session write handle; disposing the agent's context fiber returns earlier and leaves the writer registered. The JSONL provider still refuses deletion while a writer is active, removes the complete generation directory, and clears its read caches. The Client Session manager projects the removal, clears persisted selection when the deleted Session was current, and the Workspace browser requires confirmation before invoking the command.

Capability demonstrations use the existing native Harness loop and keyless task/thread fixtures, including the Agent Team headless scenario and Web replay suite. No second router, demo framework, or database client is introduced.

## Alternatives considered

**A separate AkashX theme package was rejected.** The existing theme owns global aliases and lifecycle-managed styles, so a second theme package would duplicate token ownership and load ordering.

**A browser database connection was rejected.** Cognate providers and credentials belong to the Host; a browser connection would expose deployment details and bypass the provider readiness diagnostic.

**Row hiding instead of deletion was rejected.** Archive already owns reversible hiding. Session deletion must remove durable history and Workspace membership, so it is a distinct confirmed operation.

**A second task or thread runtime was rejected.** Existing Harness task admission, Session logging, Agent Team, and replay fixtures already exercise individual and delegated work through the supported loop.

## Consequences

AkashX branding is expressed through shared semantic aliases, so existing components inherit the visual treatment without per-component color literals. The Database page can honestly report an unavailable deployment but does not provide a configuration editor. Deletion is permanent, applies to an open Session as well as a cold one, and reports a remote failure instead of silently removing a row.

## Testing

Focused client and persistence tests cover the Database registration, Session menu dispatch, JSONL artifact removal, and generated Remote surface. `pnpm run test:gui`, `pnpm run build`, and the keyless Web replay suite cover the assembled client and native task/thread paths. Real AkashXDB execution remains deployment-dependent on `AKASHXDB_URL` and reachable credentials.
