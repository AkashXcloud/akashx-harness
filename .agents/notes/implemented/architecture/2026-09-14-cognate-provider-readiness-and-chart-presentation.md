# Agent Note: Cognate provider readiness and chart presentation

Status: implemented

English | [中文](2026-09-14-cognate-provider-readiness-and-chart-presentation.zh.md)

## Problem

Cognate mode advertised AkashXDB capabilities that had no configured backend. The MySQL provider reported only a generic "configured Cognate provider is unavailable", so a reader could not tell whether the provider was missing, misconfigured, or the database was unreachable. `render_chart` described itself as consuming data "already returned by `run_sql`", which made a deterministic presentation tool unreachable whenever no database provider was configured. The chart tool returned structured presentation metadata that no client rendered, so nothing appeared visually.

## Decision

The Cognate tool prompt reports whether the selected provider is available. A provider supplies an actionable unavailable reason where it has one — the MySQL provider names the missing `AKASHXDB_URL` setting — and the runtime includes that reason in a failed execution instead of a generic unavailable diagnostic.

`render_chart` accepts explicitly supplied bounded rows and never executes SQL, so the deterministic chart capability is usable without any database provider.

The Web Tool card renders a chart Tool call's persisted presentation metadata as a native SVG chart. Chart presentation therefore depends on neither a database provider nor a third-party browser chart package.

## Alternatives considered

**A third-party browser charting library was rejected.** A native SVG renderer covers the persisted presentation metadata the tool produces, and adding a browser dependency would grow the client bundle for no capability the tool's own contract requires.

**Requiring `run_sql` before `render_chart` was rejected.** Coupling a deterministic presentation tool to a configured database makes it unreachable in exactly the deployments that can still render supplied rows.

**Recording the missing renderer as a known limitation was rejected.** The tool already persisted complete presentation metadata, so the visible gap was a missing consumer rather than an absent capability.

## Consequences

Provider readiness is model-visible, so the model can explain an unconfigured database instead of presenting capabilities it cannot execute. `render_chart` is usable independently of any provider. The chart card owns its own SVG layout and styling, so it inherits theme tokens like every other Tool card and adds no browser runtime dependency. Real AkashXDB execution still requires a reachable deployment, credentials, and `AKASHXDB_URL`.

## Testing

Focused provider, tool, and client tests cover the actionable unavailable diagnostic, the SQL-free chart acceptance path, and the SVG chart card rendering. The keyless Web replay suite covers the assembled client.
