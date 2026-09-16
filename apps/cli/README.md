# `akashx` CLI

English | [中文](README.zh.md)

The `akashx` command is the AkashX public Node application launcher: profiles are ordered stacks of plugin-bundle patch layers under the user's own overrides. The same checkout retains `akx` for comparison with the upstream installation; both commands use the same profile lifecycle. SDK and ACP are profiles, not separate public bins. The Python runtime wheel packages the upstream-compatible command; the SDK defaults to `sdk`, and the minimal example selects `sdk-minimal`. [`src/args.ts`](src/args.ts) owns the command grammar, and [`src/bin.ts`](src/bin.ts) loads only the selected runner. Invalid commands, options from another mode, configuration errors, and boot failures exit nonzero.

## Entry modes

| Command | Purpose |
|---|---|
| `akashx --profile <name>` | Boot the named profile under `$AKX_HOME/profiles/<name>`. |
| `akashx --profile <name> --from-default-profile <template>` | Create a new custom profile from a shipped template, then boot it. |
| `akashx --profile acp` | Serve automation clients over ACP stdio until disconnect. |
| `akashx --profile headless "job"` | Run one fresh persisted session, print the final answer, and exit. |
| `akashx --profile sdk` | Serve SDK clients over JSON-RPC stdio until shutdown or disconnect. |
| `akashx --profile sdk-minimal` | Serve SDK clients with the standalone minimal agent tree. |
| `akashx web` | Alias of `--profile web`. |
| `akashx plugin --profile <name> <pnpm args>` | Manage a profile's plugins by forwarding to pnpm in the profile directory. |

The AkashX launcher uses `~/.akashx` when `AKX_HOME` is unset or blank; an explicit `AKX_HOME` overrides that default. The invoking directory is the default workspace root. The `web`, `headless`, `sdk`, `sdk-minimal`, and `acp` profiles auto-initialize on first use from shipped templates. Create another profile at an unused, non-shipped name with `--from-default-profile`, or initialize a base-backed profile through `akashx plugin`. The `desktop` name is reserved for the Electron-owned profile, so the CLI rejects boot, config-dump, and plugin-management requests for it.

## App arguments

The launcher parses only its own flags and hands everything after them to the booted profile, where any injected app plugin may parse the shared immutable snapshot ([`akx-cmdline`](../../packages/boot/cmdline/README.md)). The first token the launcher does not recognize starts the app's arguments:

```sh
akashx --profile web --port 8080       # --port belongs to the web app
akashx --profile tui --resume <id>     # example, assuming the tui profile is installed; --resume belongs to the terminal app
akashx --profile headless "run the tests"
akashx --profile web --help            # the web app's flags, not the launcher's
akashx --help                          # the launcher's own help
```

<a id="profiles"></a>
## Profiles

A profile directory holds a `package.json` (out-of-tree plugin dependencies plus the profile manifest `akx.profile` with its ordered `bundles` list and `patchReload` lifecycle) and a `cordis.patch.yml` (the user's own patch layer). `patchReload: live` watches the profile and home-level patch files; `startup` applies them once.

The tree composes over an empty root:
- each bundle's patch in `akx.profile.bundles` order
- then the profile's `cordis.patch.yml`, then the home-level `$AKX_HOME/cordis.patch.yml`
- then `--patch` overlays

Bundles named in `akx.profile.bundles` resolve from the AkashX installation first (`@akashx/akx-base`, `@akashx/akx-web-app`, `@akashx/akx-headless`, `@akashx/akx-sdk-app`, `@akashx/akx-sdk-minimal`, `@akashx/akx-acp-app`), then from the profile's own `node_modules`, where pnpm installs out-of-tree plugins.

Use `--dump-default-config` and `--dump-config` to inspect the composed tree without booting it.

The [CLI behavior reference](reference/README.md) owns exact layer precedence, flags, shutdown behavior, deployment defaults, and source execution.

## Optional overlays

`config/examples/` ships opt-in overlays for GitHub review webhooks, session-local Schedule, memory MCP servers, and runtime Cordis tools. They are never part of a default profile; the [user guides](../../docs/user/guide/index.md) and [developer practice guides](../../docs/user/develop/practice/index.md) own setup and safety instructions.

## Development

Production runs require built package and frontend artifacts. From the repository root, run `pnpm run build` separately, then use `pnpm akashx <args...>` to run the AkashX TypeScript entry and forward every argument; the [source-execution reference](reference/README.md#source-execution) owns the module-resolution contract.
