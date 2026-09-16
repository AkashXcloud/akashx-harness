# Agent Note: AkashX launcher and isolated Harness home

Status: implemented

English | [中文](2026-09-13-akashx-launcher-and-home.zh.md)

## Problem

The AkashX fork needs a distinct public command and user-data directory while retaining the upstream plugin graph for side-by-side comparison with the installed `akx` release.

## Decision

The fork exposes `akashx` from [`apps/cli/src/akashx.ts`](../../../../apps/cli/src/akashx.ts) and `apps/cli/package.json`; the existing `akx` entry remains available for comparison. Both entries use the same profile launcher, parser, bundle composition, shutdown, and plugin-management code.

The `akashx` entry sets `AKX_CLI_NAME=akashx` for app help and process diagnostics. When `AKX_HOME` is unset or blank, it sets that internal home override to `~/.akashx`; an explicit `AKX_HOME` remains authoritative. The `akx` entry keeps the normal `~/.akx` default.

Internal package names, bundle declarations, profile metadata keys, and `AKX_*` configuration names remain unchanged. The public executable name and default home are the only fork-specific bootstrap identifiers in this change.

This decision specializes the launcher-name and home facts in the [single akx application launcher note](2026-08-22-single-akx-application-launcher.md) for this fork without changing its profile-owned composition and lifecycle rules.

## Alternatives considered

**Rename every package and configuration identifier with the executable.** Rejected: the inherited bundle graph and profile metadata would require a broad coordinated migration before AkashX-specific capabilities are added.

**Remove `akx` from the fork.** Rejected: the installed `akx` release is the comparison baseline, and retaining the same entry in the fork makes behavior comparisons direct without altering the installed package.

**Add a second home-path implementation and new environment family.** Rejected: the launcher already accepts an explicit home override, so selecting `~/.akashx` at the AkashX entry avoids duplicate path resolution and preserves existing profile consumers.

## Consequences

Users can run AkashX with `akashx` and its default state stays under `~/.akashx`; an explicit `AKX_HOME` can point it at a test or deployment-specific home. The comparison `akx` path retains upstream command text and `~/.akx` behavior. Help, diagnostics, and model-visible launcher references use the selected entry name, while internal AKX package and configuration identifiers remain visible to the inherited composition. Focused source, built-entry, profile-dump, and application-entrypoint checks cover the two launch paths.
