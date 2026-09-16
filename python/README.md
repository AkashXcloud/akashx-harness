# AkashX Harness Python SDK

English | [中文](README.zh.md)

Python packages for driving AkashX Harness as a subprocess. The client SDK communicates with the bundled runtime over newline-delimited JSON-RPC on stdio.

## Packages

| Directory | Dist / module | Role |
|---|---|---|
| [sdk](sdk/README.md) | `akx-harness-sdk` / `akx_harness` | High-level turns API and lower-level JSON-RPC client |
| [sdk-runtime](sdk-runtime/README.md) | `akx-harness-runtime-bin` / `akx_harness_runtime` | Bundled `akx` CLI executable and native sidecars |

## Behavior

The SDK starts the matching bundled `akx --profile sdk` runtime unless the caller selects another `akx` executable or profile. The runnable minimal example selects the shipped standalone `sdk-minimal` profile; the same runtime also packages `akx web` and its frontend assets for separate CLI use. Every launch requires an explicitly selected Harness home; Python never silently reads `~/.akx`. The [SDK reference](sdk/README.md) and [runtime carrier reference](sdk-runtime/README.md) own runtime selection, profiles, patches, and external plugin management.

## Contributor workflows

The [Python contributor workflows](development.md) cover building runtime artifacts, validating the packages, source-mode development, and distribution.
